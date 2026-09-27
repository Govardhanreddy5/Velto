"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Trade } from "@/types/database";

export interface AcceptRequestResult {
  success: boolean;
  tradeId?: string;
  error?: string;
}

export interface TradeDetailsResult {
  trade: Trade | null;
  currentUserId: string | null;
  error?: string;
}

/**
 * Server action to atomically accept an exchange request using PostgreSQL RPC.
 * Guaranteed atomic single-winner matching with row-level locking.
 */
export async function acceptExchangeRequestAction(
  requestId: string
): Promise<AcceptRequestResult> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      success: false,
      error: "Database connection failed. Please try again.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to accept request.",
    };
  }

  if (!requestId || typeof requestId !== "string") {
    return {
      success: false,
      error: "Invalid request ID provided.",
    };
  }

  // Call the atomic PostgreSQL RPC function
  const { data, error } = await supabase.rpc("accept_exchange_request", {
    p_request_id: requestId,
  });

  if (error) {
    console.error("RPC error accepting exchange request:", error);
    return {
      success: false,
      error: error.message || "Failed to accept exchange request.",
    };
  }

  const result = data as {
    success: boolean;
    trade_id?: string;
    error?: string;
    message?: string;
  };

  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "Failed to accept exchange request.",
    };
  }

  revalidatePath("/feed");
  revalidatePath("/dashboard");

  return {
    success: true,
    tradeId: result.trade_id,
  };
}

/**
 * Server action to retrieve trade room details.
 * Strictly enforces that only trade participants (requester or fulfiller) can access.
 */
export async function getTradeById(tradeId: string): Promise<TradeDetailsResult> {
  const supabase = await createClient();

  if (!supabase) {
    return { trade: null, currentUserId: null, error: "Database unavailable." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { trade: null, currentUserId: null, error: "Authentication required." };
  }

  // Fetch trade with requester and fulfiller profiles
  const { data, error } = await supabase
    .from("trades")
    .select(`
      id,
      request_id,
      requester_id,
      fulfiller_id,
      amount,
      request_type,
      status,
      meetup_location,
      requester_confirmed,
      fulfiller_confirmed,
      upi_reference,
      started_at,
      completed_at,
      cancelled_at,
      requester:profiles!trades_requester_id_fkey(
        id,
        full_name,
        department,
        year_of_study,
        roll_number,
        rating_avg,
        total_ratings,
        total_trades
      ),
      fulfiller:profiles!trades_fulfiller_id_fkey(
        id,
        full_name,
        department,
        year_of_study,
        roll_number,
        rating_avg,
        total_ratings,
        total_trades
      )
    `)
    .eq("id", tradeId)
    .single();

  if (error || !data) {
    return {
      trade: null,
      currentUserId: user.id,
      error: "Trade room not found or you are not authorized to view it.",
    };
  }

  // Verify access: current user MUST be either requester or fulfiller
  if (data.requester_id !== user.id && data.fulfiller_id !== user.id) {
    return {
      trade: null,
      currentUserId: user.id,
      error: "Access restricted: You are not a participant in this trade.",
    };
  }

  const formatted: Trade = {
    ...data,
    requester: Array.isArray(data.requester) ? data.requester[0] : data.requester,
    fulfiller: Array.isArray(data.fulfiller) ? data.fulfiller[0] : data.fulfiller,
  };

  return {
    trade: formatted,
    currentUserId: user.id,
  };
}
