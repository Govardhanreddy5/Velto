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

/**
 * Configure web-push with VAPID details from environment.
 * Returns true if properly configured, false otherwise.
 */
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@velto.local";

  if (!publicKey || !privateKey) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (err) {
    console.warn("[Velto Push] Failed to initialize VAPID credentials:", err);
    return false;
  }
}

/**
 * Server-only helper to dispatch Web Push notifications for an OPEN exchange request.
 * - Filters recipients to eligible, active, non-requester verified community users.
 * - Deduplicates delivery via DB constraint.
 * - Cleans up expired/invalid endpoints (404 / 410).
 * - Safe & non-blocking: never fails the calling request creation action.
 */
export async function dispatchPushNotificationForRequest({
  requestId,
  requestType,
  amount,
  locationHint,
}: DispatchRequestNotificationParams): Promise<{ sent: number; failed: number }> {
  const isVapidReady = configureVapid();
  if (!isVapidReady) {
    return { sent: 0, failed: 0 };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { sent: 0, failed: 0 };
  }

  // 1. Fetch eligible subscribers using the security-definer RPC
  const { data: subscribers, error: rpcError } = await supabase.rpc(
    "get_eligible_push_subscribers_for_request",
    { p_request_id: requestId }
  );

  if (rpcError || !subscribers || subscribers.length === 0) {
    return { sent: 0, failed: 0 };
  }

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

  let sentCount = 0;
  let failedCount = 0;

  // 3. Batch dispatch to eligible subscribers
  const pushPromises = (subscribers as PushSubscriberRecord[]).map(
    async (sub) => {
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

        sentCount++;
      } catch (err: unknown) {
        failedCount++;
        const statusCode = (err as { statusCode?: number })?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          // Subscription has expired or unsubscribed: remove stale endpoint
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
            // Ignore DB error during stale cleanup
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
            // Ignore DB error
          }
        }
      }
    }
  );

  // Await all parallel dispatches safely
  await Promise.allSettled(pushPromises);

  return { sent: sentCount, failed: failedCount };
}
