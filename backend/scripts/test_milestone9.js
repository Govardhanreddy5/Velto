/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone9Tests() {
  const client = new Client({
    connectionString: 'postgresql://postgres:YOUR_DB_PASSWORD@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 9: REPORTS, DISPUTES & SECURE ADMIN MODERATION TESTS ===\n');

  // Fetch test users
  const usersRes = await client.query(`
    SELECT id, email, full_name, is_onboarded, campus, is_admin, is_suspended, is_banned 
    FROM public.profiles 
    LIMIT 4;
  `);

  if (usersRes.rows.length < 4) {
    console.error('Need at least 4 users for Milestone 9 testing.');
    await client.end();
    return;
  }

  const adminUser = usersRes.rows[0];
  const requester = usersRes.rows[1];
  const fulfiller = usersRes.rows[2];
  const outsider = usersRes.rows[3];

  // Configure baseline: set adminUser as admin, others as normal active students
  await client.query(`
    UPDATE public.profiles 
    SET is_admin = true, is_onboarded = true, is_suspended = false, is_banned = false 
    WHERE id = $1;
  `, [adminUser.id]);

  await client.query(`
    UPDATE public.profiles 
    SET is_admin = false, is_onboarded = true, is_suspended = false, is_banned = false 
    WHERE id IN ($1, $2, $3);
  `, [requester.id, fulfiller.id, outsider.id]);

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

  // Helper to execute as a specific authenticated user
  async function runAsUser(c, userId, queryText, params = []) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    try {
      return await c.query(queryText, params);
    } finally {
      await c.query("RESET ROLE;");
    }
  }

  // Helper to create a test trade
  async function createTestTrade(c, reqId, fulId, status = 'IN_PROGRESS') {
    const r = await c.query(`
      INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, status, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 250.00, 'Student Union Hall', 'ACCEPTED', 'Main Campus', NOW() + INTERVAL '2 hours')
      RETURNING id;
    `, [reqId]);
    const requestId = r.rows[0].id;

    const t = await c.query(`
      INSERT INTO public.trades (
        request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location,
        requester_confirmed, fulfiller_confirmed
      ) VALUES ($1, $2, $3, 250.00, 'NEED_CASH', $4, 'Student Union Hall', false, false)
      RETURNING id;
    `, [requestId, reqId, fulId, status]);
    return t.rows[0].id;
  }

  const tradeId = await createTestTrade(client, requester.id, fulfiller.id, 'IN_PROGRESS');

  // -------------------------------------------------------------
  // TEST 1: Participant can report a trade partner
  // -------------------------------------------------------------
  console.log('--- Test 1: Participant Reports Trade Partner ---');
  const res1 = await runAsUser(
    client,
    requester.id,
    "SELECT public.submit_trade_report($1, $2, $3) as result;",
    [tradeId, 'NO_SHOW', 'Partner did not show up after 20 minutes waiting at Student Union.']
  );
  const result1 = res1.rows[0].result;
  assert(
    result1.success === true && result1.report_id !== undefined,
    'Requester successfully reported fulfiller for NO_SHOW'
  );
  const reportId = result1.report_id;

  // Verify DB record
  const reportRow = await client.query('SELECT * FROM public.safety_reports WHERE id = $1;', [reportId]);
  assert(
    reportRow.rows.length === 1 &&
    reportRow.rows[0].reporter_id === requester.id &&
    reportRow.rows[0].reported_user_id === fulfiller.id &&
    reportRow.rows[0].trade_id === tradeId &&
    reportRow.rows[0].reason === 'NO_SHOW' &&
    reportRow.rows[0].status === 'PENDING',
    'Safety report record verified: correct reporter, reported partner, and PENDING status'
  );

  // -------------------------------------------------------------
  // TEST 2: Duplicate open report for same reason is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Duplicate Open Report Rejected ---');
  const resDup = await runAsUser(
    client,
    requester.id,
    "SELECT public.submit_trade_report($1, $2, $3) as result;",
    [tradeId, 'NO_SHOW', 'Duplicate attempt']
  );
  assert(
    resDup.rows[0].result.success === false &&
    resDup.rows[0].result.error.includes('already have an open report'),
    'Duplicate open report for same reason rejected'
  );

  // -------------------------------------------------------------
  // TEST 3: Outsider cannot report an unrelated trade
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Outsider Cannot Report Unrelated Trade ---');
  const resOutsider = await runAsUser(
    client,
    outsider.id,
    "SELECT public.submit_trade_report($1, $2, $3) as result;",
    [tradeId, 'FRAUD_SUSPICION', 'Outsider trying to interfere']
  );
  assert(
    resOutsider.rows[0].result.success === false &&
    resOutsider.rows[0].result.error.includes('not a participant'),
    'Outsider report rejected: "Access denied: You are not a participant in this trade."'
  );

  // -------------------------------------------------------------
  // TEST 4: Detail length > 1,000 characters is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Detail Length Boundary (max 1000 chars) ---');
  const longDetails = 'x'.repeat(1001);
  const resLong = await runAsUser(
    client,
    requester.id,
    "SELECT public.submit_trade_report($1, $2, $3) as result;",
    [tradeId, 'OTHER', longDetails]
  );
  assert(
    resLong.rows[0].result.success === false &&
    resLong.rows[0].result.error.includes('1,000 characters'),
    'Report with details over 1,000 characters rejected'
  );

  // -------------------------------------------------------------
  // TEST 5: Privilege Escalation Blocked
  // Non-admin cannot promote themselves to admin or unban/unsuspend
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Privilege Escalation Blocked by Database Trigger ---');
  let escalationBlocked = false;
  try {
    await runAsUser(
      client,
      requester.id,
      "UPDATE public.profiles SET is_admin = true WHERE id = $1;",
      [requester.id]
    );
  } catch (err) {
    if (err.message.includes('Only campus administrators') || err.message.includes('Unauthorized')) {
      escalationBlocked = true;
    }
  }
  assert(escalationBlocked, 'Regular user cannot set is_admin = true on themselves (trigger raises Unauthorized)');

  // -------------------------------------------------------------
  // TEST 6: Non-Admin Cannot Access Moderation Audit Logs
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Non-Admin Cannot Access Audit Logs ---');
  const auditRes = await runAsUser(
    client,
    requester.id,
    "SELECT * FROM public.moderation_audit_logs;"
  );
  assert(
    auditRes.rows.length === 0,
    'Non-admin cannot see moderation audit logs (RLS returns 0 rows)'
  );

  // -------------------------------------------------------------
  // TEST 7: Non-Admin Cannot Execute Moderation Actions
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Non-Admin Calling admin_moderate_user Rejected ---');
  const resNonAdminMod = await runAsUser(
    client,
    requester.id,
    "SELECT public.admin_moderate_user($1, 'SUSPEND_USER', 'Malicious attempt') as result;",
    [fulfiller.id]
  );
  assert(
    resNonAdminMod.rows[0].result.success === false &&
    resNonAdminMod.rows[0].result.error.includes('Admin privileges required'),
    'Non-admin calling admin_moderate_user rejected: "Admin privileges required."'
  );

  // -------------------------------------------------------------
  // TEST 8: Non-Admin Cannot Update Report Status
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Non-Admin Calling admin_update_report_status Rejected ---');
  const resNonAdminStatus = await runAsUser(
    client,
    requester.id,
    "SELECT public.admin_update_report_status($1, 'RESOLVED', 'Dismissing my own report') as result;",
    [reportId]
  );
  assert(
    resNonAdminStatus.rows[0].result.success === false &&
    resNonAdminStatus.rows[0].result.error.includes('Admin privileges required'),
    'Non-admin calling admin_update_report_status rejected'
  );

  // -------------------------------------------------------------
  // TEST 9: Admin Can Update Report Status (INVESTIGATING, RESOLVED)
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Admin Updates Report Status with Notes ---');
  const resAdminInvestigate = await runAsUser(
    client,
    adminUser.id,
    "SELECT public.admin_update_report_status($1, 'INVESTIGATING', 'Contacting fulfiller for statement') as result;",
    [reportId]
  );
  assert(
    resAdminInvestigate.rows[0].result.success === true &&
    resAdminInvestigate.rows[0].result.status === 'INVESTIGATING',
    'Admin successfully marked report as INVESTIGATING'
  );

  const resAdminResolve = await runAsUser(
    client,
    adminUser.id,
    "SELECT public.admin_update_report_status($1, 'RESOLVED', 'Issue resolved after student consultation') as result;",
    [reportId]
  );
  assert(
    resAdminResolve.rows[0].result.success === true &&
    resAdminResolve.rows[0].result.status === 'RESOLVED',
    'Admin successfully marked report as RESOLVED'
  );

  // -------------------------------------------------------------
  // TEST 10: Audit Log Created for Report Status Changes
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Audit Log Created for Report Status Update ---');
  const adminAuditRes = await runAsUser(
    client,
    adminUser.id,
    "SELECT * FROM public.moderation_audit_logs WHERE report_id = $1;",
    [reportId]
  );
  assert(
    adminAuditRes.rows.length >= 2 &&
    adminAuditRes.rows[0].admin_id === adminUser.id &&
    adminAuditRes.rows[0].action === 'UPDATE_REPORT_STATUS',
    'Audit log entries verified for admin report updates'
  );

  // -------------------------------------------------------------
  // TEST 11: Admin Can Suspend User
  // -------------------------------------------------------------
  console.log('\n--- Test 11: Admin Suspends User with Reason ---');
  const resSuspend = await runAsUser(
    client,
    adminUser.id,
    "SELECT public.admin_moderate_user($1, 'SUSPEND_USER', 'Repeated no-show at meetup', $2) as result;",
    [fulfiller.id, reportId]
  );
  assert(
    resSuspend.rows[0].result.success === true,
    'Admin successfully suspended fulfiller'
  );

  const profSuspended = await client.query('SELECT is_suspended, is_banned FROM public.profiles WHERE id = $1;', [fulfiller.id]);
  assert(
    profSuspended.rows[0].is_suspended === true && profSuspended.rows[0].is_banned === false,
    'Fulfiller profile reflects is_suspended = true'
  );

  // -------------------------------------------------------------
  // TEST 12: Suspended User Blocked From Marketplace Actions
  // -------------------------------------------------------------
  console.log('\n--- Test 12: Suspended User Blocked from Marketplace Actions ---');

  // A. Blocked from creating request
  let reqBlocked = false;
  try {
    await runAsUser(
      client,
      fulfiller.id,
      `INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 100.00, 'Test Spot', 'Main Campus', NOW() + INTERVAL '1 hour');`,
      [fulfiller.id]
    );
  } catch (err) {
    reqBlocked = true;
  }
  assert(reqBlocked, 'Suspended user blocked from creating exchange requests (RLS check failed)');

  // B. Blocked from accepting request
  const testReq = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 100.00, 'Test Spot', 'OPEN', 'Main Campus', NOW() + INTERVAL '1 hour')
    RETURNING id;
  `, [requester.id]);
  const testReqId = testReq.rows[0].id;

  const resAccept = await runAsUser(
    client,
    fulfiller.id,
    "SELECT public.accept_exchange_request($1) as result;",
    [testReqId]
  );
  assert(
    resAccept.rows[0].result.success === false &&
    resAccept.rows[0].result.error.includes('restricted'),
    'Suspended user blocked from accepting exchange requests'
  );

  // C. Blocked from sending trade chat messages
  let chatBlocked = false;
  try {
    await runAsUser(
      client,
      fulfiller.id,
      "INSERT INTO public.trade_messages (trade_id, sender_id, message) VALUES ($1, $2, 'hello');",
      [tradeId, fulfiller.id]
    );
  } catch (err) {
    chatBlocked = true;
  }
  assert(chatBlocked, 'Suspended user blocked from sending chat messages (RLS blocked)');

  // D. Blocked from confirming settlement
  const resConfirm = await runAsUser(
    client,
    fulfiller.id,
    "SELECT public.confirm_trade_settlement($1) as result;",
    [tradeId]
  );
  assert(
    resConfirm.rows[0].result.success === false &&
    resConfirm.rows[0].result.error.includes('restricted'),
    'Suspended user blocked from confirming trade settlement'
  );

  // E. Blocked from rating
  const resRating = await runAsUser(
    client,
    fulfiller.id,
    "SELECT public.submit_trade_rating($1, 5) as result;",
    [tradeId]
  );
  assert(
    resRating.rows[0].result.success === false &&
    resRating.rows[0].result.error.includes('restricted'),
    'Suspended user blocked from submitting ratings'
  );

  // -------------------------------------------------------------
  // TEST 13: Admin Can Ban User Permanently
  // -------------------------------------------------------------
  console.log('\n--- Test 13: Admin Bans User Permanently ---');
  const resBan = await runAsUser(
    client,
    adminUser.id,
    "SELECT public.admin_moderate_user($1, 'BAN_USER', 'Severe repeated fraud attempt', $2) as result;",
    [fulfiller.id, reportId]
  );
  assert(
    resBan.rows[0].result.success === true,
    'Admin successfully permanently banned fulfiller'
  );
  const profBanned = await client.query('SELECT is_banned FROM public.profiles WHERE id = $1;', [fulfiller.id]);
  assert(profBanned.rows[0].is_banned === true, 'Fulfiller profile reflects is_banned = true');

  // -------------------------------------------------------------
  // TEST 14: Admin Can Restore User
  // -------------------------------------------------------------
  console.log('\n--- Test 14: Admin Restores User ---');
  const resRestore = await runAsUser(
    client,
    adminUser.id,
    "SELECT public.admin_moderate_user($1, 'RESTORE_USER', 'Appealed and completed hearing', $2) as result;",
    [fulfiller.id, reportId]
  );
  assert(
    resRestore.rows[0].result.success === true,
    'Admin successfully restored fulfiller account'
  );
  const profRestored = await client.query('SELECT is_suspended, is_banned FROM public.profiles WHERE id = $1;', [fulfiller.id]);
  assert(
    profRestored.rows[0].is_suspended === false && profRestored.rows[0].is_banned === false,
    'Fulfiller profile reflects restored active state (is_suspended = false, is_banned = false)'
  );

  // -------------------------------------------------------------
  // TEST 15: Privacy & Audit Trail Integrity
  // -------------------------------------------------------------
  console.log('\n--- Test 15: Privacy & Audit Trail Integrity ---');
  const allLogs = await client.query(`
    SELECT action, reason, target_user_id 
    FROM public.moderation_audit_logs 
    WHERE admin_id = $1 
    ORDER BY created_at DESC;
  `, [adminUser.id]);
  assert(
    allLogs.rows.length >= 4,
    `Audit trail captures all moderation actions (found ${allLogs.rows.length} log events)`
  );

  // Cleanup: Reset test users baseline
  await client.query(`
    UPDATE public.profiles 
    SET is_suspended = false, is_banned = false 
    WHERE id IN ($1, $2, $3, $4);
  `, [adminUser.id, requester.id, fulfiller.id, outsider.id]);

  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

runMilestone9Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
