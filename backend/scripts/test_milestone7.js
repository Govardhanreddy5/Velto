/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone7Tests() {
  const client = new Client({
    connectionString: 'postgresql://postgres:YOUR_DB_PASSWORD@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 7 TWO-SIDED SETTLEMENT & COMPLETION TESTS ===\n');

  // Fetch test users
  const usersRes = await client.query(`
    SELECT id, email, full_name, is_onboarded, campus 
    FROM public.profiles 
    LIMIT 4;
  `);

  const user1 = usersRes.rows[0]; // Requester
  const user2 = usersRes.rows[1]; // Fulfiller
  const user3 = usersRes.rows[2]; // Outsider

  // Ensure active baseline
  await client.query(`
    UPDATE public.profiles 
    SET is_onboarded = true, is_suspended = false, is_banned = false 
    WHERE id IN ($1, $2, $3);
  `, [user1.id, user2.id, user3.id]);

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

  // Helper to run confirm_trade_settlement as specific user
  async function confirmAsUser(c, userId, tradeId) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    try {
      const res = await c.query("SELECT public.confirm_trade_settlement($1) as result;", [tradeId]);
      return res.rows[0].result;
    } finally {
      await c.query("RESET ROLE;");
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Standard Order: Requester confirms first -> IN_PROGRESS
  // -------------------------------------------------------------
  console.log('--- Test 1: Requester Confirms First (Trade Remains IN_PROGRESS) ---');
  const r1 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 200.00, 'Canteen Desk', 'ACCEPTED', $2, NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req1Id = r1.rows[0].id;

  const t1 = await client.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
    ) VALUES ($1, $2, $3, 200.00, 'NEED_CASH', 'IN_PROGRESS', 'Canteen Desk')
    RETURNING id;
  `, [req1Id, user1.id, user2.id]);
  const trade1Id = t1.rows[0].id;

  const res1 = await confirmAsUser(client, user1.id, trade1Id);
  assert(
    res1.success === true &&
    res1.completed === false &&
    res1.requester_confirmed === true &&
    res1.fulfiller_confirmed === false &&
    res1.status === 'IN_PROGRESS',
    'Requester confirmed: trade remains IN_PROGRESS awaiting fulfiller'
  );

  // -------------------------------------------------------------
  // TEST 2: Duplicate confirmation rejected safely
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Repeat Confirmation by Same User Rejected ---');
  const resRepeat = await confirmAsUser(client, user1.id, trade1Id);
  assert(
    resRepeat.success === false && resRepeat.error.includes('already confirmed'),
    'Duplicate confirmation attempt rejected with clear error'
  );

  // -------------------------------------------------------------
  // TEST 3: Outsider cannot confirm settlement
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Outsider Cannot Confirm Settlement ---');
  const resOutsider = await confirmAsUser(client, user3.id, trade1Id);
  assert(
    resOutsider.success === false && resOutsider.error.includes('not a participant'),
    'Outsider rejected from confirming participant settlement'
  );

  // -------------------------------------------------------------
  // TEST 4: Fulfiller confirms second -> Trade transitions to COMPLETED
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Fulfiller Confirms Second (Trade Transitions to COMPLETED) ---');
  const res2 = await confirmAsUser(client, user2.id, trade1Id);
  assert(
    res2.success === true &&
    res2.completed === true &&
    res2.status === 'COMPLETED' &&
    res2.requester_confirmed === true &&
    res2.fulfiller_confirmed === true,
    'Fulfiller confirmed: both flags true, trade atomically set to COMPLETED'
  );

  // Verify database record updates
  const t1Check = await client.query("SELECT status, completed_at FROM public.trades WHERE id = $1;", [trade1Id]);
  assert(
    t1Check.rows[0].status === 'COMPLETED' && !!t1Check.rows[0].completed_at,
    'Database trades record has status COMPLETED and valid completed_at timestamp'
  );

  const req1Check = await client.query("SELECT status FROM public.exchange_requests WHERE id = $1;", [req1Id]);
  assert(
    req1Check.rows[0].status === 'COMPLETED',
    'Database exchange_requests record status transitioned to COMPLETED'
  );

  // -------------------------------------------------------------
  // TEST 5: Cannot confirm already COMPLETED trade
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Reject Confirmation on Already COMPLETED Trade ---');
  const resAfterComplete = await confirmAsUser(client, user2.id, trade1Id);
  assert(
    resAfterComplete.success === false && resAfterComplete.error.includes('already been completed'),
    'Confirmation on completed trade rejected safely'
  );

  // -------------------------------------------------------------
  // TEST 6: Reverse Order: Fulfiller confirms first, Requester second
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Reverse Order (Fulfiller First, Requester Second) ---');
  const r2 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'HAVE_CASH_WANT_UPI', 350.00, 'Auditorium Gate', 'ACCEPTED', $2, NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req2Id = r2.rows[0].id;

  const t2 = await client.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
    ) VALUES ($1, $2, $3, 350.00, 'HAVE_CASH_WANT_UPI', 'IN_PROGRESS', 'Auditorium Gate')
    RETURNING id;
  `, [req2Id, user1.id, user2.id]);
  const trade2Id = t2.rows[0].id;

  // Fulfiller confirms first
  const revRes1 = await confirmAsUser(client, user2.id, trade2Id);
  assert(
    revRes1.success === true &&
    revRes1.completed === false &&
    revRes1.fulfiller_confirmed === true &&
    revRes1.requester_confirmed === false &&
    revRes1.status === 'IN_PROGRESS',
    'Fulfiller confirmed first: trade remains IN_PROGRESS awaiting requester'
  );

  // Requester confirms second
  const revRes2 = await confirmAsUser(client, user1.id, trade2Id);
  assert(
    revRes2.success === true &&
    revRes2.completed === true &&
    revRes2.status === 'COMPLETED',
    'Requester confirmed second: trade transitions to COMPLETED'
  );

  // -------------------------------------------------------------
  // TEST 7: Cancelled or Disputed trade cannot be confirmed
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Cancelled Trade Cannot Be Confirmed ---');
  const r3 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 50.00, 'Block A', 'CANCELLED', $2, NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req3Id = r3.rows[0].id;

  const t3 = await client.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
    ) VALUES ($1, $2, $3, 50.00, 'NEED_CASH', 'CANCELLED', 'Block A')
    RETURNING id;
  `, [req3Id, user1.id, user2.id]);
  const trade3Id = t3.rows[0].id;

  const resCancelled = await confirmAsUser(client, user1.id, trade3Id);
  assert(
    resCancelled.success === false && resCancelled.error.includes('cancelled'),
    'Confirmation on CANCELLED trade rejected'
  );

  // -------------------------------------------------------------
  // TEST 8: Direct client UPDATE on public.trades blocked by RLS
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Direct Frontend UPDATE on trades Blocked by RLS ---');
  await client.query("SET ROLE authenticated;");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [user1.id]);
  let directUpdatePrevented = false;
  try {
    const updRes = await client.query(
      "UPDATE public.trades SET requester_confirmed = true, fulfiller_confirmed = true, status = 'COMPLETED' WHERE id = $1;",
      [trade2Id]
    );
    if (updRes.rowCount === 0) directUpdatePrevented = true;
  } catch (err) {
    directUpdatePrevented = true;
  } finally {
    await client.query("RESET ROLE;");
  }
  assert(directUpdatePrevented, 'Direct client-side UPDATE on trades is strictly denied by RLS');

  // -------------------------------------------------------------
  // TEST 9: Chat becomes read-only when trade is COMPLETED
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Chat Insertion Blocked on COMPLETED Trade ---');
  await client.query("SET ROLE authenticated;");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [user1.id]);
  let chatBlocked = false;
  try {
    await client.query(
      "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, 'Post complete chat attempt');",
      [trade1Id, user1.id]
    );
  } catch (err) {
    chatBlocked = true;
  } finally {
    await client.query("RESET ROLE;");
  }
  assert(chatBlocked, 'Sending chat message on COMPLETED trade blocked by RLS');

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  await client.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone7Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
