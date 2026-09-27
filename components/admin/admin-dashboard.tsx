"use client";

import { useState, useTransition } from "react";
import {
  getAdminReportDetail,
  updateReportStatusAction,
  moderateUserAction,
  cancelRequestAdminAction,
  resolveTradeAdminAction,
  AdminReportDetailResult,
} from "@/lib/admin/actions";
import {
  ExchangeRequest,
  ModerationAction,
  ModerationAuditLog,
  ModerationStatus,
  Profile,
  SafetyReport,
  Trade,
  TradeMessage,
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
  Users,
  Banknote,
  Smartphone,
  Search,
  Check,
  AlertOctagon,
  Clock,
  Radio,
  FileText,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminDashboardProps {
  initialReports: SafetyReport[];
  initialAuditLogs: ModerationAuditLog[];
  initialStudents?: Profile[];
  initialRequests?: ExchangeRequest[];
  initialTrades?: Trade[];
  initialStats?: {
    totalStudents: number;
    activeRequests: number;
    activeTrades: number;
    completedTrades: number;
    pendingReports: number;
  };
  adminEmail: string;
}

export function AdminDashboard({
  initialReports,
  initialAuditLogs,
  initialStudents = [],
  initialRequests = [],
  initialTrades = [],
  initialStats,
  adminEmail,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "reports" | "students" | "requests" | "trades" | "audit"
  >("reports");

  // Datasets
  const [reports, setReports] = useState<SafetyReport[]>(initialReports);
  const [auditLogs, setAuditLogs] = useState<ModerationAuditLog[]>(initialAuditLogs);
  const [students, setStudents] = useState<Profile[]>(initialStudents);
  const [requests, setRequests] = useState<ExchangeRequest[]>(initialRequests);
  const [trades, setTrades] = useState<Trade[]>(initialTrades);

  // Filters
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("ALL");
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>("ALL");
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>("ALL");
  const [tradeStatusFilter, setTradeStatusFilter] = useState<string>("ALL");

  // Active Report Details
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<AdminReportDetailResult | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [isUpdatingStatus, startStatusUpdate] = useTransition();

  // Moderation Confirmation Modal state
  const [modTargetUser, setModTargetUser] = useState<{
    id: string;
    name: string;
    action: ModerationAction;
  } | null>(null);
  const [modReason, setModReason] = useState("");
  const [isModerating, startModerating] = useTransition();

  // Request Cancel State
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancellingReq, startCancelReq] = useTransition();

  // Trade Resolve State
  const [resolvingTrade, setResolvingTrade] = useState<{
    id: string;
    action: "CANCEL" | "COMPLETE";
  } | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [isResolvingTrade, startResolveTrade] = useTransition();

  // Feedback notifications
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // 1. Inspect Report
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

  // 2. Update Report Status
  const handleUpdateStatus = (newStatus: ModerationStatus) => {
    if (!selectedReportId) return;
    setFeedback(null);

    startStatusUpdate(async () => {
      const res = await updateReportStatusAction(
        selectedReportId,
        newStatus,
        adminNote
      );
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Report status updated to ${newStatus}.`,
        });
        setReports((prev) =>
          prev.map((r) =>
            r.id === selectedReportId
              ? { ...r, status: newStatus, admin_notes: adminNote }
              : r
          )
        );
        if (reportDetail && reportDetail.report) {
          setReportDetail({
            ...reportDetail,
            report: {
              ...reportDetail.report,
              status: newStatus,
              admin_notes: adminNote,
            },
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

  // 3. Execute User Disciplinary Action
  const handleExecuteModeration = () => {
    if (!modTargetUser || !modReason.trim()) return;
    setFeedback(null);

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
          message: `Action ${modTargetUser.action.replace(
            /_/g,
            " "
          )} successfully applied to ${modTargetUser.name}.`,
        });

        const isSuspended =
          modTargetUser.action === "SUSPEND_USER"
            ? true
            : modTargetUser.action === "RESTORE_USER"
            ? false
            : false;
        const isBanned =
          modTargetUser.action === "BAN_USER"
            ? true
            : modTargetUser.action === "RESTORE_USER"
            ? false
            : false;

        // Update students state
        setStudents((prev) =>
          prev.map((s) =>
            s.id === modTargetUser.id
              ? { ...s, is_suspended: isSuspended, is_banned: isBanned }
              : s
          )
        );

        // Update reportDetail if matching
        if (reportDetail && reportDetail.reportedProfile?.id === modTargetUser.id) {
          setReportDetail({
            ...reportDetail,
            reportedProfile: {
              ...reportDetail.reportedProfile,
              is_suspended: isSuspended,
              is_banned: isBanned,
            },
          });
        }

        // Add to audit logs
        setAuditLogs((prev) => [
          {
            id: `audit-${Date.now()}`,
            admin_id: "admin",
            target_user_id: modTargetUser.id,
            action: modTargetUser.action,
            reason: modReason,
            report_id: selectedReportId || null,
            created_at: new Date().toISOString(),
            admin: { id: "admin", email: adminEmail, full_name: "Super Admin", roll_number: "ADMIN" } as Profile,
            target_user: { id: modTargetUser.id, full_name: modTargetUser.name, email: "", roll_number: "" } as Profile,
          },
          ...prev,
        ]);

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

  // 4. Force-Cancel Request
  const handleCancelRequest = (requestId: string) => {
    if (!cancelReason.trim()) return;
    setFeedback(null);

    startCancelReq(async () => {
      const res = await cancelRequestAdminAction(requestId, cancelReason);
      if (res.success) {
        setFeedback({
          type: "success",
          message: "Request successfully cancelled by administrator.",
        });
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: "CANCELLED",
                  note: `${r.note || ""} [Admin Cancelled: ${cancelReason}]`,
                }
              : r
          )
        );
        setCancellingRequestId(null);
        setCancelReason("");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to cancel request.",
        });
      }
    });
  };

  // 5. Force-Resolve Trade
  const handleResolveTrade = () => {
    if (!resolvingTrade) return;
    setFeedback(null);

    startResolveTrade(async () => {
      const res = await resolveTradeAdminAction(
        resolvingTrade.id,
        resolvingTrade.action,
        resolveNotes
      );
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Trade #${resolvingTrade.id.slice(
            0,
            8
          )} marked as ${resolvingTrade.action}.`,
        });
        setTrades((prev) =>
          prev.map((t) =>
            t.id === resolvingTrade.id
              ? {
                  ...t,
                  status:
                    resolvingTrade.action === "CANCEL"
                      ? "CANCELLED"
                      : "COMPLETED",
                }
              : t
          )
        );
        setResolvingTrade(null);
        setResolveNotes("");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to resolve trade.",
        });
      }
    });
  };

  // Filters logic
  const filteredReports = reports.filter((r) => {
    if (reportStatusFilter === "ALL") return true;
    return r.status === reportStatusFilter;
  });

  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.full_name?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (studentStatusFilter === "ACTIVE") return !s.is_suspended && !s.is_banned;
    if (studentStatusFilter === "SUSPENDED") return s.is_suspended;
    if (studentStatusFilter === "BANNED") return s.is_banned;
    return true;
  });

  const filteredRequests = requests.filter((r) => {
    if (requestStatusFilter === "ALL") return true;
    return r.status === requestStatusFilter;
  });

  const filteredTrades = trades.filter((t) => {
    if (tradeStatusFilter === "ALL") return true;
    return t.status === tradeStatusFilter;
  });

  // Overview stats
  const totalVerifiedStudents = initialStats?.totalStudents ?? students.length;
  const activeRequestsCount =
    initialStats?.activeRequests ??
    requests.filter((r) => r.status === "OPEN").length;
  const activeTradesCount =
    initialStats?.activeTrades ??
    trades.filter((t) => t.status === "IN_PROGRESS").length;
  const completedTradesCount =
    initialStats?.completedTrades ??
    trades.filter((t) => t.status === "COMPLETED").length;
  const openReportsCount =
    initialStats?.pendingReports ??
    reports.filter((r) => ["PENDING", "INVESTIGATING"].includes(r.status)).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Platform Stats Overview */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-3xl border border-zinc-800 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-rose-400" />
                Super Administrator
              </span>
              <span className="text-xs text-zinc-400 font-mono">{adminEmail}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Velto Master Control Console
            </h1>
            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Full administrative authority to manage student accounts, audit campus trades,
              resolve dispute reports, and force-cancel fraudulent requests.
            </p>
          </div>
        </div>

        {/* 5 High-Impact Live Platform Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Students
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
              {totalVerifiedStudents}
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Open Requests
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400 mt-0.5">
              {activeRequestsCount}
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Active Trades
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-blue-400 mt-0.5">
              {activeTradesCount}
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center">
            <div className="text-[10px] uppercase font-bold text-zinc-400">
              Completed Swaps
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-400 mt-0.5">
              {completedTradesCount}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 px-4 py-3 rounded-2xl bg-rose-950/40 border border-rose-900/50 text-center">
            <div className="text-[10px] uppercase font-bold text-rose-300">
              Open Disputes
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-400 mt-0.5">
              {openReportsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Action Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between shadow-sm animate-in fade-in duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "reports"
              ? "bg-zinc-950 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Dispute Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab("students")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "students"
              ? "bg-zinc-950 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Campus Students ({students.length})
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "requests"
              ? "bg-zinc-950 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Exchange Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab("trades")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "trades"
              ? "bg-zinc-950 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Campus Trades ({trades.length})
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "audit"
              ? "bg-zinc-950 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          }`}
        >
          Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SAFETY DISPUTE REPORTS */}
      {/* ========================================================================= */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {["ALL", "PENDING", "INVESTIGATING", "RESOLVED", "DISMISSED"].map((status) => (
                <button
                  key={status}
                  onClick={() => setReportStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    reportStatusFilter === status
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className={`${selectedReportId ? "lg:col-span-5" : "lg:col-span-12"} space-y-3`}>
              {filteredReports.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200 shadow-sm space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h3 className="text-sm font-bold text-zinc-900">
                    No reports in this category
                  </h3>
                  <p className="text-xs text-zinc-500">
                    All campus student exchanges are running cleanly.
                  </p>
                </div>
              ) : (
                filteredReports.map((report) => {
                  const isSelected = selectedReportId === report.id;
                  const reporter = report.reporter;
                  const reported = report.reported_user;

                  return (
                    <div
                      key={report.id}
                      onClick={() => handleInspectReport(report.id)}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                        isSelected
                          ? "bg-blue-50/50 border-blue-500 shadow-md ring-1 ring-blue-500"
                          : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            report.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : report.status === "INVESTIGATING"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : report.status === "RESOLVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-zinc-100 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {report.status}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {new Date(report.created_at).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>{report.reason.replace(/_/g, " ")}</span>
                        </h3>
                        {report.details && (
                          <p className="text-xs text-zinc-600 line-clamp-2 mt-1 leading-relaxed">
                            {report.details}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100 text-zinc-600">
                        <div>
                          Reporter:{" "}
                          <strong className="text-zinc-900 font-mono">
                            {reporter?.roll_number || "Student"}
                          </strong>
                        </div>
                        <div>
                          Reported:{" "}
                          <strong className="text-zinc-900 font-mono">
                            {reported?.roll_number || "Partner"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inspection Drawer */}
            {selectedReportId && (
              <div className="lg:col-span-7 bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm space-y-6 sticky top-24">
                {loadingDetail ? (
                  <div className="p-12 text-center space-y-3 text-zinc-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                    <p className="text-xs">Fetching report and chat messages...</p>
                  </div>
                ) : reportDetail ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {reportDetail.report?.reason.replace(/_/g, " ")}
                        </span>
                        <h3 className="text-base font-bold text-zinc-950 mt-1.5">
                          Dispute Case #{reportDetail.report?.id.slice(0, 8)}
                        </h3>
                      </div>
                      <button
                        onClick={() => setSelectedReportId(null)}
                        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Reporter&apos;s Statement
                      </h4>
                      <p className="text-xs text-zinc-800 leading-relaxed font-sans">
                        {reportDetail.report?.details || "No additional text provided."}
                      </p>
                    </div>

                    {/* Participants Profiles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl border border-zinc-200 bg-white space-y-2 text-xs">
                        <span className="text-[10px] font-bold uppercase text-zinc-400 block">
                          Reporter
                        </span>
                        <div className="font-bold text-zinc-950">
                          {reportDetail.reporterProfile?.full_name}
                        </div>
                        <div className="text-zinc-500 font-mono">
                          {reportDetail.reporterProfile?.roll_number}
                        </div>
                        <div className="flex items-center gap-1 font-semibold text-amber-700 pt-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          {Number(reportDetail.reporterProfile?.rating_avg || 5.0).toFixed(1)}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/20 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-rose-500">
                            Reported Partner
                          </span>
                          {reportDetail.reportedProfile?.is_banned ? (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                              Banned
                            </span>
                          ) : reportDetail.reportedProfile?.is_suspended ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Suspended
                            </span>
                          ) : null}
                        </div>
                        <div className="font-bold text-zinc-950">
                          {reportDetail.reportedProfile?.full_name}
                        </div>
                        <div className="text-zinc-500 font-mono">
                          {reportDetail.reportedProfile?.roll_number}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-rose-100">
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
                              className="text-xs h-7 text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                              Suspend
                            </Button>
                          )}
                          {!reportDetail.reportedProfile?.is_banned && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setModTargetUser({
                                  id: reportDetail.reportedProfile!.id!,
                                  name: reportDetail.reportedProfile!.full_name || "Student",
                                  action: "BAN_USER",
                                })
                              }
                              className="text-xs h-7 bg-rose-600 hover:bg-rose-700 text-white"
                            >
                              Ban
                            </Button>
                          )}
                          {(reportDetail.reportedProfile?.is_suspended || reportDetail.reportedProfile?.is_banned) && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setModTargetUser({
                                  id: reportDetail.reportedProfile!.id!,
                                  name: reportDetail.reportedProfile!.full_name || "Student",
                                  action: "RESTORE_USER",
                                })
                              }
                              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-zinc-950 flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                        In-Trade Chat Messages ({reportDetail.tradeMessages.length})
                      </div>
                      <div className="p-4 rounded-2xl bg-zinc-900 text-white max-h-52 overflow-y-auto space-y-2 text-xs font-sans">
                        {reportDetail.tradeMessages.length === 0 ? (
                          <div className="text-center py-4 text-zinc-500">
                            No chat messages in this trade room.
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
                                    ? "bg-zinc-800/80 border-zinc-700 ml-4"
                                    : "bg-zinc-950 border-zinc-800 mr-4"
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                                  <span className="font-bold text-zinc-200">
                                    {msg.sender?.full_name || "Student"} (
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

                    {/* Notes & Status Action */}
                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Admin Investigation Notes & Actions
                      </h4>
                      <textarea
                        rows={2}
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Internal moderation notes..."
                        className="w-full text-xs p-3 rounded-xl bg-white border border-zinc-200 text-zinc-900 resize-none outline-none focus:ring-2 focus:ring-zinc-950/20"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdatingStatus}
                          onClick={() => handleUpdateStatus("INVESTIGATING")}
                          className="text-xs text-blue-700 border-blue-300"
                        >
                          Mark Investigating
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdatingStatus}
                          onClick={() => handleUpdateStatus("DISMISSED")}
                          className="text-xs text-zinc-600"
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          disabled={isUpdatingStatus}
                          onClick={() => handleUpdateStatus("RESOLVED")}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Mark Resolved
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CAMPUS STUDENTS DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === "students" && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by name, roll, email, branch..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 outline-none focus:bg-white focus:ring-2 focus:ring-zinc-950/10"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto overflow-x-auto">
              {["ALL", "ACTIVE", "SUSPENDED", "BANNED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStudentStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    studentStatusFilter === st
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Department & Year</th>
                    <th className="py-3 px-4">Reputation</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-zinc-400">
                        No students found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {s.avatar_url ? (
                              <img
                                src={s.avatar_url}
                                alt={s.full_name || s.roll_number}
                                className="w-8 h-8 rounded-full object-cover border border-zinc-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                                {(s.full_name || s.roll_number || "S").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-zinc-950 flex items-center gap-1.5">
                                <span>{s.full_name || "Registered Student"}</span>
                                {s.is_admin && (
                                  <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono">
                                {s.roll_number} • {s.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600">
                          <div>{s.department || "General"}</div>
                          <div className="text-[11px] text-zinc-400">
                            {s.year_of_study ? `Year ${s.year_of_study}` : "Enrolled"}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1 font-semibold text-amber-700">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                            <span>{Number(s.rating_avg || 5.0).toFixed(1)}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {s.total_trades || 0} trades
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {s.is_banned ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <Ban className="w-3 h-3" />
                              Banned
                            </span>
                          ) : s.is_suspended ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" />
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check className="w-3 h-3" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {!s.is_admin && (
                            <div className="flex items-center justify-end gap-1.5">
                              {!s.is_suspended && !s.is_banned && (
                                <button
                                  onClick={() =>
                                    setModTargetUser({
                                      id: s.id,
                                      name: s.full_name || s.roll_number,
                                      action: "SUSPEND_USER",
                                    })
                                  }
                                  className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                                >
                                  Suspend
                                </button>
                              )}
                              {!s.is_banned && (
                                <button
                                  onClick={() =>
                                    setModTargetUser({
                                      id: s.id,
                                      name: s.full_name || s.roll_number,
                                      action: "BAN_USER",
                                    })
                                  }
                                  className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                                >
                                  Ban
                                </button>
                              )}
                              {(s.is_suspended || s.is_banned) && (
                                <button
                                  onClick={() =>
                                    setModTargetUser({
                                      id: s.id,
                                      name: s.full_name || s.roll_number,
                                      action: "RESTORE_USER",
                                    })
                                  }
                                  className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
                                >
                                  Restore
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXCHANGE REQUESTS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-1.5 text-xs">
              {["ALL", "OPEN", "ACCEPTED", "COMPLETED", "CANCELLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setRequestStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    requestStatusFilter === st
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="text-xs text-zinc-500">
              {filteredRequests.length} requests
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Requester</th>
                    <th className="py-3 px-4">Exchange Type</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-zinc-400">
                        No requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => {
                      const isNeedCash = r.request_type === "NEED_CASH";
                      return (
                        <tr key={r.id} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-zinc-950">
                              {r.requester?.full_name || "Student"}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono">
                              {r.requester?.roll_number}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isNeedCash
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {isNeedCash ? "Needs Cash" : "Has Cash"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-zinc-950 text-sm">
                            ₹{r.amount}
                          </td>
                          <td className="py-3.5 px-4 text-zinc-600">
                            {r.location_hint}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                r.status === "OPEN"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : r.status === "ACCEPTED"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : r.status === "COMPLETED"
                                  ? "bg-zinc-100 text-zinc-800"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {r.status === "OPEN" && (
                              <button
                                onClick={() => {
                                  setCancellingRequestId(r.id);
                                  setCancelReason("Violates campus guidelines");
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                              >
                                Cancel Request
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CAMPUS TRADES OVERSIGHT */}
      {/* ========================================================================= */}
      {activeTab === "trades" && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-1.5 text-xs">
              {["ALL", "IN_PROGRESS", "COMPLETED", "CANCELLED", "DISPUTED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setTradeStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    tradeStatusFilter === st
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="text-xs text-zinc-500">
              {filteredTrades.length} trades
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Trade Room</th>
                    <th className="py-3 px-4">Participants</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Confirmations</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Admin Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-zinc-400">
                        No trades found.
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.map((t) => (
                      <tr key={t.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                          #{t.id.slice(0, 8)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-900">
                            Req: {t.requester?.full_name || t.requester?.roll_number}
                          </div>
                          <div className="text-zinc-500 text-[11px]">
                            Ful: {t.fulfiller?.full_name || t.fulfiller?.roll_number}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-zinc-950">
                          ₹{t.amount}
                        </td>
                        <td className="py-3.5 px-4 text-[11px]">
                          <div>Req: {t.requester_confirmed ? "✓ Yes" : "⏳ Pending"}</div>
                          <div>Ful: {t.fulfiller_confirmed ? "✓ Yes" : "⏳ Pending"}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              t.status === "IN_PROGRESS"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : t.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : t.status === "DISPUTED"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {["IN_PROGRESS", "DISPUTED"].includes(t.status) && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setResolvingTrade({ id: t.id, action: "COMPLETE" });
                                  setResolveNotes("Admin verified completion");
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
                              >
                                Force Complete
                              </button>
                              <button
                                onClick={() => {
                                  setResolvingTrade({ id: t.id, action: "CANCEL" });
                                  setResolveNotes("Admin cancelled trade");
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                              >
                                Force Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: MODERATION AUDIT TRAIL */}
      {/* ========================================================================= */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Student</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-zinc-400">
                      No disciplinary actions logged yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            log.action === "BAN_USER"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : log.action === "SUSPEND_USER"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : log.action === "RESTORE_USER"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-zinc-900">
                        {log.target_user?.full_name || log.target_user?.roll_number || "Student"}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600 max-w-md leading-relaxed">
                        {log.reason}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                  <strong>Restoration:</strong> This student will regain full campus marketplace privileges.
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
                placeholder="Required: State the verified rationale for this disciplinary action..."
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

      {/* CANCEL REQUEST CONFIRMATION MODAL */}
      {cancellingRequestId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-950">
              Admin: Force-Cancel Exchange Request
            </h3>
            <p className="text-xs text-zinc-500">
              The request will be immediately removed from the campus feed.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">
                Reason for Cancellation <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Inappropriate meetup spot, duplicate spam..."
                className="w-full text-xs p-3 rounded-xl bg-zinc-50 border border-zinc-200 focus:bg-white text-zinc-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancellingRequestId(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isCancellingReq || !cancelReason.trim()}
                onClick={() => handleCancelRequest(cancellingRequestId)}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isCancellingReq ? "Cancelling..." : "Confirm Force-Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE TRADE CONFIRMATION MODAL */}
      {resolvingTrade && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-950">
              Admin: Force-{resolvingTrade.action === "CANCEL" ? "Cancel" : "Complete"} Trade
            </h3>
            <p className="text-xs text-zinc-500">
              Trade ID: #{resolvingTrade.id.slice(0, 8)}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">
                Administrative Notes
              </label>
              <input
                type="text"
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="State verified outcome for the audit log..."
                className="w-full text-xs p-3 rounded-xl bg-zinc-50 border border-zinc-200 focus:bg-white text-zinc-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResolvingTrade(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isResolvingTrade}
                onClick={handleResolveTrade}
                className={`text-xs text-white ${
                  resolvingTrade.action === "CANCEL"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isResolvingTrade
                  ? "Resolving..."
                  : `Confirm ${resolvingTrade.action}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
