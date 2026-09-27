"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ModerationAction,
  ModerationAuditLog,
  ModerationStatus,
  Profile,
  SafetyReport,
  Trade,
  TradeMessage,
} from "@/types/database";
import { revalidatePath } from "next/cache";

export interface AdminAuthCheck {
  isAdmin: boolean;
  user: { id: string; email: string } | null;
  profile: Profile | null;
}

/**
 * Server-side verification of admin authorization.
 * Strictly verifies identity against auth.uid() and profiles.is_admin.
 */
export async function verifyAdminAccess(): Promise<AdminAuthCheck> {
  const supabase = await createClient();
  if (!supabase) {
    return { isAdmin: false, user: null, profile: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { isAdmin: false, user: null, profile: null };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.is_admin) {
    return {
      isAdmin: false,
      user: { id: user.id, email: user.email },
      profile: (profile as Profile) || null,
    };
  }

  return {
    isAdmin: true,
    user: { id: user.id, email: user.email },
    profile: profile as Profile,
  };
}

/**
 * Retrieves all safety reports with participants' public profile information.
 * Blocked for non-admins at database RLS level.
 */
export async function getAdminReports(statusFilter?: string): Promise<SafetyReport[]> {
  const adminCheck = await verifyAdminAccess();
  if (!adminCheck.isAdmin) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  let query = supabase
    .from("safety_reports")
    .select(`
      id,
      reporter_id,
      reported_user_id,
      trade_id,
      reason,
      details,
      status,
      admin_notes,
      created_at,
      updated_at,
      reporter:profiles!safety_reports_reporter_id_fkey(
        id, full_name, email, roll_number, department, year_of_study, rating_avg, total_trades, is_suspended, is_banned
      ),
      reported_user:profiles!safety_reports_reported_user_id_fkey(
        id, full_name, email, roll_number, department, year_of_study, rating_avg, total_trades, is_suspended, is_banned
      ),
      trade:trades!safety_reports_trade_id_fkey(
        id, amount, request_type, status, meetup_location, requester_confirmed, fulfiller_confirmed, completed_at
      )
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "ALL") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching admin reports:", error);
    return [];
  }

  return (data || []) as unknown as SafetyReport[];
}

export interface AdminReportDetailResult {
  report: SafetyReport | null;
  trade: Trade | null;
  reporterProfile: Partial<Profile> | null;
  reportedProfile: Partial<Profile> | null;
  tradeMessages: TradeMessage[];
}

/**
 * Retrieves full details for a reported trade room:
 * - Trade details
 * - Both participants' public profiles & trust metrics
 * - In-trade chat messages for that specific trade only (never unrelated chat)
 */
export async function getAdminReportDetail(
  reportId: string
): Promise<AdminReportDetailResult> {
  const adminCheck = await verifyAdminAccess();
  if (!adminCheck.isAdmin) {
    return {
      report: null,
      trade: null,
      reporterProfile: null,
      reportedProfile: null,
      tradeMessages: [],
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      report: null,
      trade: null,
      reporterProfile: null,
      reportedProfile: null,
      tradeMessages: [],
    };
  }

  const { data: report, error: reportErr } = await supabase
    .from("safety_reports")
    .select(`
      id,
      reporter_id,
      reported_user_id,
      trade_id,
      reason,
      details,
      status,
      admin_notes,
      created_at,
      updated_at
    `)
    .eq("id", reportId)
    .single();

  if (reportErr || !report) {
    return {
      report: null,
      trade: null,
      reporterProfile: null,
      reportedProfile: null,
      tradeMessages: [],
    };
  }

  // Fetch reporter and reported profiles (safe fields only: name, dept, year, roll, rating, trades, suspension status)
  const [reporterRes, reportedRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, roll_number, department, year_of_study, rating_avg, total_ratings, total_trades, is_suspended, is_banned")
      .eq("id", report.reporter_id)
      .single(),
    supabase
      .from("profiles")
      .select("id, full_name, email, roll_number, department, year_of_study, rating_avg, total_ratings, total_trades, is_suspended, is_banned")
      .eq("id", report.reported_user_id)
      .single(),
  ]);

  let trade: Trade | null = null;
  let tradeMessages: TradeMessage[] = [];

  if (report.trade_id) {
    const { data: tradeData } = await supabase
      .from("trades")
      .select("*")
      .eq("id", report.trade_id)
      .single();

    trade = (tradeData as Trade) || null;

    // Fetch messages for this reported trade only
    const { data: messages } = await supabase
      .from("trade_messages")
      .select(`
        id,
        trade_id,
        sender_id,
        message,
        created_at,
        sender:profiles!trade_messages_sender_id_fkey(
          id, full_name, roll_number
        )
      `)
      .eq("trade_id", report.trade_id)
      .order("created_at", { ascending: true });

    tradeMessages = (messages || []) as unknown as TradeMessage[];
  }

  return {
    report: report as SafetyReport,
    trade,
    reporterProfile: reporterRes.data || null,
    reportedProfile: reportedRes.data || null,
    tradeMessages,
  };
}

/**
 * Updates report status and attaches admin notes.
 */
export async function updateReportStatusAction(
  reportId: string,
  status: ModerationStatus,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const adminCheck = await verifyAdminAccess();
  if (!adminCheck.isAdmin) {
    return { success: false, error: "Unauthorized: Admin privileges required." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const { data, error } = await supabase.rpc("admin_update_report_status", {
    p_report_id: reportId,
    p_status: status,
    p_admin_notes: adminNotes?.trim() || null,
  });

  if (error) {
    console.error("Error updating report status:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return data as { success: boolean; error?: string };
}

/**
 * Admin action to suspend, ban, or restore a campus student account.
 */
export async function moderateUserAction(
  targetUserId: string,
  action: ModerationAction,
  reason: string,
  reportId?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const adminCheck = await verifyAdminAccess();
  if (!adminCheck.isAdmin) {
    return { success: false, error: "Unauthorized: Admin privileges required." };
  }

  if (!reason || !reason.trim()) {
    return { success: false, error: "A clear justification reason is required." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { success: false, error: "Database connection failed." };
  }

  const { data, error } = await supabase.rpc("admin_moderate_user", {
    p_target_user_id: targetUserId,
    p_action: action,
    p_reason: reason.trim(),
    p_report_id: reportId || null,
  });

  if (error) {
    console.error("Error moderating user:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return data as { success: boolean; error?: string; message?: string };
}

/**
 * Retrieves the moderation audit trail.
 */
export async function getModerationAuditLogs(): Promise<ModerationAuditLog[]> {
  const adminCheck = await verifyAdminAccess();
  if (!adminCheck.isAdmin) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("moderation_audit_logs")
    .select(`
      id,
      admin_id,
      target_user_id,
      action,
      reason,
      report_id,
      created_at,
      admin:profiles!moderation_audit_logs_admin_id_fkey(
        id, full_name, email, roll_number
      ),
      target_user:profiles!moderation_audit_logs_target_user_id_fkey(
        id, full_name, email, roll_number
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching moderation audit logs:", error);
    return [];
  }

  return (data || []) as unknown as ModerationAuditLog[];
}
