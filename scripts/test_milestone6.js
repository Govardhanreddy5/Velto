/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone6Tests() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Govardhan%4055@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 6 PRIVATE REALTIME CHAT TESTS ===\n');

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

  // Helper to query with authenticated role and sub
  async function queryAsUser(c, userId, sql, params = []) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    try {
      const res = await c.query(sql, params);
      return { success: true, rows: res.rows };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await c.query("RESET ROLE;");
    }
  }

  // 1. Setup a test request and trade
  const rRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 120.00, 'Library Lobby', 'ACCEPTED', $2, NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [user1.id, user1.campus]);
  const reqId = rRes.rows[0].id;

  const tRes = await client.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
    ) VALUES ($1, $2, $3, 120.00, 'NEED_CASH', 'IN_PROGRESS', 'Library Lobby')
    RETURNING id;
  `, [reqId, user1.id, user2.id]);
  const tradeId = tRes.rows[0].id;

  // -------------------------------------------------------------
  // TEST 1: Requester can insert and view a message
  // -------------------------------------------------------------
  console.log('--- Test 1: Requester Can Send and View Message ---');
  const msg1 = "Hey! I am waiting near the front desk.";
  const send1 = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id;`,
    [tradeId, user1.id, msg1]
  );
  assert(send1.success === true, 'Requester successfully sent a chat message');

  const view1 = await queryAsUser(
    client,
    user1.id,
    `SELECT message FROM public.trade_messages WHERE trade_id = $1;`,
    [tradeId]
  );
  assert(
    view1.success && view1.rows.some(r => r.message === msg1),
    'Requester can view their own message'
  );

  // -------------------------------------------------------------
  // TEST 2: Fulfiller can view requester message and reply
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Fulfiller Can View and Send Reply ---');
  const view2 = await queryAsUser(
    client,
    user2.id,
    `SELECT message FROM public.trade_messages WHERE trade_id = $1;`,
    [tradeId]
  );
  assert(
    view2.success && view2.rows.some(r => r.message === msg1),
    'Fulfiller can read requester message'
  );

  const msg2 = "On my way! Wearing a navy blue hoodie.";
  const send2 = await queryAsUser(
    client,
    user2.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id;`,
    [tradeId, user2.id, msg2]
  );
  assert(send2.success === true, 'Fulfiller successfully sent a reply message');

  // -------------------------------------------------------------
  // TEST 3: Outsider CANNOT read messages (RLS SELECT protection)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Random Outsider Cannot Read Messages ---');
  const outsiderView = await queryAsUser(
    client,
    user3.id,
    `SELECT message FROM public.trade_messages WHERE trade_id = $1;`,
    [tradeId]
  );
  assert(
    outsiderView.success && outsiderView.rows.length === 0,
    'Random outsider sees 0 messages (RLS protects private room)'
  );

  // -------------------------------------------------------------
  // TEST 4: Outsider CANNOT insert messages (RLS INSERT protection)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Random Outsider Cannot Send Message ---');
  const outsiderSend = await queryAsUser(
    client,
    user3.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, 'Sneaky outsider') RETURNING id;`,
    [tradeId, user3.id]
  );
  assert(
    outsiderSend.success === false,
    'Random outsider direct insert blocked by RLS policy'
  );

  // -------------------------------------------------------------
  // TEST 5: Database Check Constraints (Empty / Whitespace validation)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Empty and Whitespace Messages Rejected ---');
  const emptySend = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, '') RETURNING id;`,
    [tradeId, user1.id]
  );
  assert(emptySend.success === false, 'Empty string message rejected by CHECK constraint');

  const spaceSend = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, '    ') RETURNING id;`,
    [tradeId, user1.id]
  );
  assert(spaceSend.success === false, 'Whitespace-only message rejected by CHECK constraint');

  // -------------------------------------------------------------
  // TEST 6: Message length constraint (1,001 chars rejected)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Message Exceeding 1000 Characters Rejected ---');
  const longMsg = 'A'.repeat(1001);
  const longSend = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id;`,
    [tradeId, user1.id, longMsg]
  );
  assert(longSend.success === false, '1,001-character message rejected by CHECK constraint');

  // -------------------------------------------------------------
  // TEST 7: Cannot send messages after trade is COMPLETED or CANCELLED
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Messaging Blocked When Trade Not IN_PROGRESS ---');
  await client.query("UPDATE public.trades SET status = 'COMPLETED' WHERE id = $1;", [tradeId]);

  const closedSend = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, 'Are you there?') RETURNING id;`,
    [tradeId, user1.id]
  );
  assert(
    closedSend.success === false,
    'Sending message blocked by RLS when trade status is COMPLETED'
  );

  // -------------------------------------------------------------
  // TEST 8: Suspended user cannot send message
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Suspended User Cannot Send Message ---');
  // Re-open trade for test
  await client.query("UPDATE public.trades SET status = 'IN_PROGRESS' WHERE id = $1;", [tradeId]);
  await client.query("UPDATE public.profiles SET is_suspended = true WHERE id = $1;", [user1.id]);

  const suspendedSend = await queryAsUser(
    client,
    user1.id,
    `INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, 'Trying to send while suspended') RETURNING id;`,
    [tradeId, user1.id]
  );
  assert(
    suspendedSend.success === false,
    'Suspended user blocked from sending messages by RLS'
  );

  // Restore user1
  await client.query("UPDATE public.profiles SET is_suspended = false WHERE id = $1;", [user1.id]);

  // -------------------------------------------------------------
  // TEST 9: Immutability (UPDATE & DELETE disallowed)
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Immutability (UPDATE & DELETE Disallowed) ---');
  const updateAttempt = await queryAsUser(
    client,
    user1.id,
    `UPDATE public.trade_messages SET message = 'Edited message' WHERE trade_id = $1;`,
    [tradeId]
  );
  assert(
    updateAttempt.success === false || updateAttempt.rows?.length === 0,
    'Updating trade messages blocked by RLS'
  );

  const deleteAttempt = await queryAsUser(
    client,
    user1.id,
    `DELETE FROM public.trade_messages WHERE trade_id = $1;`,
    [tradeId]
  );
  assert(
    deleteAttempt.success === false || deleteAttempt.rows?.length === 0,
    'Deleting trade messages blocked by RLS'
  );

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  await client.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone6Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
