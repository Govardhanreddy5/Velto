"use server";

import { createClient } from "@/lib/supabase/server";
import { ReportReason, SafetyReport } from "@/types/database";
import { revalidatePath } from "next/cache";

export interface SubmitReportResult {
  success: boolean;
  report_id?: string;
  message?: string;
  error?: string;
}

/**
 * Server action to submit a trade dispute or safety report.
 * Reporter identity is strictly derived from auth.uid() on the server and in the database RPC.
 */
export async function submitTradeReportAction(
  tradeId: string,
  reason: ReportReason,
  details?: string
): Promise<SubmitReportResult> {
  const supabase = await createClient();

  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to submit a report." };
  }

  if (!tradeId) {
    return { success: false, error: "Invalid trade room ID." };
  }

  const allowedReasons: ReportReason[] = [
    "NO_SHOW",
    "WRONG_AMOUNT",
    "DID_NOT_RECEIVE_CASH",
    "DID_NOT_RECEIVE_UPI",
    "FRAUD_SUSPICION",
    "OTHER",
  ];

  if (!allowedReasons.includes(reason)) {
    return { success: false, error: "Please select a valid report reason." };
  }

  if (details && details.trim().length > 1000) {
    return { success: false, error: "Report details cannot exceed 1,000 characters." };
  }

  const { data, error } = await supabase.rpc("submit_trade_report", {
    p_trade_id: tradeId,
    p_reason: reason,
    p_details: details?.trim() || null,
  });

  if (error) {
    console.error("Error submitting trade report:", error);
    return {
      success: false,
      error: error.message || "Failed to submit report.",
    };
  }

  const result = data as SubmitReportResult;

  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "Failed to submit report.",
    };
  }

  revalidatePath(`/trades/${tradeId}`);
  return result;
}

/**
 * Retrieves reports filed by the signed-in user for a specific trade room.
 */
export async function getUserReportsForTrade(
  tradeId: string
): Promise<SafetyReport[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("safety_reports")
    .select("*")
    .eq("trade_id", tradeId)
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as SafetyReport[];
}
