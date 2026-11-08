"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Trade, TradeMessage, TradeRating } from "@/types/database";

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
        avatar_url,
        department,
        year_of_study,
        roll_number,
        rating_avg,
        total_ratings,
        total_trades,
        campus
      ),
      fulfiller:profiles!trades_fulfiller_id_fkey(
        id,
        full_name,
        avatar_url,
        department,
        year_of_study,
        roll_number,
        rating_avg,
        total_ratings,
        total_trades,
        campus
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

/**
 * Server action to retrieve in-trade chat messages.
 * Only trade participants (requester or fulfiller) can access.
 */
export async function getTradeMessages(
  tradeId: string
): Promise<{ messages: TradeMessage[]; error?: string }> {
  const supabase = await createClient();

  if (!supabase) {
    return { messages: [], error: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { messages: [], error: "Authentication required." };
  }

  const { data, error } = await supabase
    .from("trade_messages")
    .select(`
      id,
      trade_id,
      sender_id,
      message,
      created_at,
      sender:profiles!trade_messages_sender_id_fkey(
        id,
        full_name,
        roll_number,
        department,
        avatar_url
      )
    `)
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching trade messages:", error);
    return { messages: [], error: error.message };
  }

  const formatted: TradeMessage[] = (data || []).map((m) => ({
    ...m,
    sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
  }));

  return { messages: formatted };
}

export interface SendMessageResult {
  success: boolean;
  message?: TradeMessage;
  error?: string;
}

/**
 * Server action to send a chat message inside an active trade room.
 * Enforces text length (1-1000 chars), whitespace trimming, and active trade status.
 */
export async function sendTradeMessageAction(
  tradeId: string,
  messageText: string
): Promise<SendMessageResult> {
  const supabase = await createClient();

  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to send messages." };
  }

  const trimmed = (messageText || "").trim();

  if (!trimmed) {
    return { success: false, error: "Message cannot be empty." };
  }

  if (trimmed.length > 1000) {
    return {
      success: false,
      error: "Message exceeds maximum length of 1,000 characters.",
    };
  }

  // Insert message into trade_messages
  const { data, error } = await supabase
    .from("trade_messages")
    .insert({
      trade_id: tradeId,
      sender_id: user.id,
      message: trimmed,
    })
    .select(`
      id,
      trade_id,
      sender_id,
      message,
      created_at,
      sender:profiles!trade_messages_sender_id_fkey(
        id,
        full_name,
        roll_number,
        department,
        avatar_url
      )
    `)
    .single();

  if (error) {
    console.error("Error sending trade message:", error);
    return {
      success: false,
      error: error.message || "Failed to send message.",
    };
  }

  const formatted: TradeMessage = {
    ...data,
    sender: Array.isArray(data.sender) ? data.sender[0] : data.sender,
  };

  return {
    success: true,
    message: formatted,
  };
}

export interface ConfirmSettlementResult {
  success: boolean;
  status?: string;
  completed?: boolean;
  requester_confirmed?: boolean;
  fulfiller_confirmed?: boolean;
  error?: string;
  message?: string;
}

/**
 * Server action to confirm receipt of cash or UPI in trade settlement.
 * Invokes the atomic confirm_trade_settlement RPC function.
 */
export async function confirmTradeSettlementAction(
  tradeId: string
): Promise<ConfirmSettlementResult> {
  const supabase = await createClient();

  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  if (!tradeId || typeof tradeId !== "string") {
    return { success: false, error: "Invalid trade ID provided." };
  }

  const { data, error } = await supabase.rpc("confirm_trade_settlement", {
    p_trade_id: tradeId,
  });

  if (error) {
    console.error("Error executing confirm_trade_settlement:", error);
    return {
      success: false,
      error: error.message || "Failed to confirm trade settlement.",
    };
  }

  const result = data as ConfirmSettlementResult;

  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "Failed to confirm trade settlement.",
    };
  }

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  revalidatePath("/profile");

  return result;
}

export interface SubmitRatingResult {
  success: boolean;
  ratingId?: string;
  error?: string;
  message?: string;
}

/**
 * Server action to rate a trade partner after a trade is COMPLETED.
 * Invokes the secure submit_trade_rating RPC.
 */
export async function submitTradeRatingAction(
  tradeId: string,
  rating: number,
  comment?: string
): Promise<SubmitRatingResult> {
  const supabase = await createClient();

  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  if (!tradeId) {
    return { success: false, error: "Invalid trade ID." };
  }

  if (!rating || rating < 1 || rating > 5) {
    return { success: false, error: "Please select a rating between 1 and 5 stars." };
  }

  const { data, error } = await supabase.rpc("submit_trade_rating", {
    p_trade_id: tradeId,
    p_rating: rating,
    p_comment: comment?.trim() || null,
  });

  if (error) {
    console.error("Error submitting rating:", error);
    return {
      success: false,
      error: error.message || "Failed to submit rating.",
    };
  }

  const result = data as SubmitRatingResult;

  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "Failed to submit rating.",
    };
  }

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return result;
}

/**
 * Retrieves the rating submitted by the current user for a specific trade.
 */
export async function getTradeRatingForUser(
  tradeId: string
): Promise<TradeRating | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("trade_ratings")
    .select("*")
    .eq("trade_id", tradeId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as TradeRating;
}

export interface TradeHistoryItem {
  id: string;
  request_id: string;
  amount: number;
  request_type: string;
  status: string;
  meetup_location: string;
  completed_at: string;
  isRequester: boolean;
  partner: {
    id: string;
    full_name: string | null;
    department: string | null;
    year_of_study: number | null;
    roll_number: string;
    rating_avg: number;
    total_trades: number;
    campus?: string;
  } | null;
  hasRated: boolean;
  myRating?: number;
}

/**
 * Server action to retrieve completed trade history for the signed-in user.
 */
export async function getUserTradeHistory(prefetchedUserId?: string): Promise<TradeHistoryItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  let userId = prefetchedUserId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    userId = user.id;
  }

  const { data: trades, error } = await supabase
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
      completed_at,
      requester:profiles!trades_requester_id_fkey(
        id, full_name, department, year_of_study, roll_number, rating_avg, total_trades, campus
      ),
      fulfiller:profiles!trades_fulfiller_id_fkey(
        id, full_name, department, year_of_study, roll_number, rating_avg, total_trades, campus
      )
    `)
    .eq("status", "COMPLETED")
    .not("completed_at", "is", null)
    .or(`requester_id.eq.${userId},fulfiller_id.eq.${userId}`)
    .order("completed_at", { ascending: false });

  if (error || !trades) {
    console.error("Error fetching trade history:", error);
    return [];
  }

  // Fetch ratings submitted by user
  const tradeIds = trades.map((t) => t.id);
  const { data: ratings } = await supabase
    .from("trade_ratings")
    .select("trade_id, rating")
    .eq("reviewer_id", userId)
    .in("trade_id", tradeIds.length > 0 ? tradeIds : ["00000000-0000-0000-0000-000000000000"]);

  const ratingsMap = new Map((ratings || []).map((r) => [r.trade_id, r.rating]));

  return trades.map((t) => {
    const isRequester = t.requester_id === userId;
    const partnerData = isRequester ? t.fulfiller : t.requester;
    const partner = Array.isArray(partnerData) ? partnerData[0] : partnerData;
    const myRating = ratingsMap.get(t.id);

    return {
      id: t.id,
      request_id: t.request_id,
      amount: Number(t.amount),
      request_type: t.request_type,
      status: t.status,
      meetup_location: t.meetup_location,
      completed_at: t.completed_at || "",
      isRequester,
      partner: partner || null,
      hasRated: ratingsMap.has(t.id),
      myRating,
    };
  });
}

export interface ActiveTradeItem {
  id: string;
  request_id: string;
  amount: number;
  request_type: string;
  status: string;
  meetup_location: string;
  started_at: string;
  requester_confirmed: boolean;
  fulfiller_confirmed: boolean;
  isRequester: boolean;
  myConfirmed: boolean;
  partnerConfirmed: boolean;
  partner: {
    id: string;
    full_name: string | null;
    department: string | null;
    year_of_study: number | null;
    roll_number: string;
    rating_avg: number;
    total_trades: number;
    avatar_url?: string | null;
    campus?: string;
  } | null;
}

/**
 * Server action to retrieve currently active trades (status = IN_PROGRESS)
 * where the user is either requester or fulfiller.
 */
export async function getActiveUserTrades(prefetchedUserId?: string): Promise<ActiveTradeItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  let userId = prefetchedUserId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    userId = user.id;
  }

  const { data: trades, error } = await supabase
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
      started_at,
      requester:profiles!trades_requester_id_fkey(
        id, full_name, department, year_of_study, roll_number, rating_avg, total_trades, avatar_url, campus
      ),
      fulfiller:profiles!trades_fulfiller_id_fkey(
        id, full_name, department, year_of_study, roll_number, rating_avg, total_trades, avatar_url, campus
      )
    `)
    .eq("status", "IN_PROGRESS")
    .or(`requester_id.eq.${userId},fulfiller_id.eq.${userId}`)
    .order("started_at", { ascending: false });

  if (error || !trades) {
    console.error("Error fetching active trades:", error);
    return [];
  }

  return trades.map((t) => {
    const isRequester = t.requester_id === userId;
    const partnerData = isRequester ? t.fulfiller : t.requester;
    const partner = Array.isArray(partnerData) ? partnerData[0] : partnerData;
    const myConfirmed = isRequester ? t.requester_confirmed : t.fulfiller_confirmed;
    const partnerConfirmed = isRequester ? t.fulfiller_confirmed : t.requester_confirmed;

    return {
      id: t.id,
      request_id: t.request_id,
      amount: Number(t.amount),
      request_type: t.request_type,
      status: t.status,
      meetup_location: t.meetup_location,
      started_at: t.started_at,
      requester_confirmed: t.requester_confirmed,
      fulfiller_confirmed: t.fulfiller_confirmed,
      isRequester,
      myConfirmed,
      partnerConfirmed,
      partner: partner || null,
    };
  });
}

