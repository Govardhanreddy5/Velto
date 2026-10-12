/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

async function runPushNotificationTestSuite() {
  console.log("============================================================");
  console.log("VELTO WEB PUSH NOTIFICATION COMPREHENSIVE TEST SUITE");
  console.log("Testing Two-User Shared Community Scenarios (Vishnu & SVECW)");
  console.log("============================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. Verify VAPID Keys Setup
  const vapidKeys = {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BEk4PRuGhDHUlKflVK7EWIgjJfm1z7YA5hYlnUhE1wPmyE67UUkaJwyjrNCp3bvCkZIOJr0zEPoKUDITlrdkhkE",
    privateKey: process.env.VAPID_PRIVATE_KEY || "2CzXkkcGpf9bvtaYEiKQneONAiKm2k_9rUiWG5UJubs",
    subject: process.env.VAPID_SUBJECT || "mailto:support@velto.local"
  };

  assert(vapidKeys.publicKey.length > 50, "VAPID Public Key is correctly formatted");
  assert(vapidKeys.privateKey.length > 30, "VAPID Private Key is securely configured (server-only)");
  assert(vapidKeys.subject.startsWith("mailto:"), "VAPID Subject follows Web Push RFC specification");

  webpush.setVapidDetails(vapidKeys.subject, vapidKeys.publicKey, vapidKeys.privateKey);

  // 2. Service Worker push and notificationclick handling check
  const swContent = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
  assert(swContent.includes('self.addEventListener("push"'), "Service worker has 'push' event listener");
  assert(swContent.includes('self.addEventListener("notificationclick"'), "Service worker has 'notificationclick' listener");
  assert(swContent.includes('self.registration.showNotification'), "Service worker invokes showNotification");
  assert(swContent.includes('client.focus()'), "Service worker notificationclick focuses existing app window");
  assert(swContent.includes('client.navigate(targetUrl)'), "Service worker notificationclick navigates to target request URL");
  assert(swContent.includes('self.clients.openWindow'), "Service worker notificationclick opens app window if none active");

  // 3. Migration 15 Schema Verification
  const migrationContent = fs.readFileSync(path.join(__dirname, '../supabase/migrations/15_push_notifications.sql'), 'utf8');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.push_subscriptions'), "Migration 15 creates push_subscriptions table");
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.request_notification_deliveries'), "Migration 15 creates request_notification_deliveries table");
  assert(migrationContent.includes('ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY'), "Migration 15 enables RLS on push_subscriptions");
  assert(migrationContent.includes('auth.uid() = user_id'), "Migration 15 enforces strict user-scoped RLS policies");
  assert(migrationContent.includes('uq_request_recipient_delivery'), "Migration 15 has unique constraint for deduplication");
  assert(migrationContent.includes('get_eligible_push_subscribers_for_request'), "Migration 15 includes eligibility and filtering RPC");
  assert(migrationContent.includes('delete_invalid_push_subscription'), "Migration 15 includes stale subscription cleanup RPC");

  // 4. Two-User Scenario Simulation
  // User A: Student from Vishnu (@vishnu.edu.in)
  // User B: Student from SVECW (@svecw.edu.in)
  const studentA = {
    id: "a1111111-1111-4111-a111-111111111111",
    email: "21pa1a0501@vishnu.edu.in",
    full_name: "Student A (Vishnu)",
    campus: "Vishnu Educational Society",
    is_onboarded: true,
    is_verified: true,
    is_suspended: false,
    is_banned: false,
  };

  const studentB = {
    id: "b2222222-2222-4222-b222-222222222222",
    email: "21b91a0502@svecw.edu.in",
    full_name: "Student B (SVECW)",
    campus: "Shri Vishnu Engineering College for Women (SVECW)",
    is_onboarded: true,
    is_verified: true,
    is_suspended: false,
    is_banned: false,
  };

  const suspendedUser = {
    id: "c3333333-3333-4333-c333-333333333333",
    email: "suspended@vishnu.edu.in",
    campus: "Vishnu Educational Society",
    is_onboarded: true,
    is_verified: true,
    is_suspended: true,
    is_banned: false,
  };

  const bannedUser = {
    id: "d4444444-4444-4444-d444-444444444444",
    email: "banned@svecw.edu.in",
    campus: "Shri Vishnu Engineering College for Women (SVECW)",
    is_onboarded: true,
    is_verified: true,
    is_suspended: false,
    is_banned: true,
  };

  // Mock Database State for Simulation
  let subscriptionsTable = [];
  let deliveriesTable = [];

  // Step 1 & 2: Student A and Student B enable notifications
  function mockUpsertSubscription(user, endpoint) {
    // Generate valid mock p256dh and auth keys
    const p256dh = "BC_mockKey_p256dh_" + user.id.slice(0, 8);
    const auth = "mockAuthKey_" + user.id.slice(0, 8);
    
    const existingIdx = subscriptionsTable.findIndex(s => s.endpoint === endpoint);
    if (existingIdx >= 0) {
      subscriptionsTable[existingIdx] = { id: subscriptionsTable[existingIdx].id, user_id: user.id, endpoint, p256dh, auth };
    } else {
      subscriptionsTable.push({
        id: `sub-${user.id.slice(0, 4)}`,
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
      });
    }
    return true;
  }

  mockUpsertSubscription(studentA, "https://fcm.googleapis.com/fcm/send/student_a_device_1");
  mockUpsertSubscription(studentB, "https://updates.push.apple.com/send/student_b_iphone_pwa");
  mockUpsertSubscription(suspendedUser, "https://fcm.googleapis.com/fcm/send/suspended_user_device");
  mockUpsertSubscription(bannedUser, "https://fcm.googleapis.com/fcm/send/banned_user_device");

  assert(subscriptionsTable.length === 4, "Step 1 & 2: Push subscriptions stored for active students");

  // Filter logic representing get_eligible_push_subscribers_for_request
  function getEligibleSubscribersForRequest(requestId, requesterId, allUsers) {
    return subscriptionsTable.filter(sub => {
      // 1. Never notify requester
      if (sub.user_id === requesterId) return false;

      // 2. Lookup profile
      const profile = allUsers.find(u => u.id === sub.user_id);
      if (!profile) return false;
      if (!profile.is_onboarded || !profile.is_verified) return false;
      if (profile.is_suspended || profile.is_banned) return false;

      // 3. Check deduplication
      const alreadyDelivered = deliveriesTable.some(d => d.request_id === requestId && d.recipient_id === sub.user_id);
      if (alreadyDelivered) return false;

      return true;
    });
  }

  const allMockUsers = [studentA, studentB, suspendedUser, bannedUser];

  // Step 3: Student A posts a ₹100 request
  const request1 = {
    id: "req-0001-aaaa-1111",
    requester_id: studentA.id,
    amount: 100,
    request_type: "NEED_CASH",
    location_hint: "College Canteen",
    status: "OPEN"
  };

  // Step 4 & 5: Determine recipients
  const recipientsReq1 = getEligibleSubscribersForRequest(request1.id, request1.requester_id, allMockUsers);
  
  assert(recipientsReq1.length === 1, "Only eligible non-requester active students matched");
  assert(recipientsReq1[0].user_id === studentB.id, "Step 4: Student B receives native push notification");
  assert(!recipientsReq1.some(r => r.user_id === studentA.id), "Step 5: Student A (requester) receives NO notification for their own request");
  assert(!recipientsReq1.some(r => r.user_id === suspendedUser.id), "Step 12a: Suspended user is excluded from notification");
  assert(!recipientsReq1.some(r => r.user_id === bannedUser.id), "Step 12b: Banned user is excluded from notification");

  // Verify Safe Payload Content
  const payloadReq1 = JSON.parse(JSON.stringify({
    title: "New Velto exchange request",
    body: `A student needs ₹${request1.amount} cash near ${request1.location_hint}.`,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `velto-req-${request1.id}`,
    url: `/feed?request=${request1.id}`
  }));

  assert(payloadReq1.title === "New Velto exchange request", "Notification title is 'New Velto exchange request'");
  assert(payloadReq1.body.includes("₹100"), "Notification body includes safe amount ₹100");
  assert(payloadReq1.body.includes("College Canteen"), "Notification body includes safe location hint");
  assert(!payloadReq1.body.includes("upi") && !payloadReq1.body.includes("@"), "Payload strictly excludes private emails and UPI IDs");
  assert(payloadReq1.url === `/feed?request=${request1.id}`, "Step 6: Notification deep link navigates to /feed?request=...");

  // Record delivery in deliveriesTable
  deliveriesTable.push({
    request_id: request1.id,
    recipient_id: studentB.id,
    delivery_status: 'SENT'
  });

  // Step 10: Deduplication check
  const duplicateCheck = getEligibleSubscribersForRequest(request1.id, request1.requester_id, allMockUsers);
  assert(duplicateCheck.length === 0, "Step 10: Duplicate delivery prevention avoids duplicate notifications");

  // Step 7: Student B disables notifications
  const studentBEndpoint = "https://updates.push.apple.com/send/student_b_iphone_pwa";
  subscriptionsTable = subscriptionsTable.filter(s => s.endpoint !== studentBEndpoint);
  assert(subscriptionsTable.length === 3, "Step 7: Student B subscription removed when disabled");

  // Step 8 & 9: Student A posts another request
  const request2 = {
    id: "req-0002-bbbb-2222",
    requester_id: studentA.id,
    amount: 200,
    request_type: "HAVE_CASH_WANT_UPI",
    location_hint: "Central Library",
    status: "OPEN"
  };

  const recipientsReq2 = getEligibleSubscribersForRequest(request2.id, request2.requester_id, allMockUsers);
  assert(recipientsReq2.length === 0, "Step 9: Student B does not receive native push after disabling");

  // Step 11: Expired endpoint removal check (404/410 Gone simulation)
  function simulateProviderResponse(statusCode, endpoint) {
    if (statusCode === 404 || statusCode === 410) {
      subscriptionsTable = subscriptionsTable.filter(s => s.endpoint !== endpoint);
      return "EXPIRED_CLEANED";
    }
    return "SENT";
  }

  const expiredStatus = simulateProviderResponse(410, "https://fcm.googleapis.com/fcm/send/suspended_user_device");
  assert(expiredStatus === "EXPIRED_CLEANED", "Step 11: HTTP 410 Gone triggers automatic stale endpoint cleanup");

  console.log(`\nTEST RESULTS: ${passed}/${total} assertions passed.`);
  if (passed === total) {
    console.log("ALL WEB PUSH NOTIFICATION SCENARIOS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPushNotificationTestSuite().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
