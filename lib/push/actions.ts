"use server";

import { createClient } from "@/lib/supabase/server";

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

export interface SubscriptionActionResult {
  success: boolean;
  message: string;
  isSubscribed?: boolean;
}

/**
 * Server action to register/upsert a user's browser push subscription.
 */
export async function savePushSubscriptionAction(
  data: PushSubscriptionData
): Promise<SubscriptionActionResult> {
  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "You must be signed in to enable notifications.",
    };
  }

  try {
    const { error } = await supabase.rpc("upsert_push_subscription", {
      p_endpoint: data.endpoint,
      p_p256dh: data.keys.p256dh,
      p_auth: data.keys.auth,
      p_user_agent: data.userAgent || null,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: "Push notifications successfully enabled!",
      isSubscribed: true,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message:
        (err as Error).message || "Failed to save push subscription.",
    };
  }
}

/**
 * Server action to remove a user's browser push subscription.
 */
export async function removePushSubscriptionAction(
  endpoint: string
): Promise<SubscriptionActionResult> {
  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Unauthenticated." };
  }

  try {
    const { error } = await supabase.rpc("delete_push_subscription", {
      p_endpoint: endpoint,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: "Push notifications disabled.",
      isSubscribed: false,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message:
        (err as Error).message || "Failed to remove push subscription.",
    };
  }
}

/**
 * Server action to check if the current user has any active push subscriptions.
 */
export async function getPushSubscriptionStatusAction(): Promise<{
  isSubscribed: boolean;
  endpoint?: string;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { isSubscribed: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isSubscribed: false };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { isSubscribed: false };
  }

  return { isSubscribed: true, endpoint: data.endpoint };
}

/**
 * Server action to get the public VAPID key.
 */
export async function getVapidPublicKeyAction(): Promise<string> {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}
