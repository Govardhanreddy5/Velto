/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const { Client: PgClient } = require('pg');

async function runCrossCollegeE2ETest() {
  console.log('================================================================');
  console.log('VELTO CROSS-COLLEGE END-TO-END VERIFICATION SUITE');
  console.log('Testing Vishnu (@vishnu.edu.in) & SVECW (@svecw.edu.in) Shared Exchange');
  console.log('================================================================\n');

  const url = 'https://csbdbhnvsykrsozwzdwk.supabase.co';
  const anonKey = 'sb_publishable_lbCs1ZxuNjJ_Ul5Ht6KxvQ_kdUHMm1R';

  const pg = new PgClient({
    connectionString: 'postgresql://postgres:Govardhan%4055@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    // --------------------------------------------------------------------------
    // 1. Authenticate Real Accounts
    // --------------------------------------------------------------------------
    console.log('STEP 1: Authenticating real accounts...');
    
    // Student A: Vishnu
    const clientA = createClient(url, anonKey);
    const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
      email: '24pa1a1205@vishnu.edu.in',
      password: 'Govardhan@55',
    });
    if (errA) throw new Error('Vishnu Student A login failed: ' + errA.message);
    const userA = authA.user;
    console.log(`✓ Student A (Vishnu): ${userA.email} (${userA.id})`);

    // Student B: SVECW
    const clientB = createClient(url, anonKey);
    const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
      email: '25b01a4212@svecw.edu.in',
      password: 'Govardhan@55',
    });
    if (errB) throw new Error('SVECW Student B login failed: ' + errB.message);
    const userB = authB.user;
    console.log(`✓ Student B (SVECW): ${userB.email} (${userB.id})`);

    // Student C: Third-party regular student (non-admin, outsider to this trade)
    const clientC = createClient(url, anonKey);
    const { data: authC, error: errC } = await clientC.auth.signInWithPassword({
      email: '24pa1a1209@vishnu.edu.in',
      password: 'Govardhan@55',
    });
    if (errC) throw new Error('Third user login failed: ' + errC.message);
    const userC = authC.user;
    console.log(`✓ Third Student (Non-Participant, Non-Admin): ${userC.email} (${userC.id})`);

    // --------------------------------------------------------------------------
    // 2. Verify Profiles and Campuses
    // --------------------------------------------------------------------------
    console.log('\nSTEP 2: Verifying profile records & campus affiliations...');
    const { data: profA } = await clientA.from('profiles').select('*').eq('id', userA.id).single();
    const { data: profB } = await clientB.from('profiles').select('*').eq('id', userB.id).single();

    console.log(`- Student A Profile: ${profA.full_name} | Campus: ${profA.campus} | Onboarded: ${profA.is_onboarded}`);
    console.log(`- Student B Profile: ${profB.full_name} | Campus: ${profB.campus} | Onboarded: ${profB.is_onboarded}`);

    if (profA.campus !== 'Vishnu Educational Society') {
      throw new Error(`Student A campus mismatch: expected Vishnu Educational Society, got ${profA.campus}`);
    }
    if (profB.campus !== 'Shri Vishnu Engineering College for Women (SVECW)') {
      throw new Error(`Student B campus mismatch: expected SVECW, got ${profB.campus}`);
    }
    console.log('✓ Both student campuses strictly confirmed in database!');

    // --------------------------------------------------------------------------
    // 3. Shared Feed Verification in BOTH Directions
    // --------------------------------------------------------------------------
    console.log('\nSTEP 3: Testing Shared Feed Visibility in BOTH directions...');

    // Student A (Vishnu) posts a request
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const { data: reqA, error: reqAErr } = await clientA.from('exchange_requests').insert({
      requester_id: userA.id,
      request_type: 'NEED_CASH',
      amount: 100.00,
      location_hint: 'Central Library Fountain',
      note: 'Need ₹100 cash for canteen. Vishnu requester.',
      status: 'OPEN',
      campus: profA.campus,
      expires_at: expiry,
    }).select().single();
    if (reqAErr) throw new Error('Student A request insert failed: ' + reqAErr.message);
    console.log(`- Student A (Vishnu) posted request: ID=${reqA.id} (₹${reqA.amount}, ${reqA.campus})`);

    // Student B (SVECW) posts a request
    const { data: reqB, error: reqBErr } = await clientB.from('exchange_requests').insert({
      requester_id: userB.id,
      request_type: 'HAVE_CASH_WANT_UPI',
      amount: 200.00,
      location_hint: 'Main Gate Security Post',
      note: 'Have ₹200 cash, want UPI. SVECW requester.',
      status: 'OPEN',
      campus: profB.campus,
      expires_at: expiry,
    }).select().single();
    if (reqBErr) throw new Error('Student B request insert failed: ' + reqBErr.message);
    console.log(`- Student B (SVECW) posted request: ID=${reqB.id} (₹${reqB.amount}, ${reqB.campus})`);

    // Test: Can Student B (SVECW) see Student A's (Vishnu) request?
    const { data: feedSeenByB, error: feedBErr } = await clientB
      .from('exchange_requests')
      .select('id, requester_id, campus, amount, status')
      .eq('status', 'OPEN')
      .eq('id', reqA.id);
    if (feedBErr || !feedSeenByB || feedSeenByB.length === 0) {
      throw new Error('FAILED: Student B (SVECW) CANNOT see Student A (Vishnu) request in feed!');
    }
    console.log('✓ CONFIRMED: Student B (SVECW) successfully sees Vishnu request in shared feed!');

    // Test: Can Student A (Vishnu) see Student B's (SVECW) request?
    const { data: feedSeenByA, error: feedAErr } = await clientA
      .from('exchange_requests')
      .select('id, requester_id, campus, amount, status')
      .eq('status', 'OPEN')
      .eq('id', reqB.id);
    if (feedAErr || !feedSeenByA || feedSeenByA.length === 0) {
      throw new Error('FAILED: Student A (Vishnu) CANNOT see Student B (SVECW) request in feed!');
    }
    console.log('✓ CONFIRMED: Student A (Vishnu) successfully sees SVECW request in shared feed!');

    // Clean up reqB since we will test cross-acceptance with reqA
    await pg.query("UPDATE public.exchange_requests SET status = 'CANCELLED' WHERE id = $1", [reqB.id]);

    // --------------------------------------------------------------------------
    // 4. Cross-College Atomic Acceptance (SVECW accepts Vishnu)
    // --------------------------------------------------------------------------
    console.log('\nSTEP 4: Cross-College Atomic Acceptance...');
    console.log(`Student B (SVECW) accepting Vishnu request ${reqA.id}...`);

    // First test self-acceptance is rejected
    const { data: selfAcceptRes } = await clientA.rpc('accept_exchange_request', {
      p_request_id: reqA.id,
    });
    if (selfAcceptRes?.success) {
      throw new Error('FAILED: Self-acceptance was allowed when it must be rejected!');
    }
    console.log('✓ Self-acceptance correctly rejected:', selfAcceptRes?.error);

    // Now cross-college acceptance
    const { data: acceptRes, error: acceptErr } = await clientB.rpc('accept_exchange_request', {
      p_request_id: reqA.id,
    });
    if (acceptErr || !acceptRes?.success) {
      throw new Error('Cross-college acceptance failed: ' + (acceptErr?.message || acceptRes?.error));
    }
    const tradeId = acceptRes.trade_id;
    console.log(`✓ Cross-college acceptance SUCCEEDED! Created Trade Room ID: ${tradeId}`);

    // Verify request row status is atomically ACCEPTED
    const { data: updatedReq } = await clientA.from('exchange_requests').select('status').eq('id', reqA.id).single();
    if (updatedReq.status !== 'ACCEPTED') {
      throw new Error(`Request status not updated: expected ACCEPTED, got ${updatedReq.status}`);
    }
    console.log('✓ Request status atomically set to ACCEPTED');

    // Verify duplicate acceptance is blocked
    const { data: dupAcceptRes } = await clientC.rpc('accept_exchange_request', {
      p_request_id: reqA.id,
    });
    if (dupAcceptRes?.success) {
      throw new Error('FAILED: Duplicate acceptance was permitted!');
    }
    console.log('✓ Duplicate acceptance blocked:', dupAcceptRes?.error);

    // --------------------------------------------------------------------------
    // 5. Realtime WebSocket Subscription
    // --------------------------------------------------------------------------
    console.log('\nSTEP 5: Establishing Supabase Realtime WebSocket Channels...');

    let messageReceivedByB = null;
    let messageReceivedByA = null;
    let settlementUpdateReceivedByB = null;
    let completionReceivedByA = null;
    let completionReceivedByB = null;

    const subscribeChannel = (chan, name) => {
      return new Promise((resolve, reject) => {
        chan.subscribe((status, err) => {
          console.log(`  [${name} Status]: ${status}`, err || '');
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
        console.log('  >>> [REALTIME B MSG]:', payload.new.message, '(from ' + payload.new.sender_id + ')');
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
        console.log('  >>> [REALTIME B TRADE UPDATE]:', {
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
        console.log('  >>> [REALTIME A MSG]:', payload.new.message, '(from ' + payload.new.sender_id + ')');
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
        console.log('  >>> [REALTIME A TRADE UPDATE]:', {
          status: payload.new.status,
          requester_confirmed: payload.new.requester_confirmed,
          fulfiller_confirmed: payload.new.fulfiller_confirmed,
        });
        if (payload.new.status === 'COMPLETED') {
          completionReceivedByA = payload.new;
        }
      });

    await Promise.all([
      subscribeChannel(chanA, 'Student A (Vishnu) Channel'),
      subscribeChannel(chanB, 'Student B (SVECW) Channel'),
    ]);

    await new Promise(r => setTimeout(r, 1000));

    // --------------------------------------------------------------------------
    // 6. Realtime Chat in Both Directions
    // --------------------------------------------------------------------------
    console.log('\nSTEP 6: Testing Realtime Chat in both directions...');

    // Message 1: Student A (Vishnu) -> Student B (SVECW)
    const msgA = 'Hi! I am from Vishnu, waiting near the Central Library.';
    const sendResA = await clientA.from('trade_messages').insert({
      trade_id: tradeId,
      sender_id: userA.id,
      message: msgA,
    }).select().single();
    if (sendResA.error) throw new Error('Send A failed: ' + sendResA.error.message);
    console.log(`- Student A sent: "${msgA}"`);

    let waited = 0;
    while (!messageReceivedByB && waited < 6000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (!messageReceivedByB || messageReceivedByB.message !== msgA) {
      throw new Error('FAILED: Student B (SVECW) did not receive Realtime message from Student A!');
    }
    console.log('✓ Student B (SVECW) received Student A message in realtime!');

    // Message 2: Student B (SVECW) -> Student A (Vishnu)
    const msgB = 'Hello! SVECW student here, reaching the library in 2 minutes with ₹100 cash.';
    const sendResB = await clientB.from('trade_messages').insert({
      trade_id: tradeId,
      sender_id: userB.id,
      message: msgB,
    }).select().single();
    if (sendResB.error) throw new Error('Send B failed: ' + sendResB.error.message);
    console.log(`- Student B sent: "${msgB}"`);

    waited = 0;
    while (!messageReceivedByA && waited < 6000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (!messageReceivedByA || messageReceivedByA.message !== msgB) {
      throw new Error('FAILED: Student A (Vishnu) did not receive Realtime reply from Student B!');
    }
    console.log('✓ Student A (Vishnu) received Student B reply in realtime!');

    // --------------------------------------------------------------------------
    // 7. Two-Sided Settlement Confirmation
    // --------------------------------------------------------------------------
    console.log('\nSTEP 7: Testing Two-Sided Settlement Confirmation...');

    // First Confirmation: Student A (Vishnu) confirms
    console.log('Student A confirming cash received...');
    const confResA = await clientA.rpc('confirm_trade_settlement', { p_trade_id: tradeId });
    if (confResA.error || !confResA.data?.success) {
      throw new Error('Confirm A failed: ' + (confResA.error?.message || confResA.data?.error));
    }
    console.log('Student A confirmed! RPC Response:', confResA.data);

    waited = 0;
    while (!settlementUpdateReceivedByB && waited < 6000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (!settlementUpdateReceivedByB || settlementUpdateReceivedByB.requester_confirmed !== true) {
      throw new Error('FAILED: Student B did not receive realtime confirmation from Student A!');
    }
    console.log('✓ Student B received realtime update: Student A confirmed (status remains IN_PROGRESS)');

    // Second Confirmation: Student B (SVECW) confirms -> Trade Reaches COMPLETED
    console.log('\nStudent B confirming UPI received...');
    const confResB = await clientB.rpc('confirm_trade_settlement', { p_trade_id: tradeId });
    if (confResB.error || !confResB.data?.success) {
      throw new Error('Confirm B failed: ' + (confResB.error?.message || confResB.data?.error));
    }
    console.log('Student B confirmed! RPC Response:', confResB.data);

    waited = 0;
    while ((!completionReceivedByA || !completionReceivedByB) && waited < 6000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (!completionReceivedByA || completionReceivedByA.status !== 'COMPLETED' ||
        !completionReceivedByB || completionReceivedByB.status !== 'COMPLETED') {
      throw new Error('FAILED: Realtime COMPLETED event not received by both students!');
    }
    console.log('✓ Realtime COMPLETED event received by BOTH participants simultaneously!');

    // --------------------------------------------------------------------------
    // 8. Trade History Verification
    // --------------------------------------------------------------------------
    console.log('\nSTEP 8: Verifying Completed Trade History for both users...');

    // Student A history query
    const { data: histA } = await clientA
      .from('trades')
      .select('id, status, completed_at, amount, requester:profiles!trades_requester_id_fkey(campus), fulfiller:profiles!trades_fulfiller_id_fkey(campus)')
      .eq('id', tradeId)
      .eq('status', 'COMPLETED')
      .single();
    if (!histA || histA.status !== 'COMPLETED') {
      throw new Error('FAILED: Trade not found in Student A completed history!');
    }
    console.log(`✓ Student A sees trade ${histA.id} in completed history with partner campus: ${histA.fulfiller.campus}`);

    // Student B history query
    const { data: histB } = await clientB
      .from('trades')
      .select('id, status, completed_at, amount, requester:profiles!trades_requester_id_fkey(campus), fulfiller:profiles!trades_fulfiller_id_fkey(campus)')
      .eq('id', tradeId)
      .eq('status', 'COMPLETED')
      .single();
    if (!histB || histB.status !== 'COMPLETED') {
      throw new Error('FAILED: Trade not found in Student B completed history!');
    }
    console.log(`✓ Student B sees trade ${histB.id} in completed history with partner campus: ${histB.requester.campus}`);

    // --------------------------------------------------------------------------
    // 9. Mutual Ratings
    // --------------------------------------------------------------------------
    console.log('\nSTEP 9: Submitting mutual ratings...');

    // Student A rates Student B
    const { data: rateA, error: rateAErr } = await clientA.rpc('submit_trade_rating', {
      p_trade_id: tradeId,
      p_rating: 5,
      p_comment: 'Excellent SVECW partner, arrived on time with exact change!',
    });
    if (rateAErr || !rateA?.success) {
      throw new Error('Rating by Student A failed: ' + (rateAErr?.message || rateA?.error));
    }
    console.log('✓ Student A rated Student B (5 stars):', rateA.message);

    // Student B rates Student A
    const { data: rateB, error: rateBErr } = await clientB.rpc('submit_trade_rating', {
      p_trade_id: tradeId,
      p_rating: 5,
      p_comment: 'Great Vishnu partner, instant UPI transfer!',
    });
    if (rateBErr || !rateB?.success) {
      throw new Error('Rating by Student B failed: ' + (rateBErr?.message || rateB?.error));
    }
    console.log('✓ Student B rated Student A (5 stars):', rateB.message);

    // Duplicate rating blocked
    const { data: dupRate } = await clientA.rpc('submit_trade_rating', {
      p_trade_id: tradeId,
      p_rating: 4,
      p_comment: 'Duplicate test',
    });
    if (dupRate?.success) {
      throw new Error('FAILED: Duplicate rating was allowed!');
    }
    console.log('✓ Duplicate rating blocked:', dupRate?.error);

    // --------------------------------------------------------------------------
    // 10. Unauthorized Third-Party Isolation
    // --------------------------------------------------------------------------
    console.log('\nSTEP 10: Verifying Unauthorized Third-Party Isolation...');

    // Outsider cannot read trade room
    const { data: outTrades } = await clientC
      .from('trades')
      .select('id, amount, status')
      .eq('id', tradeId);
    if (outTrades && outTrades.length > 0) {
      throw new Error('SECURITY VIOLATION: Unauthorized third user could read trade room!');
    }
    console.log('✓ Outsider cannot view private trade room (0 rows returned by RLS)');

    // Outsider cannot read chat messages
    const { data: outMsgs } = await clientC
      .from('trade_messages')
      .select('id, message')
      .eq('trade_id', tradeId);
    if (outMsgs && outMsgs.length > 0) {
      throw new Error('SECURITY VIOLATION: Unauthorized third user could read trade messages!');
    }
    console.log('✓ Outsider cannot view private trade messages (0 rows returned by RLS)');

    // Outsider cannot send message
    const { error: outSendErr } = await clientC.from('trade_messages').insert({
      trade_id: tradeId,
      sender_id: userC.id,
      message: 'Intruder message',
    });
    if (!outSendErr) {
      throw new Error('SECURITY VIOLATION: Unauthorized third user was able to inject a message!');
    }
    console.log('✓ Outsider message insert strictly blocked by RLS');

    // Outsider cannot access partner UPI
    const { data: outUpi, error: outUpiErr } = await clientC.rpc('get_trade_partner_upi', {
      p_trade_id: tradeId,
    });
    if (!outUpiErr && outUpi) {
      throw new Error('SECURITY VIOLATION: Unauthorized third user accessed trade partner UPI!');
    }
    console.log('✓ Outsider access to partner UPI strictly rejected');

    console.log('\n================================================================');
    console.log('ALL PRODUCTION FLOW VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
    console.log('================================================================\n');

  } finally {
    await pg.end();
  }
}

runCrossCollegeE2ETest().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
