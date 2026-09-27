/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone5Tests() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Govardhan%4055@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 5 ATOMIC MATCHING TESTS ===\n');

  // Fetch test users
  const usersRes = await client.query(`
    SELECT id, email, full_name, is_onboarded, campus 
    FROM public.profiles 
    LIMIT 4;
  `);

  if (usersRes.rows.length < 3) {
    console.error('Error: Need at least 3 profiles in DB to test.');
    await client.end();
    return;
  }

  const user1 = usersRes.rows[0]; // Requester
  const user2 = usersRes.rows[1]; // Fulfiller 1
  const user3 = usersRes.rows[2]; // Fulfiller 2 / Other user

  // Ensure test users are onboarded and not suspended for the baseline test
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

  async function callRpcAsUser(c, userId, reqId) {
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    const res = await c.query("SELECT public.accept_exchange_request($1) as result;", [reqId]);
    return res.rows[0].result;
  }

  // -------------------------------------------------------------
  // TEST 1: Own request cannot be accepted
  // -------------------------------------------------------------
  console.log('--- Test 1: Prevent Accepting Own Request ---');
  const r1 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 100.00, 'Test Location 1', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req1Id = r1.rows[0].id;

  const t1Result = await callRpcAsUser(client, user1.id, req1Id);
  assert(
    t1Result.success === false && t1Result.error.includes('own exchange request'),
    'Requester is rejected when trying to accept their own request'
  );

  // -------------------------------------------------------------
  // TEST 2: Expired request cannot be accepted
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Expired Request Rejection ---');
  const r2 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'HAVE_CASH_WANT_UPI', 150.00, 'Test Location 2', 'OPEN', $2, NOW() - INTERVAL '5 minutes')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req2Id = r2.rows[0].id;

  const t2Result = await callRpcAsUser(client, user2.id, req2Id);
  assert(
    t2Result.success === false && t2Result.error.includes('expired'),
    'Expired request cannot be accepted and returns appropriate error'
  );

  // -------------------------------------------------------------
  // TEST 3: Cancelled request cannot be accepted
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Cancelled Request Rejection ---');
  const r3 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 200.00, 'Test Location 3', 'CANCELLED', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req3Id = r3.rows[0].id;

  const t3Result = await callRpcAsUser(client, user2.id, req3Id);
  assert(
    t3Result.success === false && t3Result.error.includes('cancelled'),
    'Cancelled request cannot be accepted'
  );

  // -------------------------------------------------------------
  // TEST 4: Suspended / Banned user cannot accept
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Suspended / Banned User Rejection ---');
  const r4 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 250.00, 'Test Location 4', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req4Id = r4.rows[0].id;

  // Temporarily suspend user2
  await client.query('UPDATE public.profiles SET is_suspended = true WHERE id = $1', [user2.id]);

  const t4Result = await callRpcAsUser(client, user2.id, req4Id);
  assert(
    t4Result.success === false && t4Result.error.includes('restricted'),
    'Suspended user is rejected from accepting requests'
  );

  // Restore user2
  await client.query('UPDATE public.profiles SET is_suspended = false WHERE id = $1', [user2.id]);

  // -------------------------------------------------------------
  // TEST 5: Valid OPEN request acceptance creates 1 Trade
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Valid Acceptance Creates Exactly One Trade ---');
  const t5Result = await callRpcAsUser(client, user2.id, req4Id);

  assert(
    t5Result.success === true && !!t5Result.trade_id,
    'Valid OPEN request accepted successfully by active peer'
  );

  // Verify trade in database
  const tradeCheck = await client.query(`
    SELECT * FROM public.trades WHERE id = $1;
  `, [t5Result.trade_id]);

  assert(
    tradeCheck.rows.length === 1 &&
    tradeCheck.rows[0].requester_id === user1.id &&
    tradeCheck.rows[0].fulfiller_id === user2.id &&
    Number(tradeCheck.rows[0].amount) === 250.00 &&
    tradeCheck.rows[0].status === 'IN_PROGRESS',
    'Trade record created with matching participants, amount, and status IN_PROGRESS'
  );

  const reqCheck = await client.query('SELECT status FROM public.exchange_requests WHERE id = $1', [req4Id]);
  assert(reqCheck.rows[0].status === 'ACCEPTED', 'Exchange request status transitioned to ACCEPTED');

  // -------------------------------------------------------------
  // TEST 6: Simultaneous / Concurrent Race Condition Test
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Concurrency / Race Condition (Parallel Acceptance) ---');
  const r6 = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'HAVE_CASH_WANT_UPI', 300.00, 'Canteen Steps', 'OPEN', $2, NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const req6Id = r6.rows[0].id;

  // Create separate database connections to simulate concurrent clients
  const connPromises = Array.from({ length: 6 }).map(async (_, idx) => {
    const c = new Client({
      connectionString: 'postgresql://postgres:Govardhan%4055@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    // Alternating between user2 and user3
    const buyerId = idx % 2 === 0 ? user2.id : user3.id;
    try {
      return await callRpcAsUser(c, buyerId, req6Id);
    } finally {
      await c.end();
    }
  });

  const concurrentResults = await Promise.all(connPromises);
  const successCount = concurrentResults.filter(r => r.success === true).length;
  const failCount = concurrentResults.filter(r => r.success === false).length;

  console.log(`Concurrent results: ${successCount} succeeded, ${failCount} rejected.`);

  assert(successCount === 1, 'Exactly one concurrent accept attempt succeeded');
  assert(failCount === 5, 'All other 5 concurrent accept attempts were safely rejected');

  const tradesCount = await client.query('SELECT COUNT(*) FROM public.trades WHERE request_id = $1', [req6Id]);
  assert(parseInt(tradesCount.rows[0].count, 10) === 1, 'Exactly 1 trade was created in database for request');

  // -------------------------------------------------------------
  // TEST 7: Trade Unique Constraint Defense
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Unique Constraint on trades.request_id ---');
  let duplicatePrevented = false;
  try {
    await client.query(`
      INSERT INTO public.trades (
        request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
      ) VALUES ($1, $2, $3, 300.00, 'HAVE_CASH_WANT_UPI', 'IN_PROGRESS', 'Duplicate Attempt');
    `, [req6Id, user1.id, user2.id]);
  } catch (err) {
    if (err.message.includes('unique') || err.message.includes('trades_request_id_unique')) {
      duplicatePrevented = true;
    }
  }
  assert(duplicatePrevented, 'Direct duplicate trade insertion blocked by UNIQUE constraint');

  // -------------------------------------------------------------
  // TEST 8: RLS Protection & Access Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test 8: RLS Trade Participant Access Isolation ---');
  const createdTradeId = concurrentResults.find(r => r.success)?.trade_id;

  // Helper to query with authenticated role and sub
  async function queryWithAuthRole(c, userId, tradeId) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    const res = await c.query("SELECT id FROM public.trades WHERE id = $1;", [tradeId]);
    await c.query("RESET ROLE;");
    return res.rows;
  }

  // As requester (user1)
  const reqRows = await queryWithAuthRole(client, user1.id, createdTradeId);
  assert(reqRows.length === 1, 'Requester can view trade via RLS');

  // As fulfiller
  const fulWinner = concurrentResults.findIndex(r => r.success);
  const winnerUserId = fulWinner % 2 === 0 ? user2.id : user3.id;
  const loserUserId = fulWinner % 2 === 0 ? user3.id : user2.id;

  const fulRows = await queryWithAuthRole(client, winnerUserId, createdTradeId);
  assert(fulRows.length === 1, 'Fulfiller can view trade via RLS');

  // As outsider
  const outsiderId = '00000000-0000-0000-0000-000000000099';
  const outsiderRows = await queryWithAuthRole(client, outsiderId, createdTradeId);
  assert(outsiderRows.length === 0, 'Outsider is blocked by RLS from viewing trade');

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  await client.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone5Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
