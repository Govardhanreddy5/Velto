"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  ShieldCheck,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Loader2,
  Info,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  savePushSubscriptionAction,
  removePushSubscriptionAction,
  getPushSubscriptionStatusAction,
  getVapidPublicKeyAction,
  sendSelfTestPushAction,
} from "@/lib/push/actions";
import { urlBase64ToUint8Array } from "@/lib/push/utils";

// Web Push Support Store
function subscribeNoop() {
  return () => {};
}

function getWebPushSupportedSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function getWebPushSupportedServerSnapshot(): boolean {
  return false;
}

// iOS Detection Store
function getIosSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

// Standalone Mode Store
function subscribeStandalone(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getStandaloneSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone)
  );
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

export function NotificationSettings() {
  const isSupported = useSyncExternalStore(
    subscribeNoop,
    getWebPushSupportedSnapshot,
    getWebPushSupportedServerSnapshot
  );

  const isIos = useSyncExternalStore(
    subscribeNoop,
    getIosSnapshot,
    () => false
  );

  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== "undefined"
      ? Notification.permission
      : "default";
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    // Check initial active subscription from Service Worker and DB asynchronously
    if (isSupported) {
      navigator.serviceWorker.ready.then(async (registration) => {
        try {
          const sub = await registration.pushManager.getSubscription();
          const dbStatus = await getPushSubscriptionStatusAction();

          if (sub) {
            // Browser has subscription: verify DB sync
            if (!dbStatus.isSubscribed) {
              const subJson = sub.toJSON();
              if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
                // Auto-sync missing subscription into database
                await savePushSubscriptionAction({
                  endpoint: subJson.endpoint,
                  keys: {
                    p256dh: subJson.keys.p256dh,
                    auth: subJson.keys.auth,
                  },
                  userAgent: navigator.userAgent,
                });
              }
            }
            setIsSubscribed(true);
          } else {
            setIsSubscribed(false);
          }
        } catch {
          // Ignore service worker query errors
        }
      });
    }
  }, [isSupported]);

  const handleEnableNotifications = async () => {
    setStatusMessage(null);
    setLoading(true);

    try {
      if (!isSupported) {
        throw new Error(
          "Web Push notifications are not supported by this browser. Realtime in-app feed alerts remain active."
        );
      }

      // On iOS Safari, push only works if running as an installed PWA
      if (isIos && !isStandalone) {
        setStatusMessage({
          type: "info",
          text: "On iPhone/iPad, push notifications require Velto to be installed on your Home Screen (Share → Add to Home Screen).",
        });
        setLoading(false);
        return;
      }

      // Request browser permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "denied") {
        setStatusMessage({
          type: "error",
          text: "Notifications are blocked in your browser. Click the lock/settings icon in your browser address bar to allow notifications.",
        });
        setLoading(false);
        return;
      }

      if (result !== "granted") {
        setLoading(false);
        return;
      }

      // Wait for service worker ready
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key
      const vapidKey = await getVapidPublicKeyAction();
      if (!vapidKey) {
        throw new Error(
          "VAPID public key is not configured in the server environment (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Please add it in Vercel settings."
        );
      }

      // Unsubscribe any stale mismatched subscription before creating fresh one
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        try {
          await existingSub.unsubscribe();
        } catch {
          // Ignore
        }
      }

      // Subscribe to PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error("Failed to generate push credentials from browser.");
      }

      // Save to Supabase
      const saveRes = await savePushSubscriptionAction({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        userAgent: navigator.userAgent,
      });

      if (!saveRes.success) {
        throw new Error(saveRes.message);
      }

      setIsSubscribed(true);
      setStatusMessage({
        type: "success",
        text: "Push notifications enabled! You will now receive instant alerts when students post cash/UPI requests.",
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: (err as Error).message || "Failed to enable notifications.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setStatusMessage(null);
    setLoading(true);

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await removePushSubscriptionAction(endpoint);
        } else {
          const dbStatus = await getPushSubscriptionStatusAction();
          if (dbStatus.endpoint) {
            await removePushSubscriptionAction(dbStatus.endpoint);
          }
        }
      }

      setIsSubscribed(false);
      setStatusMessage({
        type: "info",
        text: "Push notifications disabled. Real-time campus feed updates will continue inside the app.",
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: (err as Error).message || "Failed to disable notifications.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    setTestingPush(true);
    setStatusMessage(null);
    try {
      const res = await sendSelfTestPushAction();
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: "Test push notification sent! If the app is in the background or minimized, a native notification will appear.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: `Test push failed: ${res.message}`,
        });
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: `Diagnostic error: ${(err as Error).message}`,
      });
    } finally {
      setTestingPush(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-zinc-200/90 p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            {isSubscribed ? (
              <BellRing className="w-5 h-5 text-blue-600 animate-pulse" />
            ) : (
              <Bell className="w-5 h-5 text-zinc-500" />
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-950 flex items-center gap-2">
              Request Push Notifications
              {isSubscribed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Active
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Get notified immediately on your device when an eligible student posts an open exchange request.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isSubscribed ? (
            <>
              <Button
                onClick={handleSendTestNotification}
                disabled={testingPush || loading}
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-1.5 border-zinc-300 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs px-3 py-2 rounded-xl"
              >
                {testingPush ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Test Push
              </Button>

              <Button
                onClick={handleDisableNotifications}
                disabled={loading || testingPush}
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-1.5 border-zinc-300 text-zinc-700 hover:bg-zinc-100 text-xs px-3.5 py-2 rounded-xl"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 text-zinc-500" />
                )}
                Disable
              </Button>
            </>
          ) : (
            <Button
              onClick={handleEnableNotifications}
              disabled={loading || permission === "denied"}
              size="sm"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-white" />
              )}
              Enable Request Notifications
            </Button>
          )}
        </div>
      </div>

      {/* Status Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Browser Permission Status */}
        <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
          <span className="text-zinc-600 font-medium">Browser Permission:</span>
          <span
            className={`font-semibold capitalize px-2 py-0.5 rounded-md text-[11px] ${
              permission === "granted"
                ? "bg-emerald-100/70 text-emerald-800"
                : permission === "denied"
                ? "bg-rose-100 text-rose-800"
                : "bg-zinc-200/70 text-zinc-700"
            }`}
          >
            {permission}
          </span>
        </div>

        {/* Subscription State */}
        <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
          <span className="text-zinc-600 font-medium">Subscription State:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
              isSubscribed
                ? "bg-emerald-100/70 text-emerald-800"
                : "bg-zinc-200/70 text-zinc-700"
            }`}
          >
            {isSubscribed ? "Subscribed (Opted In)" : "Not Subscribed"}
          </span>
        </div>
      </div>

      {/* Status Feedback Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-medium flex items-start gap-2.5 ${
            statusMessage.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : statusMessage.type === "error"
              ? "bg-rose-50 text-rose-900 border border-rose-200"
              : "bg-blue-50 text-blue-900 border border-blue-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      {/* Permission Denied Explanation Banner */}
      {permission === "denied" && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            <span>Browser Notifications are Blocked</span>
          </div>
          <p className="leading-relaxed text-amber-800">
            You previously denied notification permissions for Velto. To re-enable them:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-amber-800 font-medium pl-1">
            <li>Click the lock or site settings icon in your browser URL bar.</li>
            <li>Toggle <strong>Notifications</strong> to <strong>Allow</strong>.</li>
            <li>Reload the page and click Enable above.</li>
          </ol>
        </div>
      )}

      {/* iOS Instructions Banner */}
      {isIos && !isStandalone && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
          <div className="flex items-center gap-2 font-bold">
            <Smartphone className="w-4 h-4 text-blue-700" />
            <span>iOS Requirement</span>
          </div>
          <p className="leading-relaxed text-blue-800">
            On iPhone and iPad (iOS 16.4+), Apple requires Web Push apps to be added to your Home Screen. Tap Safari&apos;s <strong>Share</strong> button &rarr; <strong>Add to Home Screen</strong>, open Velto from your home screen, and enable notifications here.
          </p>
        </div>
      )}

      {/* Safety & Fallback Transparency Card */}
      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2.5 text-xs text-zinc-600">
        <div className="flex items-center gap-2 font-semibold text-zinc-900">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Privacy & Fallback Guarantees</span>
        </div>
        <p className="leading-relaxed">
          Velto push notifications contain only safe request summaries (e.g. &ldquo;A student needs ₹100 cash near College Canteen&rdquo;). Your private UPI ID, email, and trade chats are <strong>never</strong> transmitted in push payloads.
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 pt-1 border-t border-zinc-200/60">
          <Info className="w-3.5 h-3.5 text-zinc-400" />
          <span>Realtime Campus Feed updates remain active inside the app regardless of push settings.</span>
        </div>
      </div>
    </section>
  );
}
