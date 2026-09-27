"use client";

import { useState, useTransition } from "react";
import {
  getAdminReportDetail,
  updateReportStatusAction,
  moderateUserAction,
  AdminReportDetailResult,
} from "@/lib/admin/actions";
import {
  ModerationAction,
  ModerationAuditLog,
  ModerationStatus,
  SafetyReport,
} from "@/types/database";
import {
  AlertTriangle,
  CheckCircle2,
  Star,
  MessageSquare,
  ArrowRight,
  UserX,
  UserCheck,
  Ban,
  Loader2,
  X,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminDashboardProps {
  initialReports: SafetyReport[];
  initialAuditLogs: ModerationAuditLog[];
  adminEmail: string;
}

export function AdminDashboard({
  initialReports,
  initialAuditLogs,
  adminEmail,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"reports" | "audit">("reports");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [reports, setReports] = useState<SafetyReport[]>(initialReports);
  const auditLogs = initialAuditLogs;

  // Active Report Details for Inspection Drawer/Modal
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<AdminReportDetailResult | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Status update state
  const [adminNote, setAdminNote] = useState("");
  const [isUpdatingStatus, startStatusUpdate] = useTransition();

  // User Moderation Confirmation Modal state
  const [modTargetUser, setModTargetUser] = useState<{
    id: string;
    name: string;
    action: ModerationAction;
  } | null>(null);
  const [modReason, setModReason] = useState("");
  const [isModerating, startModerating] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Load report detail
  const handleInspectReport = async (reportId: string) => {
    setSelectedReportId(reportId);
    setLoadingDetail(true);
    setFeedback(null);
    setAdminNote("");
    try {
      const data = await getAdminReportDetail(reportId);
      setReportDetail(data);
      if (data.report?.admin_notes) {
        setAdminNote(data.report.admin_notes);
      }
    } catch (err) {
      console.error("Error loading report detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleUpdateStatus = (newStatus: ModerationStatus) => {
    if (!selectedReportId) return;
    setFeedback(null);

    startStatusUpdate(async () => {
      const res = await updateReportStatusAction(selectedReportId, newStatus, adminNote);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Report status updated to ${newStatus}.`,
        });
        // Update local list
        setReports((prev) =>
          prev.map((r) =>
            r.id === selectedReportId
              ? { ...r, status: newStatus, admin_notes: adminNote }
              : r
          )
        );
        if (reportDetail?.report) {
          setReportDetail({
            ...reportDetail,
            report: { ...reportDetail.report, status: newStatus, admin_notes: adminNote },
          });
        }
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to update report status.",
        });
      }
    });
  };

  const handleExecuteModeration = () => {
    if (!modTargetUser || !modReason.trim()) return;

    startModerating(async () => {
      const res = await moderateUserAction(
        modTargetUser.id,
        modTargetUser.action,
        modReason,
        selectedReportId || undefined
      );

      if (res.success) {
        setFeedback({
          type: "success",
          message: res.message || `User account successfully updated.`,
        });

        // Update profile in local detail view if open
        if (reportDetail) {
          const isSuspended =
            modTargetUser.action === "SUSPEND_USER"
              ? true
              : modTargetUser.action === "RESTORE_USER"
              ? false
              : reportDetail.reportedProfile?.is_suspended;
          const isBanned =
            modTargetUser.action === "BAN_USER"
              ? true
              : modTargetUser.action === "RESTORE_USER"
              ? false
              : reportDetail.reportedProfile?.is_banned;

          if (reportDetail.reportedProfile?.id === modTargetUser.id) {
            setReportDetail({
              ...reportDetail,
              reportedProfile: {
                ...reportDetail.reportedProfile,
                is_suspended: isSuspended,
                is_banned: isBanned,
              },
            });
          }
        }

        setModTargetUser(null);
        setModReason("");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to execute moderation.",
        });
      }
    });
  };

  const filteredReports = reports.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="p-6 bg-gradient-to-r from-zinc-900 to-zinc-950 text-white rounded-3xl border border-zinc-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              Verified Campus Administrator
            </span>
            <span className="text-xs text-zinc-400">{adminEmail}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Campus Safety & Moderation Hub
          </h1>
          <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
            Review reported peer exchanges, inspect verified student profiles and chat transcripts,
            and enforce disciplinary suspensions or bans.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-3 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Pending
            </div>
            <div className="text-xl font-black font-mono text-amber-400">
              {reports.filter((r) => r.status === "PENDING").length}
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Investigating
            </div>
            <div className="text-xl font-black font-mono text-blue-400">
              {reports.filter((r) => r.status === "INVESTIGATING").length}
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 text-center min-w-[90px]">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Total Reports
            </div>
            <div className="text-xl font-black font-mono text-white">
              {reports.length}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "reports"
              ? "bg-zinc-900 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Safety Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "audit"
              ? "bg-zinc-900 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Moderation Audit Log ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: REPORTS */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {["ALL", "PENDING", "INVESTIGATING", "RESOLVED", "DISMISSED"].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    statusFilter === status
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="text-xs text-zinc-500">
              Showing {filteredReports.length} of {reports.length} reports
            </div>
          </div>

          {/* Reports Table / Cards */}
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200 text-zinc-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 opacity-60" />
              <div className="text-sm font-semibold text-zinc-700">No reports found</div>
              <p className="text-xs text-zinc-500">
                There are no reports matching the selected status filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredReports.map((report) => {
                const isSelected = selectedReportId === report.id;
                const statusBadge =
                  report.status === "PENDING"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : report.status === "INVESTIGATING"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : report.status === "RESOLVED"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200";

                return (
                  <div
                    key={report.id}
                    onClick={() => handleInspectReport(report.id)}
                    className={`p-5 bg-white rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                      isSelected
                        ? "border-zinc-950 ring-2 ring-zinc-950/10 shadow-md"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${statusBadge}`}
                          >
                            {report.status}
                          </span>
                          <span className="text-xs font-bold text-zinc-900">
                            {report.reason.replace(/_/g, " ")}
                          </span>
                          <span className="text-zinc-400 text-xs">•</span>
                          <span className="text-xs text-zinc-500 font-mono">
                            {new Date(report.created_at).toLocaleDateString()} at{" "}
                            {new Date(report.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-600 pt-1 line-clamp-2">
                          {report.details || "No written statement provided."}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-semibold bg-zinc-50 hover:bg-zinc-100"
                        >
                          Inspect & Moderate
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Disciplinary & Moderation Audit Trail (Immutable)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Every admin suspension, ban, restoration, and report status change is logged here.
            </p>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200 text-zinc-400">
              No moderation events recorded yet.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-zinc-100 text-xs">
                {auditLogs.map((log) => {
                  const actionColor =
                    log.action === "BAN_USER"
                      ? "text-rose-700 bg-rose-50 border-rose-200"
                      : log.action === "SUSPEND_USER"
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : log.action === "RESTORE_USER"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-blue-700 bg-blue-50 border-blue-200";

                  return (
                    <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${actionColor}`}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                          <span className="font-semibold text-zinc-900">
                            Target: {log.target_user?.full_name || log.target_user?.roll_number || log.target_user_id.slice(0, 8)}
                          </span>
                          <span className="text-zinc-400">•</span>
                          <span className="text-zinc-500">
                            By Admin: {log.admin?.full_name || log.admin?.email || "Admin"}
                          </span>
                        </div>
                        <p className="text-zinc-600 italic">
                          &ldquo;{log.reason}&rdquo;
                        </p>
                      </div>

                      <div className="text-[11px] text-zinc-400 font-mono shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSPECTION DRAWER / MODAL */}
      {selectedReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Dispute Investigation
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    #{selectedReportId.slice(0, 8)}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-zinc-950">
                  {reportDetail?.report?.reason.replace(/_/g, " ")}
                </h2>
              </div>
              <button
                onClick={() => setSelectedReportId(null)}
                className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback && (
              <div
                className={`p-4 rounded-2xl text-xs flex items-start gap-2 border ${
                  feedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {loadingDetail ? (
              <div className="p-12 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-400" />
                <div className="text-xs text-zinc-500">Loading dispute intelligence...</div>
              </div>
            ) : reportDetail ? (
              <div className="space-y-6">
                {/* Reason & Statement */}
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Reporter&apos;s Statement
                  </h4>
                  <p className="text-xs text-zinc-800 leading-relaxed font-sans">
                    {reportDetail.report?.details || "No additional text provided."}
                  </p>
                </div>

                {/* Participants Public Profiles & Trust History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Reporter Profile */}
                  <div className="p-5 rounded-2xl border border-zinc-200 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-zinc-400">
                        Reporting Student
                      </span>
                      <span className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                        Accuser
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-bold text-zinc-950">
                        {reportDetail.reporterProfile?.full_name || "Student"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {reportDetail.reporterProfile?.roll_number} • {reportDetail.reporterProfile?.department} (Year {reportDetail.reporterProfile?.year_of_study || 1})
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          {Number(reportDetail.reporterProfile?.rating_avg || 5.0).toFixed(1)}
                        </span>
                        <span className="text-zinc-500">
                          {reportDetail.reporterProfile?.total_trades || 0} completed trades
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Reported User Profile */}
                  <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-rose-500">
                        Reported Partner
                      </span>
                      <div className="flex items-center gap-1">
                        {reportDetail.reportedProfile?.is_banned && (
                          <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                            Banned
                          </span>
                        )}
                        {reportDetail.reportedProfile?.is_suspended && !reportDetail.reportedProfile?.is_banned && (
                          <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                            Suspended
                          </span>
                        )}
                        {!reportDetail.reportedProfile?.is_banned && !reportDetail.reportedProfile?.is_suspended && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Active Account
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-bold text-zinc-950">
                        {reportDetail.reportedProfile?.full_name || "Student"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {reportDetail.reportedProfile?.roll_number} • {reportDetail.reportedProfile?.department} (Year {reportDetail.reportedProfile?.year_of_study || 1})
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          {Number(reportDetail.reportedProfile?.rating_avg || 5.0).toFixed(1)}
                        </span>
                        <span className="text-zinc-500">
                          {reportDetail.reportedProfile?.total_trades || 0} completed trades
                        </span>
                      </div>
                    </div>

                    {/* Disciplinary Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-rose-100">
                      {!reportDetail.reportedProfile?.is_suspended && !reportDetail.reportedProfile?.is_banned && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModTargetUser({
                              id: reportDetail.reportedProfile!.id!,
                              name: reportDetail.reportedProfile!.full_name || "Student",
                              action: "SUSPEND_USER",
                            })
                          }
                          className="h-7 text-[11px] font-semibold text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          <UserX className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          Suspend Account
                        </Button>
                      )}

                      {!reportDetail.reportedProfile?.is_banned && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModTargetUser({
                              id: reportDetail.reportedProfile!.id!,
                              name: reportDetail.reportedProfile!.full_name || "Student",
                              action: "BAN_USER",
                            })
                          }
                          className="h-7 text-[11px] font-semibold text-rose-700 border-rose-300 hover:bg-rose-50"
                        >
                          <Ban className="w-3.5 h-3.5 mr-1 text-rose-600" />
                          Ban Permanently
                        </Button>
                      )}

                      {(reportDetail.reportedProfile?.is_suspended || reportDetail.reportedProfile?.is_banned) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModTargetUser({
                              id: reportDetail.reportedProfile!.id!,
                              name: reportDetail.reportedProfile!.full_name || "Student",
                              action: "RESTORE_USER",
                            })
                          }
                          className="h-7 text-[11px] font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        >
                          <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Restore Access
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reported Trade Details */}
                {reportDetail.trade && (
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-zinc-500">
                        Reported Trade Metadata
                      </span>
                      <span className="font-mono text-zinc-400">
                        Trade #{reportDetail.trade.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                        <div className="text-[10px] text-zinc-400 uppercase font-bold">Amount</div>
                        <div className="text-sm font-black font-mono text-zinc-950">
                          ₹{reportDetail.trade.amount}
                        </div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                        <div className="text-[10px] text-zinc-400 uppercase font-bold">Trade Type</div>
                        <div className="text-xs font-bold text-zinc-800">
                          {reportDetail.trade.request_type}
                        </div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                        <div className="text-[10px] text-zinc-400 uppercase font-bold">Status</div>
                        <div className="text-xs font-bold text-zinc-800">
                          {reportDetail.trade.status}
                        </div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                        <div className="text-[10px] text-zinc-400 uppercase font-bold">Meetup Spot</div>
                        <div className="text-xs font-bold text-zinc-800 truncate">
                          {reportDetail.trade.meetup_location}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Relevant Chat Messages for this Trade Room Only */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-950">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                      In-Trade Chat Log ({reportDetail.tradeMessages.length} messages)
                    </div>
                    <span className="text-[11px] text-zinc-400 italic">
                      Private data (UPI IDs, bank tokens) hidden
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900 text-white max-h-56 overflow-y-auto space-y-2.5 text-xs font-sans">
                    {reportDetail.tradeMessages.length === 0 ? (
                      <div className="text-center py-4 text-zinc-500">
                        No chat messages sent inside this trade room.
                      </div>
                    ) : (
                      reportDetail.tradeMessages.map((msg) => {
                        const isReporterSender =
                          msg.sender_id === reportDetail.report?.reporter_id;
                        return (
                          <div
                            key={msg.id}
                            className={`p-2.5 rounded-xl border ${
                              isReporterSender
                                ? "bg-zinc-800/80 border-zinc-700/80 ml-4"
                                : "bg-zinc-950 border-zinc-800 mr-4"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                              <span className="font-bold text-zinc-200">
                                {msg.sender?.full_name || msg.sender?.roll_number || "Student"} (
                                {isReporterSender ? "Reporter" : "Reported Partner"})
                              </span>
                              <span className="font-mono">
                                {new Date(msg.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-zinc-200 whitespace-pre-wrap">
                              {msg.message}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Status Update & Admin Notes */}
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Admin Investigation Notes & Status
                  </h4>

                  <textarea
                    rows={2}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Enter internal notes regarding this investigation..."
                    className="w-full text-xs p-3 rounded-xl bg-white border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-950/20 text-zinc-900 placeholder:text-zinc-400 resize-none"
                  />

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUpdatingStatus}
                      onClick={() => handleUpdateStatus("INVESTIGATING")}
                      className="text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                    >
                      {isUpdatingStatus ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      Mark Investigating
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUpdatingStatus}
                      onClick={() => handleUpdateStatus("DISMISSED")}
                      className="text-xs font-semibold text-zinc-600 border-zinc-300 hover:bg-zinc-100"
                    >
                      Dismiss Report
                    </Button>
                    <Button
                      size="sm"
                      disabled={isUpdatingStatus}
                      onClick={() => handleUpdateStatus("RESOLVED")}
                      className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Mark Resolved
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* DISCIPLINARY ACTION CONFIRMATION MODAL */}
      {modTargetUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  modTargetUser.action === "BAN_USER"
                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                    : modTargetUser.action === "SUSPEND_USER"
                    ? "bg-amber-50 text-amber-600 border border-amber-100"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                }`}
              >
                {modTargetUser.action === "BAN_USER" ? (
                  <Ban className="w-5 h-5" />
                ) : modTargetUser.action === "SUSPEND_USER" ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <UserCheck className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-950">
                  Confirm {modTargetUser.action.replace(/_/g, " ")}
                </h3>
                <p className="text-xs text-zinc-500">
                  Target: <span className="font-semibold text-zinc-800">{modTargetUser.name}</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 space-y-1">
              {modTargetUser.action === "BAN_USER" && (
                <p>
                  <strong>Permanent Ban:</strong> This student will be immediately blocked from
                  creating requests, accepting exchanges, and sending messages across Velto.
                </p>
              )}
              {modTargetUser.action === "SUSPEND_USER" && (
                <p>
                  <strong>Temporary Suspension:</strong> This student will be restricted until
                  manually restored by an administrator.
                </p>
              )}
              {modTargetUser.action === "RESTORE_USER" && (
                <p>
                  <strong>Restoration:</strong> This student will regain full campus marketplace
                  privileges.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">
                Reason for Moderation Action <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="Required: State the verified violation or rationale for the audit log..."
                className="w-full text-xs p-3 rounded-xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950/20 text-zinc-900 placeholder:text-zinc-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                variant="ghost"
                size="sm"
                disabled={isModerating}
                onClick={() => {
                  setModTargetUser(null);
                  setModReason("");
                }}
                className="text-xs text-zinc-500 hover:text-zinc-800"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isModerating || !modReason.trim()}
                onClick={handleExecuteModeration}
                className={`text-xs font-semibold text-white px-4 ${
                  modTargetUser.action === "BAN_USER"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : modTargetUser.action === "SUSPEND_USER"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isModerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Executing...
                  </>
                ) : (
                  `Confirm ${modTargetUser.action.replace(/_/g, " ")}`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
