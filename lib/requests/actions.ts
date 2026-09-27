"use server";

import { createClient } from "@/lib/supabase/server";
import { validateCreateRequestData } from "@/lib/requests/validation";
import { ExchangeRequest } from "@/types/database";
import { revalidatePath } from "next/cache";

export interface CreateRequestResponse {
  success: boolean;
  message: string;
  requestId?: string;
  errors?: Record<string, string>;
}

/**
 * Server Action: Creates a new cash <-> UPI exchange request.
 * Fully validated on the server to prevent client-side parameter tampering.
 */
export async function createRequestAction(
  formData: FormData
): Promise<CreateRequestResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Supabase connection error." };
  }

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "You must be signed in to create a request." };
  }

  // 2. Verify profile is onboarded and not suspended/banned
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, is_onboarded, is_suspended, is_banned, campus")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, message: "Student profile not found." };
  }

  if (!profile.is_onboarded) {
    return {
      success: false,
      message: "Please complete your student profile onboarding before posting requests.",
    };
  }

  if (profile.is_banned || profile.is_suspended) {
    return {
      success: false,
      message: "Your account is currently restricted from creating exchange requests.",
    };
  }

  // 3. Extract and validate fields
  const requestType = (formData.get("requestType") as string)?.trim() ?? "";
  const amount = (formData.get("amount") as string)?.trim() ?? "";
  const location = (formData.get("location") as string)?.trim() ?? "";
  const expiryMinutes = (formData.get("expiryMinutes") as string)?.trim() ?? "30";
  const note = (formData.get("note") as string)?.trim() ?? "";

  const validation = validateCreateRequestData({
    requestType,
    amount,
    location,
    expiryMinutes,
    note,
  });

  if (!validation.isValid) {
    return {
      success: false,
      message: "Please fix the errors in your request.",
      errors: validation.errors,
    };
  }

  // 4. Calculate server-authoritative expiry timestamp
  const minutes = parseInt(expiryMinutes, 10);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const numericAmount = Math.round(parseFloat(amount) * 100) / 100;

  // 5. Insert into exchange_requests
  const { data: newRequest, error: insertError } = await supabase
    .from("exchange_requests")
    .insert({
      requester_id: user.id,
      request_type: requestType,
      amount: numericAmount,
      location_hint: location,
      note: note || null,
      status: "OPEN",
      campus: profile.campus || "Vishnu Educational Society",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError) {
    return {
      success: false,
      message: `Failed to create request: ${insertError.message}`,
    };
  }

  revalidatePath("/feed");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: "Request posted to campus feed!",
    requestId: newRequest.id,
  };
}

/**
 * Server Action: Cancels an open exchange request posted by the user.
 */
export async function cancelRequestAction(requestId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Connection error." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Unauthorized." };
  }

  const { error } = await supabase
    .from("exchange_requests")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requester_id", user.id)
    .eq("status", "OPEN");

  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath("/feed");
  return { success: true, message: "Request cancelled successfully." };
}

/**
 * Fetches active public campus feed requests (excluding current user's own requests).
 * Excludes UPI ID entirely to preserve student privacy.
 */
export async function getFeedRequests(): Promise<{
  requests: ExchangeRequest[];
  currentUserId: string | null;
  campus: string;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { requests: [], currentUserId: null, campus: "" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { requests: [], currentUserId: null, campus: "" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("campus")
    .eq("id", user.id)
    .single();

  const campus = profile?.campus || "Vishnu Educational Society";
  const now = new Date().toISOString();

  // Query open, unexpired requests from the same campus, excluding current user
  const { data, error } = await supabase
    .from("exchange_requests")
    .select(`
      id,
      requester_id,
      request_type,
      amount,
      location_hint,
      note,
      status,
      campus,
      expires_at,
      created_at,
      updated_at,
      requester:profiles!exchange_requests_requester_id_fkey(
        id,
        full_name,
        avatar_url,
        department,
        year_of_study,
        roll_number,
        rating_avg,
        total_ratings,
        total_trades
      )
    `)
    .eq("status", "OPEN")
    .gt("expires_at", now)
    .eq("campus", campus)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching feed:", error);
    return { requests: [], currentUserId: user.id, campus };
  }

  // Sanitize requester object if array
  const formatted: ExchangeRequest[] = (data || []).map((item) => {
    const row = item as unknown as ExchangeRequest & { requester?: unknown };
    return {
      ...row,
      requester: Array.isArray(row.requester)
        ? (row.requester[0] as ExchangeRequest["requester"])
        : (row.requester as ExchangeRequest["requester"]),
    };
  });

  return {
    requests: formatted,
    currentUserId: user.id,
    campus,
  };
}

/**
 * Fetches requests created by the authenticated student.
 */
export async function getMyRequests(): Promise<ExchangeRequest[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("exchange_requests")
    .select("*")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching my requests:", error);
    return [];
  }

  return (data || []) as ExchangeRequest[];
}
