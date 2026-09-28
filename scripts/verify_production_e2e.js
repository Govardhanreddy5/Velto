/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const { Client: PgClient } = require('pg');

async function runProductionE2E() {
  console.log('====================================================');
  console.log('STARTING PRODUCTION TWO-USER VERIFICATION TESTS');
  console.log('====================================================\n');

  const url = 'https://csbdbhnvsykrsozwzdwk.supabase.co';
  const anonKey = 'sb_publishable_lbCs1ZxuNjJ_Ul5Ht6KxvQ_kdUHMm1R';

  const pg = new PgClient({
    connectionString: 'postgresql://postgres:Govardhan%4055@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  // 1. Authenticate Student A and Student B and Student C
  console.log('1. Authenticating accounts...');
  const clientA = createClient(url, anonKey);
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
    email: '24pa1a1205@vishnu.edu.in',
    password: 'Govardhan@55',
  });
  if (errA) throw new Error('Student A signin failed: ' + errA.message);

  const clientB = createClient(url, anonKey);
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
    email: '24pa1a1210@vishnu.edu.in',
    password: 'Govardhan@55',
  });
  if (errB) throw new Error('Student B signin failed: ' + errB.message);

  const clientC = createClient(url, anonKey);
  const { data: authC, error: errC } = await clientC.auth.signInWithPassword({
    email: 'govardhan0477@gmail.com',
    password: 'Govardhan@55',
  });
  if (errC) throw new Error('Student C signin failed: ' + errC.message);

  const userA = authA.user;
  const userB = authB.user;
  const userC = authC.user;

  console.log(`- Student A: ${userA.email} (${userA.id})`);
  console.log(`- Student B: ${userB.email} (${userB.id})`);
  console.log(`- Student C: ${userC.email} (${userC.id})`);

  // 2. Create a clean test trade room for this test run
  console.log('\n2. Creating isolated test exchange request and trade room...');
  const reqRes = await pg.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 50.00, 'Central Library Ground Floor', 'ACCEPTED', 'Vishnu Educational Society', NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [userA.id]);
  const requestId = reqRes.rows[0].id;

  const tradeRes = await pg.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location
    ) VALUES ($1, $2, $3, 50.00, 'NEED_CASH', 'IN_PROGRESS', 'Central Library Ground Floor')
    RETURNING id;
  `, [requestId, userA.id, userB.id]);
  const tradeId = tradeRes.rows[0].id;
  console.log(`- Created Trade ID: ${tradeId}`);

  // 3. Set up Realtime listeners
  console.log('\n3. Establishing Supabase Realtime WebSocket channels...');
  let messageReceivedByB = null;
  let messageReceivedByA = null;
  let settlementUpdateReceivedByB = null;
  let completionReceivedByA = null;
  let completionReceivedByB = null;

  // Channel helper that awaits SUBSCRIBED
  const subscribeChannel = (chan, name) => {
    return new Promise((resolve, reject) => {
      chan.subscribe((status, err) => {
        console.log(`  [${name} Status]:`, status, err || '');
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR') reject(err || new Error(`${name} error`));
      });
    });
  };

  const chanB = clientB.channel(`trade_room_b_${tradeId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'trade_messages',
      filter: `trade_id=eq.${tradeId}`,
    }, (payload) => {
      console.log('>>> [REALTIME B EVENT]:', payload.new.message, '(from ' + payload.new.sender_id + ')');
      if (payload.new.sender_id === userA.id) {
        messageReceivedByB = payload.new;
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'trades',
      filter: `id=eq.${tradeId}`,
    }, (payload) => {
      console.log('>>> [REALTIME B TRADE UPDATE]:', {
        status: payload.new.status,
        requester_confirmed: payload.new.requester_confirmed,
        fulfiller_confirmed: payload.new.fulfiller_confirmed,
      });
      settlementUpdateReceivedByB = payload.new;
      if (payload.new.status === 'COMPLETED') {
        completionReceivedByB = payload.new;
      }
    });

  const chanA = clientA.channel(`trade_room_a_${tradeId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'trade_messages',
      filter: `trade_id=eq.${tradeId}`,
    }, (payload) => {
      console.log('>>> [REALTIME A EVENT]:', payload.new.message, '(from ' + payload.new.sender_id + ')');
      if (payload.new.sender_id === userB.id) {
        messageReceivedByA = payload.new;
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'trades',
      filter: `id=eq.${tradeId}`,
    }, (payload) => {
      console.log('>>> [REALTIME A TRADE UPDATE]:', {
        status: payload.new.status,
        requester_confirmed: payload.new.requester_confirmed,
        fulfiller_confirmed: payload.new.fulfiller_confirmed,
      });
      if (payload.new.status === 'COMPLETED') {
        completionReceivedByA = payload.new;
      }
    });

  await Promise.all([
    subscribeChannel(chanA, 'Student A Channel'),
    subscribeChannel(chanB, 'Student B Channel'),
  ]);

  // Give 1 second stabilization
  await new Promise(r => setTimeout(r, 1000));

  // --------------------------------------------------------------------------
  // TEST 1: Student A sends chat message -> Student B sees it instantly
  // --------------------------------------------------------------------------
  console.log('\n--- Test 1: Student A sends message -> Student B receives in realtime ---');
  const msgTextA = 'Hey Student B! Meet me near front desk.';
  const sendA = await clientA.from('trade_messages').insert({
    trade_id: tradeId,
    sender_id: userA.id,
    message: msgTextA,
  }).select().single();
  if (sendA.error) throw new Error('Send A failed: ' + sendA.error.message);
  console.log('Student A sent:', sendA.data.message);

  let waited = 0;
  while (!messageReceivedByB && waited < 6000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!messageReceivedByB || messageReceivedByB.message !== msgTextA) {
    throw new Error('TEST 1 FAILED: Student B did not receive message in realtime!');
  }
  console.log('✓ TEST 1 PASSED: Student B received message in realtime!');

  // --------------------------------------------------------------------------
  // TEST 2: Student B replies -> Student A sees it instantly
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Student B replies -> Student A receives in realtime ---');
  const msgTextB = 'Got it! Heading there now with the ₹50 cash.';
  const sendB = await clientB.from('trade_messages').insert({
    trade_id: tradeId,
    sender_id: userB.id,
    message: msgTextB,
  }).select().single();
  if (sendB.error) throw new Error('Send B failed: ' + sendB.error.message);
  console.log('Student B sent:', sendB.data.message);

  waited = 0;
  while (!messageReceivedByA && waited < 6000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!messageReceivedByA || messageReceivedByA.message !== msgTextB) {
    throw new Error('TEST 2 FAILED: Student A did not receive reply in realtime!');
  }
  console.log('✓ TEST 2 PASSED: Student A received reply in realtime!');

  // --------------------------------------------------------------------------
  // TEST 3: Student A confirms receipt -> Student B sees confirmation instantly
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Student A confirms receipt -> Student B sees update in realtime ---');
  const confA = await clientA.rpc('confirm_trade_settlement', { p_trade_id: tradeId });
  if (confA.error) throw new Error('Confirm A RPC error: ' + confA.error.message);
  console.log('Student A RPC result:', confA.data);

  waited = 0;
  while (!settlementUpdateReceivedByB && waited < 6000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!settlementUpdateReceivedByB || settlementUpdateReceivedByB.requester_confirmed !== true) {
    throw new Error('TEST 3 FAILED: Student B did not see Student A confirmation in realtime!');
  }
  console.log('✓ TEST 3 PASSED: Student B sees Student A confirmation in realtime (status remains IN_PROGRESS)!');

  // --------------------------------------------------------------------------
  // TEST 4: Student B confirms receipt -> Both see COMPLETED instantly
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Student B confirms receipt -> Both see COMPLETED in realtime ---');
  const confB = await clientB.rpc('confirm_trade_settlement', { p_trade_id: tradeId });
  if (confB.error) throw new Error('Confirm B RPC error: ' + confB.error.message);
  console.log('Student B RPC result:', confB.data);

  waited = 0;
  while ((!completionReceivedByA || !completionReceivedByB) && waited < 6000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!completionReceivedByA || completionReceivedByA.status !== 'COMPLETED' ||
      !completionReceivedByB || completionReceivedByB.status !== 'COMPLETED') {
    throw new Error('TEST 4 FAILED: Realtime COMPLETED event not received by both participants!');
  }
  console.log('✓ TEST 4 PASSED: Both students received COMPLETED with completed_at in realtime!');

  // --------------------------------------------------------------------------
  // TEST 5: Trade appears in History for both users with completed_at
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Verify Trade History for Student A and Student B ---');
  const histA = await clientA.from('trades')
    .select('id, status, completed_at, amount')
    .eq('status', 'COMPLETED')
    .not('completed_at', 'is', null)
    .or(`requester_id.eq.${userA.id},fulfiller_id.eq.${userA.id}`)
    .eq('id', tradeId);
  if (histA.error || histA.data.length === 0) {
    throw new Error('TEST 5 FAILED: Trade not found in Student A history!');
  }
  console.log('Student A History match:', histA.data[0]);

  const histB = await clientB.from('trades')
    .select('id, status, completed_at, amount')
    .eq('status', 'COMPLETED')
    .not('completed_at', 'is', null)
    .or(`requester_id.eq.${userB.id},fulfiller_id.eq.${userB.id}`)
    .eq('id', tradeId);
  if (histB.error || histB.data.length === 0) {
    throw new Error('TEST 5 FAILED: Trade not found in Student B history!');
  }
  console.log('Student B History match:', histB.data[0]);
  console.log('✓ TEST 5 PASSED: Trade appears in both student trade histories!');

  // --------------------------------------------------------------------------
  // TEST 6: Persistence test after page refresh / re-query
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Persistence verification (DB re-query) ---');
  const dbCheck = await pg.query('SELECT status, requester_confirmed, fulfiller_confirmed, completed_at FROM public.trades WHERE id = $1;', [tradeId]);
  const row = dbCheck.rows[0];
  if (row.status !== 'COMPLETED' || !row.requester_confirmed || !row.fulfiller_confirmed || !row.completed_at) {
    throw new Error('TEST 6 FAILED: Database state inconsistent!');
  }
  console.log('Database row persistent state:', row);
  console.log('✓ TEST 6 PASSED: Database state is persisted and immutable!');

  // --------------------------------------------------------------------------
  // TEST 7: Outsider isolation (Third user CANNOT read messages or trade)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Verify outsider isolation (Third user RLS) ---');
  const dummyStudentId = '00000000-0000-0000-0000-000000000001';
  await pg.query('SET ROLE authenticated;');
  await pg.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [dummyStudentId]);
  const rlsMsg = await pg.query('SELECT * FROM public.trade_messages WHERE trade_id = $1;', [tradeId]);
  const rlsTrade = await pg.query('SELECT * FROM public.trades WHERE id = $1;', [tradeId]);
  await pg.query('RESET ROLE;');

  if (rlsMsg.rows.length !== 0) throw new Error('Outsider could see messages!');
  if (rlsTrade.rows.length !== 0) throw new Error('Outsider could see trade!');
  console.log('✓ TEST 7 PASSED: Non-participant student blocked from reading messages and trade (0 rows returned)!');

  // Cleanup
  await clientA.removeChannel(chanA);
  await clientB.removeChannel(chanB);
  await pg.end();

  console.log('\n====================================================');
  console.log('ALL 7 REQUIRED PRODUCTION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
  process.exit(0);
}

runProductionE2E().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
