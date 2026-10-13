import "server-only";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

interface PushSubscriberRecord {
  subscription_id: string;
  recipient_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

interface DispatchRequestNotificationParams {
  requestId: string;
  requestType: string;
  amount: number;
  locationHint: string;
  requesterId: string;
}

export interface PushDispatchSummary {
  eligibleRecipients: number;
  subscriptionsFound: number;
  sendsAttempted: number;
  successfulSends: number;
  failedSends: number;
  errorCodes: Record<string, number>;
}

/**
 * Configure web-push with VAPID details from environment.
 * Validates presence of keys without exposing them.
 */
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@velto.local";

  if (!publicKey || !privateKey) {
    console.warn(
      `[Velto Push Config] Missing VAPID credentials in environment: ` +
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${Boolean(publicKey)} | ` +
      `VAPID_PRIVATE_KEY=${Boolean(privateKey)}`
    );
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (err: unknown) {
    console.error("[Velto Push Config] VAPID initialization error:", (err as Error).message);
    return false;
  }
}

/**
 * Server-only helper to dispatch Web Push notifications for an OPEN exchange request.
 * - Filters recipients to eligible, active, non-requester verified community users.
 * - Deduplicates delivery via DB constraint.
 * - Cleans up expired/invalid endpoints (404 / 410).
 * - Logs safe metrics: counts, status codes (NEVER private keys, auth keys, or sensitive user data).
 */
export async function dispatchPushNotificationForRequest({
  requestId,
  requestType,
  amount,
  locationHint,
  requesterId,
}: DispatchRequestNotificationParams): Promise<PushDispatchSummary> {
  const summary: PushDispatchSummary = {
    eligibleRecipients: 0,
    subscriptionsFound: 0,
    sendsAttempted: 0,
    successfulSends: 0,
    failedSends: 0,
    errorCodes: {},
  };

  const isVapidReady = configureVapid();
  if (!isVapidReady) {
    console.warn("[Velto Push Dispatch] Aborted: VAPID is not configured.");
    return summary;
  }

  const supabase = await createClient();
  if (!supabase) {
    console.warn("[Velto Push Dispatch] Aborted: Supabase client unavailable.");
    return summary;
  }

  // 1. Fetch eligible subscribers using the security-definer RPC
  const { data: subscribers, error: rpcError } = await supabase.rpc(
    "get_eligible_push_subscribers_for_request",
    { p_request_id: requestId }
  );

  if (rpcError) {
    console.error(
      `[Velto Push Dispatch] RPC get_eligible_push_subscribers_for_request error: ${rpcError.message}`
    );
    return summary;
  }

  if (!subscribers || subscribers.length === 0) {
    console.info(
      `[Velto Push Dispatch] No eligible opted-in subscribers found for request ${requestId.slice(0, 8)}.`
    );
    return summary;
  }

  const subscriberList = subscribers as PushSubscriberRecord[];
  // Filter out any accidental self-notification in application layer as defense in depth
  const targetSubscribers = subscriberList.filter((s) => s.recipient_id !== requesterId);

  summary.eligibleRecipients = targetSubscribers.length;
  summary.subscriptionsFound = targetSubscribers.length;
  summary.sendsAttempted = targetSubscribers.length;

  // 2. Prepare safe payload (NO private notes, NO UPI IDs, NO emails, NO secret trade data)
  const isNeedCash = requestType === "NEED_CASH";
  const safeBody = isNeedCash
    ? `A student needs ₹${Math.round(amount)} cash near ${locationHint}.`
    : `A student has ₹${Math.round(amount)} cash (wants UPI) near ${locationHint}.`;

  const payload = JSON.stringify({
    title: "New Velto exchange request",
    body: safeBody,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `velto-req-${requestId}`,
    url: `/feed?request=${requestId}`,
  });

  // 3. Dispatch in parallel with safe error handling
  const pushPromises = targetSubscribers.map(async (sub) => {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh_key,
        auth: sub.auth_key,
      },
    };

    try {
      await webpush.sendNotification(pushConfig, payload, {
        TTL: 60 * 30, // 30 minutes time-to-live
        urgency: "high",
      });

      // Record delivery success for deduplication
      await supabase.rpc("record_push_notification_delivery", {
        p_request_id: requestId,
        p_recipient_id: sub.recipient_id,
        p_subscription_id: sub.subscription_id,
        p_status: "SENT",
      });

      summary.successfulSends++;
    } catch (err: unknown) {
      summary.failedSends++;
      const statusCode = (err as { statusCode?: number })?.statusCode || 0;
      const codeKey = statusCode ? `HTTP_${statusCode}` : "NETWORK_ERROR";
      summary.errorCodes[codeKey] = (summary.errorCodes[codeKey] || 0) + 1;

      if (statusCode === 404 || statusCode === 410) {
        // Stale / expired subscription: clean up endpoint
        try {
          await supabase.rpc("delete_invalid_push_subscription", {
            p_endpoint: sub.endpoint,
          });
          await supabase.rpc("record_push_notification_delivery", {
            p_request_id: requestId,
            p_recipient_id: sub.recipient_id,
            p_subscription_id: sub.subscription_id,
            p_status: "EXPIRED",
          });
        } catch {
          // Ignore secondary cleanup error
        }
      } else {
        try {
          await supabase.rpc("record_push_notification_delivery", {
            p_request_id: requestId,
            p_recipient_id: sub.recipient_id,
            p_subscription_id: sub.subscription_id,
            p_status: "FAILED",
          });
        } catch {
          // Ignore
        }
      }
    }
  });

  await Promise.allSettled(pushPromises);

  // Safe observability logging (NO private keys, NO auth keys, NO full endpoints)
  console.info(
    `[Velto Push Dispatch Result] Request: ${requestId.slice(0, 8)} | ` +
    `Eligible Recipients: ${summary.eligibleRecipients} | ` +
    `Attempted: ${summary.sendsAttempted} | ` +
    `Successful: ${summary.successfulSends} | ` +
    `Failed: ${summary.failedSends} | ` +
    `Status Codes: ${JSON.stringify(summary.errorCodes)}`
  );

  return summary;
}

/**
 * Server-only helper to send a self-test push notification to the current user's subscription.
 * Used exclusively for developer / user device diagnostic verification.
 */
export async function sendSelfTestPushToUser(
  userId: string
): Promise<{ success: boolean; message: string; statusCode?: number }> {
  const isVapidReady = configureVapid();
  if (!isVapidReady) {
    return {
      success: false,
      message: "VAPID keys are missing or invalid on the server.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Database connection failed." };
  }

  const { data: subs, error: subError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh_key, auth_key")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (subError || !subs || subs.length === 0) {
    return {
      success: false,
      message: "No push subscription found in database for your account. Please enable notifications first.",
    };
  }

  const sub = subs[0];
  const payload = JSON.stringify({
    title: "Velto Push Test",
    body: "Push notification system is working! You will receive exchange requests here.",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `velto-test-${Date.now()}`,
    url: "/feed",
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key,
        },
      },
      payload,
      { TTL: 60, urgency: "high" }
    );

    return {
      success: true,
      message: "Test push notification sent successfully! Check your device.",
      statusCode: 201,
    };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const errorMsg = (err as Error).message || "Unknown push delivery error";

    if (statusCode === 404 || statusCode === 410) {
      await supabase.rpc("delete_invalid_push_subscription", {
        p_endpoint: sub.endpoint,
      });
      return {
        success: false,
        message: "Your subscription endpoint expired with the push service and has been cleaned up. Please re-enable notifications.",
        statusCode,
      };
    }

    return {
      success: false,
      message: `Push service rejected notification (${statusCode || "Network Error"}): ${errorMsg}`,
      statusCode,
    };
  }
}
