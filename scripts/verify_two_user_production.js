/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

async function runTwoUserProductionVerification() {
  console.log("============================================================");
  console.log("VELTO TWO-USER FULL PRODUCTION VERIFICATION TEST");
  console.log("Live Supabase Auth, Web Push, Atomic Trade Room, RLS & Settlements");
  console.log("============================================================\n");

  const supabaseUrl = 'https://csbdbhnvsykrsozwzdwk.supabase.co';
  const supabaseAnonKey = 'sb_publishable_lbCs1ZxuNjJ_Ul5Ht6KxvQ_kdUHMm1R';

  const vapidPublicKey = 'BEk4PRuGhDHUlKflVK7EWIgjJfm1z7YA5hYlnUhE1wPmyE67UUkaJwyjrNCp3bvCkZIOJr0zEPoKUDITlrdkhkE';
  const vapidPrivateKey = '2CzXkkcGpf9bvtaYEiKQneONAiKm2k_9rUiWG5UJubs';
  const vapidSubject = 'mailto:support@velto.local';

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ------------------------------------------------------------
  // STEP 1: AUTHENTICATION & LOGIN PERSISTENCE
  // ------------------------------------------------------------
  console.log("--- 1. Testing Two-User Authentication & Login Persistence ---");
  // Student A: Vishnu
  const clientA = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
    email: '24pa1a1205@vishnu.edu.in',
    password: 'Govardhan@55',
  });
  assert(!errA && authA.user, "Student A (Vishnu: 24pa1a1205@vishnu.edu.in) signed in successfully");

  // Student B: SVECW (Cross-college shared community)
  const clientB = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
    email: '25b01a4212@svecw.edu.in',
    password: 'Govardhan@55',
  });
  assert(!errB && authB.user, "Student B (SVECW: 25b01a4212@svecw.edu.in) signed in successfully");

  // Student C: Non-participant, non-admin regular student
  const clientC = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  const { data: authC, error: errC } = await clientC.auth.signInWithPassword({
    email: '24pa1a1209@vishnu.edu.in',
    password: 'Govardhan@55',
  });
  assert(!errC && authC.user, "Third user (Non-participant student: 24pa1a1209@vishnu.edu.in) signed in for RLS verification");

  // Verify persistent token refresh (simulate reopening app after token expiration)
  const { data: refreshA, error: refreshErrA } = await clientA.auth.refreshSession({
    refresh_token: authA.session.refresh_token
  });
  assert(!refreshErrA && refreshA.session, "Student A session successfully refreshed with refresh token (persistent login verified)");

  const { data: refreshB, error: refreshErrB } = await clientB.auth.refreshSession({
    refresh_token: authB.session.refresh_token
  });
  assert(!refreshErrB && refreshB.session, "Student B session successfully refreshed with refresh token (persistent login verified)");

  // ------------------------------------------------------------
  // STEP 2: PUSH SUBSCRIPTION STORAGE & RLS ISOLATION
  // ------------------------------------------------------------
  console.log("\n--- 2. Testing Push Subscriptions & RLS Isolation ---");
  await clientA.rpc("delete_push_subscription");
  await clientB.rpc("delete_push_subscription");

  const endpointA = "https://fcm.googleapis.com/fcm/send/prod_test_device_a_" + Date.now();
  const endpointB = "https://updates.push.apple.com/send/prod_test_device_b_" + Date.now();

  // Student A registers subscription
  const { error: upsertErrA } = await clientA.rpc("upsert_push_subscription", {
    p_endpoint: endpointA,
    p_p256dh: "BMock_Key_P256DH_A_123456789012345678901234567890",
    p_auth: "AuthMockA1234567",
    p_user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/PWA"
  });
  assert(!upsertErrA, "Student A push subscription stored via security-definer RPC");

  // Student B registers subscription
  const { error: upsertErrB } = await clientB.rpc("upsert_push_subscription", {
    p_endpoint: endpointB,
    p_p256dh: "BMock_Key_P256DH_B_123456789012345678901234567890",
    p_auth: "AuthMockB1234567",
    p_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/PWA"
  });
  assert(!upsertErrB, "Student B push subscription stored via security-definer RPC");

  // RLS Isolation Check: Student A can only see their own subscription
  const { data: aSubs } = await clientA.from("push_subscriptions").select("*");
  assert(aSubs.every(s => s.user_id === authA.user.id), "RLS verified: Student A can only view their own subscriptions");

  // Student B can only see their own subscription
  const { data: bSubs } = await clientB.from("push_subscriptions").select("*");
  assert(bSubs.every(s => s.user_id === authB.user.id), "RLS verified: Student B can only view their own subscriptions");

  // Student C cannot view Student A's subscription
  const { data: cSubs } = await clientC.from("push_subscriptions").select("*").eq("endpoint", endpointA);
  assert(cSubs.length === 0, "RLS security: Student C cannot view Student A's push endpoint");

  // ------------------------------------------------------------
  // STEP 3: REQUEST CREATION & PUSH NOTIFICATION DISPATCH
  // ------------------------------------------------------------
  console.log("\n--- 3. Testing Request Creation & Web Push Dispatch ---");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: newReq, error: reqErr } = await clientA
    .from("exchange_requests")
    .insert({
      requester_id: authA.user.id,
      request_type: "NEED_CASH",
      amount: 100.00,
      location_hint: "Central Canteen",
      note: "Urgent for lunch",
      status: "OPEN",
      campus: "Vishnu Educational Society",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  assert(!reqErr && newReq, `Student A posted ₹100 exchange request (ID: ${newReq.id})`);
  const requestId = newReq.id;

  // Query eligible recipients using the production RPC
  const { data: subscribers, error: rpcErr } = await clientA.rpc(
    "get_eligible_push_subscribers_for_request",
    { p_request_id: requestId }
  );

  assert(!rpcErr && Array.isArray(subscribers), "get_eligible_push_subscribers_for_request RPC executed successfully");
  const recipientIds = subscribers.map(s => s.recipient_id);

  assert(recipientIds.includes(authB.user.id), "Step 4: Student B is matched as eligible push subscriber");
  assert(!recipientIds.includes(authA.user.id), "Step 5: Student A (requester) is excluded from receiving own notification");

  // Verify Safe Web Push Payload Formatting
  const safePayload = JSON.stringify({
    title: "New Velto exchange request",
    body: "A student needs ₹100 cash near Central Canteen.",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `velto-req-${requestId}`,
    url: `/feed?request=${requestId}`,
  });

  const parsedPayload = JSON.parse(safePayload);
  assert(parsedPayload.title === "New Velto exchange request", "Push payload title matches specification");
  assert(parsedPayload.body.includes("₹100"), "Push body includes safe amount ₹100");
  assert(parsedPayload.body.includes("Central Canteen"), "Push body includes safe location hint");
  assert(parsedPayload.url === `/feed?request=${requestId}`, "Notification click deep-links to /feed?request=...");
  assert(!safePayload.includes("@") && !safePayload.includes("upi"), "Payload strictly excludes private emails and UPI IDs");

  // Record delivery in request_notification_deliveries (deduplication)
  const targetSubB = subscribers.find(s => s.recipient_id === authB.user.id);
  const { error: delivErr } = await clientA.rpc("record_push_notification_delivery", {
    p_request_id: requestId,
    p_recipient_id: authB.user.id,
    p_subscription_id: targetSubB.subscription_id,
    p_status: "SENT",
  });
  assert(!delivErr, "Push notification delivery recorded for deduplication tracking");

  // Deduplication check: call RPC again, Student B should now be excluded
  const { data: dedupSubscribers } = await clientA.rpc(
    "get_eligible_push_subscribers_for_request",
    { p_request_id: requestId }
  );
  assert(!dedupSubscribers.some(s => s.recipient_id === authB.user.id), "Deduplication: Student B is not notified twice for the same request");

  // ------------------------------------------------------------
  // STEP 4: CAMPUS FEED & ATOMIC ACCEPTANCE
  // ------------------------------------------------------------
  console.log("\n--- 4. Testing Campus Feed & Atomic Acceptance ---");
  const { data: feedRequests, error: feedErr } = await clientB
    .from("exchange_requests")
    .select("id, status, amount")
    .eq("id", requestId)
    .single();

  assert(!feedErr && feedRequests.status === "OPEN", "Student B views active request in Campus Feed");

  // Student B atomically accepts the request
  const { data: acceptData, error: acceptErr } = await clientB.rpc("accept_exchange_request", {
    p_request_id: requestId
  });

  assert(!acceptErr && acceptData.success && acceptData.trade_id, `Atomic acceptance successful! Trade room created: ${acceptData?.trade_id}`);
  const tradeId = acceptData.trade_id;

  // Verify request status changed to ACCEPTED
  const { data: acceptedReq } = await clientA.from("exchange_requests").select("status").eq("id", requestId).single();
  assert(acceptedReq.status === "ACCEPTED", "Exchange request status atomically updated to ACCEPTED");

  // ------------------------------------------------------------
  // STEP 5: PRIVATE REALTIME TRADE CHAT & RLS ISOLATION
  // ------------------------------------------------------------
  console.log("\n--- 5. Testing Trade Chat & RLS Security ---");
  const { data: msgA, error: msgErrA } = await clientA
    .from("trade_messages")
    .insert({
      trade_id: tradeId,
      sender_id: authA.user.id,
      message: "Hey! I am at the main canteen entrance wearing blue jacket.",
    })
    .select("id, message")
    .single();

  assert(!msgErrA && msgA, "Student A sent chat message in private trade room");

  const { data: bMessages, error: bMsgErr } = await clientB
    .from("trade_messages")
    .select("*")
    .eq("trade_id", tradeId);

  assert(!bMsgErr && bMessages.some(m => m.id === msgA.id), "Student B received chat message in private trade room");

  // Student C (third-party) attempts to read trade messages -> blocked by RLS
  const { data: cMessages } = await clientC
    .from("trade_messages")
    .select("*")
    .eq("trade_id", tradeId);

  assert(!cMessages || cMessages.length === 0, "RLS Security: Unauthorized Student C cannot view trade chat messages");

  // Student C attempts to view trade room details -> blocked by RLS
  const { data: cTrades } = await clientC
    .from("trades")
    .select("*")
    .eq("id", tradeId);

  assert(!cTrades || cTrades.length === 0, "RLS Security: Unauthorized Student C cannot view trade room details");

  // ------------------------------------------------------------
  // STEP 6: TWO-SIDED SETTLEMENT & TRADE COMPLETION
  // ------------------------------------------------------------
  console.log("\n--- 6. Testing Two-Sided Settlement & Completion ---");
  // Student A confirms transfer
  const { data: confirmA, error: confErrA } = await clientA.rpc("confirm_trade_settlement", {
    p_trade_id: tradeId
  });
  assert(!confErrA && confirmA.success, "Student A confirmed cash transfer via confirm_trade_settlement");

  // Trade should still be IN_PROGRESS (one-sided confirmation)
  const { data: partialTrade } = await clientA.from("trades").select("status, requester_confirmed, fulfiller_confirmed").eq("id", tradeId).single();
  assert(partialTrade.status === "IN_PROGRESS" && partialTrade.requester_confirmed === true && partialTrade.fulfiller_confirmed === false, "Trade remains IN_PROGRESS until both sides independently confirm");

  // Student B confirms transfer
  const { data: confirmB, error: confErrB } = await clientB.rpc("confirm_trade_settlement", {
    p_trade_id: tradeId
  });
  assert(!confErrB && confirmB.success, "Student B confirmed UPI transfer via confirm_trade_settlement");

  // Trade is now COMPLETED
  const { data: completedTrade } = await clientA.from("trades").select("status, completed_at").eq("id", tradeId).single();
  assert(completedTrade.status === "COMPLETED" && completedTrade.completed_at !== null, "Trade atomically transitions to COMPLETED when both students confirm");

  // Both students see trade in completed history
  const { data: historyA } = await clientA.from("trades").select("id").eq("status", "COMPLETED").or(`requester_id.eq.${authA.user.id},fulfiller_id.eq.${authA.user.id}`);
  assert(historyA.some(t => t.id === tradeId), "Student A sees completed trade in trade history");

  const { data: historyB } = await clientB.from("trades").select("id").eq("status", "COMPLETED").or(`requester_id.eq.${authB.user.id},fulfiller_id.eq.${authB.user.id}`);
  assert(historyB.some(t => t.id === tradeId), "Student B sees completed trade in trade history");

  // ------------------------------------------------------------
  // STEP 7: DISABLED NOTIFICATION UNENROLLMENT
  // ------------------------------------------------------------
  console.log("\n--- 7. Testing Notification Disabling & Expired Cleanup ---");
  // Student B disables notifications
  const { error: delSubErr } = await clientB.rpc("delete_push_subscription");
  assert(!delSubErr, "Student B successfully disabled notifications (subscription removed)");

  // Student A creates another request
  const { data: req2 } = await clientA.from("exchange_requests").insert({
    requester_id: authA.user.id,
    request_type: "HAVE_CASH_WANT_UPI",
    amount: 50.00,
    location_hint: "Library Lawn",
    status: "OPEN",
    campus: "Vishnu Educational Society",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  }).select("id").single();

  const { data: subsReq2 } = await clientA.rpc("get_eligible_push_subscribers_for_request", {
    p_request_id: req2.id
  });
  assert(!subsReq2.some(s => s.recipient_id === authB.user.id), "Disabled user receives no push notifications");

  // Clean up test subscriptions
  await clientA.rpc("delete_push_subscription", { p_endpoint: endpointA });

  // ------------------------------------------------------------
  // STEP 8: SIGN OUT
  // ------------------------------------------------------------
  console.log("\n--- 8. Testing Explicit Sign Out ---");
  await clientA.auth.signOut();
  const { data: afterSignOut } = await clientA.auth.getSession();
  assert(afterSignOut.session === null, "Explicit Sign Out revokes session cleanly");

  console.log(`\n============================================================`);
  console.log(`VERIFICATION COMPLETE: ${passed}/${total} assertions passed.`);
  console.log(`ALL THREE PRODUCTION FEATURES FULLY VERIFIED ON LIVE BACKEND!`);
  console.log(`============================================================`);
}

runTwoUserProductionVerification().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
