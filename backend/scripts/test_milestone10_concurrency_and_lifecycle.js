/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone10Tests() {
  const connectionString = 'postgresql://postgres:YOUR_DB_PASSWORD@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres';

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 10: FINAL SECURITY, CONCURRENCY & LIFECYCLE TESTS ===\n');

  // Fetch test users
  const usersRes = await client.query(`
    SELECT id, email, full_name, campus, is_admin, is_suspended, is_banned 
    FROM public.profiles 
    ORDER BY created_at ASC
    LIMIT 6;
  `);

  if (usersRes.rows.length < 4) {
    console.error('Need at least 4 users for full lifecycle and concurrency tests.');
    await client.end();
    return;
  }

  const user1 = usersRes.rows[0]; // Primary Requester
  const user2 = usersRes.rows[1]; // Primary Fulfiller
  const user3 = usersRes.rows[2]; // Competitor / Outsider
  const user4 = usersRes.rows[3]; // Competitor 2

  // Reset baseline: all onboarded, active, and on the same campus
  const testCampus = 'Vishnu Educational Society';
  await client.query(`
    UPDATE public.profiles 
    SET is_onboarded = true, is_suspended = false, is_banned = false, campus = $5
    WHERE id IN ($1, $2, $3, $4);
  `, [user1.id, user2.id, user3.id, user4.id, testCampus]);

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // Helper to run query as authenticated user
  async function runAsUser(c, userId, queryText, params = []) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    try {
      return await c.query(queryText, params);
    } finally {
      await c.query("RESET ROLE;");
      await c.query("SELECT set_config('request.jwt.claim.sub', '', false);");
    }
  }

  // =============================================================
  // PART 1: COMPLETE END-TO-END WORKFLOW LIFECYCLE
  // =============================================================
  console.log('--- PART 1: End-to-End Workflow Lifecycle (Sign in -> Onboard -> Request -> Accept -> Chat -> Confirm -> Complete -> Rate -> History) ---');

  // 1. User 1 creates request
  const reqRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, note, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 350.00, 'Central Canteen Front Desk', 'Need 350 cash urgently', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, testCampus]);
  const lifecycleReqId = reqRes.rows[0].id;
  assert(lifecycleReqId !== undefined, 'Step 1: User 1 created OPEN exchange request for ₹350');

  // 2. User 2 accepts request via atomic RPC
  const acceptRes = await runAsUser(
    client,
    user2.id,
    "SELECT public.accept_exchange_request($1) as result;",
    [lifecycleReqId]
  );
  const acceptResult = acceptRes.rows[0].result;
  console.log('acceptResult:', acceptResult);
  assert(
    acceptResult.success === true && acceptResult.trade_id !== undefined,
    'Step 2: User 2 accepted request; trade created atomically'
  );
  const tradeId = acceptResult.trade_id;

  // 3. Verify request is now ACCEPTED and trade is IN_PROGRESS
  const reqCheck = await client.query('SELECT status FROM public.exchange_requests WHERE id = $1;', [lifecycleReqId]);
  const tradeCheck = await client.query('SELECT status, amount, requester_id, fulfiller_id FROM public.trades WHERE id = $1;', [tradeId]);
  assert(
    reqCheck.rows[0].status === 'ACCEPTED' &&
    tradeCheck.rows[0].status === 'IN_PROGRESS' &&
    Number(tradeCheck.rows[0].amount) === 350 &&
    tradeCheck.rows[0].requester_id === user1.id &&
    tradeCheck.rows[0].fulfiller_id === user2.id,
    'Step 3: Database state verified (request=ACCEPTED, trade=IN_PROGRESS with correct participants)'
  );

  // 4. In-trade private chat exchange
  await runAsUser(
    client,
    user1.id,
    "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3);",
    [tradeId, user1.id, 'Hi, I am wearing a blue jacket near the canteen entrance.']
  );
  await runAsUser(
    client,
    user2.id,
    "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3);",
    [tradeId, user2.id, 'Great, I have ₹350 cash in hand. See you in 2 mins.']
  );
  const msgs = await runAsUser(
    client,
    user1.id,
    "SELECT message, sender_id FROM public.trade_messages WHERE trade_id = $1 ORDER BY created_at ASC;",
    [tradeId]
  );
  assert(
    msgs.rows.length === 2 && msgs.rows[0].sender_id === user1.id && msgs.rows[1].sender_id === user2.id,
    'Step 4: Realtime chat exchange verified between participants'
  );

  // 5. Two-Sided Settlement: User 1 confirms first
  const conf1 = await runAsUser(
    client,
    user1.id,
    "SELECT public.confirm_trade_settlement($1) as result;",
    [tradeId]
  );
  assert(
    conf1.rows[0].result.success === true &&
    conf1.rows[0].result.completed === false &&
    conf1.rows[0].result.status === 'IN_PROGRESS' &&
    conf1.rows[0].result.requester_confirmed === true,
    'Step 5: Requester confirmed received cash; trade safely awaits fulfiller confirmation'
  );

  // 6. Two-Sided Settlement: User 2 confirms second -> trade COMPLETED
  const conf2 = await runAsUser(
    client,
    user2.id,
    "SELECT public.confirm_trade_settlement($1) as result;",
    [tradeId]
  );
  assert(
    conf2.rows[0].result.success === true &&
    conf2.rows[0].result.completed === true &&
    conf2.rows[0].result.status === 'COMPLETED',
    'Step 6: Fulfiller confirmed received UPI; trade atomically completed!'
  );

  // 7. Post-completion ratings: Both rate each other
  const rate1 = await runAsUser(
    client,
    user1.id,
    "SELECT public.submit_trade_rating($1, 5, 'Smooth and prompt exchange!') as result;",
    [tradeId]
  );
  assert(
    rate1.rows[0].result.success === true && rate1.rows[0].result.rating === 5,
    'Step 7a: Requester submitted 5-star rating for fulfiller'
  );

  const rate2 = await runAsUser(
    client,
    user2.id,
    "SELECT public.submit_trade_rating($1, 5, 'Quick UPI payment verification.') as result;",
    [tradeId]
  );
  assert(
    rate2.rows[0].result.success === true && rate2.rows[0].result.rating === 5,
    'Step 7b: Fulfiller submitted 5-star rating for requester'
  );

  // 8. Reputation metrics verified on both profiles
  const p1 = await client.query('SELECT rating_avg, total_ratings FROM public.profiles WHERE id = $1;', [user1.id]);
  const p2 = await client.query('SELECT rating_avg, total_ratings FROM public.profiles WHERE id = $1;', [user2.id]);
  assert(
    Number(p1.rows[0].rating_avg) > 0 && p1.rows[0].total_ratings > 0 &&
    Number(p2.rows[0].rating_avg) > 0 && p2.rows[0].total_ratings > 0,
    'Step 8: Reputation averages and review counts updated on both student profiles'
  );

  // =============================================================
  // PART 2: CRITICAL CONCURRENCY TEST
  // =============================================================
  console.log('\n--- PART 2: Critical Concurrency Test (Simultaneous Accept Race Against 1 Request) ---');

  // Create an OPEN request
  const concReqRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'HAVE_CASH_WANT_UPI', 400.00, 'Hostel 3 Gate', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, testCampus]);
  const concReqId = concReqRes.rows[0].id;

  // Launch 4 simultaneous accept calls from separate clients across users (user2, user3, user4, user2 repeat)
  const client2 = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const client3 = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const client4 = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await Promise.all([client2.connect(), client3.connect(), client4.connect()]);

  const attempts = await Promise.all([
    runAsUser(client, user2.id, "SELECT public.accept_exchange_request($1) as result;", [concReqId]),
    runAsUser(client2, user3.id, "SELECT public.accept_exchange_request($1) as result;", [concReqId]),
    runAsUser(client3, user4.id, "SELECT public.accept_exchange_request($1) as result;", [concReqId]),
    runAsUser(client4, user2.id, "SELECT public.accept_exchange_request($1) as result;", [concReqId]),
  ]);

  await Promise.all([client2.end(), client3.end(), client4.end()]);

  const results = attempts.map(a => a.rows[0].result);
  const successCount = results.filter(r => r.success === true).length;
  const failureCount = results.filter(r => r.success === false).length;

  assert(
    successCount === 1 && failureCount === 3,
    `Concurrency race: Exactly 1 succeeded (${successCount}) and 3 failed safely (${failureCount})`
  );

  // Verify exactly ONE trade row was created in trades table
  const concTrades = await client.query('SELECT id, fulfiller_id FROM public.trades WHERE request_id = $1;', [concReqId]);
  assert(
    concTrades.rows.length === 1,
    `Database consistency: Exactly 1 trade row exists for request (trade ${concTrades.rows[0]?.id.slice(0, 8)})`
  );

  // =============================================================
  // PART 3: EDGE CASES & CONSTRAINT TESTING
  // =============================================================
  console.log('\n--- PART 3: Edge Cases & Security Boundary Testing ---');

  // 1. ₹19 request value rejected
  let underMinRejected = false;
  try {
    await client.query(`
      INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 19.00, 'Spot', 'Main Campus', NOW() + INTERVAL '1 hour');
    `, [user1.id]);
  } catch (err) {
    underMinRejected = true;
  }
  assert(underMinRejected, 'Edge case: ₹19 request rejected by database amount constraint (amount >= 20.00)');

  // 2. ₹501 request value rejected
  let overMaxRejected = false;
  try {
    await client.query(`
      INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 501.00, 'Spot', 'Main Campus', NOW() + INTERVAL '1 hour');
    `, [user1.id]);
  } catch (err) {
    overMaxRejected = true;
  }
  assert(overMaxRejected, 'Edge case: ₹501 request rejected by database amount constraint (amount <= 500.00)');

  // 3. User cannot accept their own request
  const ownReqRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 150.00, 'Spot', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, testCampus]);
  const ownReqId = ownReqRes.rows[0].id;

  const resSelfAccept = await runAsUser(
    client,
    user1.id,
    "SELECT public.accept_exchange_request($1) as result;",
    [ownReqId]
  );
  assert(
    resSelfAccept.rows[0].result.success === false &&
    resSelfAccept.rows[0].result.error.includes('cannot accept your own'),
    'Edge case: User cannot accept their own request'
  );

  // 4. Cancelled request cannot be accepted
  await client.query("UPDATE public.exchange_requests SET status = 'CANCELLED' WHERE id = $1;", [ownReqId]);
  const resCancelledAccept = await runAsUser(
    client,
    user2.id,
    "SELECT public.accept_exchange_request($1) as result;",
    [ownReqId]
  );
  assert(
    resCancelledAccept.rows[0].result.success === false &&
    resCancelledAccept.rows[0].result.error.includes('cancelled'),
    'Edge case: Cancelled request cannot be accepted'
  );

  // 5. Expired request cannot be accepted
  const expReqRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 150.00, 'Spot', 'OPEN', $2, NOW() - INTERVAL '5 minutes')
    RETURNING id;
  `, [user1.id, testCampus]);
  const expReqId = expReqRes.rows[0].id;

  const resExpiredAccept = await runAsUser(
    client,
    user2.id,
    "SELECT public.accept_exchange_request($1) as result;",
    [expReqId]
  );
  assert(
    resExpiredAccept.rows[0].result.success === false &&
    resExpiredAccept.rows[0].result.error.includes('expired'),
    'Edge case: Expired request cannot be accepted'
  );

  // 6. Duplicate trade confirmation rejected
  const resDupConfirm = await runAsUser(
    client,
    user1.id,
    "SELECT public.confirm_trade_settlement($1) as result;",
    [tradeId]
  );
  assert(
    resDupConfirm.rows[0].result.success === false &&
    (resDupConfirm.rows[0].result.error.includes('already') || resDupConfirm.rows[0].result.error.includes('COMPLETED')),
    'Edge case: Duplicate confirmation on completed trade safely rejected'
  );

  // 7. Duplicate rating rejected
  const resDupRating = await runAsUser(
    client,
    user1.id,
    "SELECT public.submit_trade_rating($1, 5) as result;",
    [tradeId]
  );
  assert(
    resDupRating.rows[0].result.success === false &&
    resDupRating.rows[0].result.error.includes('already submitted a rating'),
    'Edge case: Duplicate rating attempt safely rejected'
  );

  // 8. Blank or whitespace chat messages rejected
  let blankMsgBlocked = false;
  try {
    await runAsUser(
      client,
      user1.id,
      "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, '   ');",
      [tradeId, user1.id]
    );
  } catch (err) {
    blankMsgBlocked = true;
  }
  assert(blankMsgBlocked, 'Edge case: Blank / whitespace-only chat message rejected by check constraint');

  // 9. Oversized chat messages (>1000 chars) rejected
  let overMsgBlocked = false;
  try {
    await runAsUser(
      client,
      user1.id,
      "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3);",
      [tradeId, user1.id, 'x'.repeat(1001)]
    );
  } catch (err) {
    overMsgBlocked = true;
  }
  assert(overMsgBlocked, 'Edge case: Chat message exceeding 1,000 characters rejected by check constraint');

  // 10. Outsider cannot read trade messages (RLS protects privacy)
  const outsiderMsgs = await runAsUser(
    client,
    user3.id,
    "SELECT * FROM public.trade_messages WHERE trade_id = $1;",
    [tradeId]
  );
  assert(
    outsiderMsgs.rows.length === 0,
    'Security audit: Outsider cannot view private trade chat messages (RLS returns 0 rows)'
  );

  // 11. Outsider cannot call get_trade_partner_upi (raises Unauthorized)
  let upiLeakBlocked = false;
  try {
    await runAsUser(
      client,
      user3.id,
      "SELECT public.get_trade_partner_upi($1);",
      [tradeId]
    );
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      upiLeakBlocked = true;
    }
  }
  assert(upiLeakBlocked, 'Security audit: Outsider cannot access partner UPI ID (raises Unauthorized)');

  // 12. Suspended user blocked from creating requests
  await client.query("UPDATE public.profiles SET is_suspended = true WHERE id = $1;", [user3.id]);
  let suspendedCreateBlocked = false;
  try {
    await runAsUser(
      client,
      user3.id,
      `INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 100.00, 'Spot', 'Main Campus', NOW() + INTERVAL '1 hour');`,
      [user3.id]
    );
  } catch (err) {
    suspendedCreateBlocked = true;
  }
  assert(suspendedCreateBlocked, 'Security audit: Suspended user blocked from creating exchange requests by RLS');

  // Reset user3
  await client.query("UPDATE public.profiles SET is_suspended = false WHERE id = $1;", [user3.id]);

  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

runMilestone10Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
