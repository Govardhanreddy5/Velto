"use client";

import { useState, useTransition } from "react";
import { submitTradeReportAction } from "@/lib/reports/actions";
import { ReportReason, SafetyReport } from "@/types/database";
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Flag,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TradeReportModalProps {
  tradeId: string;
  partnerName: string;
  existingReports?: SafetyReport[];
}

const REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: "NO_SHOW",
    label: "Partner No-Show",
    description: "Partner never appeared at the designated campus meetup spot.",
  },
  {
    value: "DID_NOT_RECEIVE_CASH",
    label: "Did Not Receive Cash",
    description: "Physical cash was not handed over as agreed.",
  },
  {
    value: "DID_NOT_RECEIVE_UPI",
    label: "Did Not Receive UPI Payment",
    description: "Payment is missing from bank account or fake screenshot shown.",
  },
  {
    value: "WRONG_AMOUNT",
    label: "Incorrect Amount Exchanged",
    description: "Partner offered or insisted on a different amount.",
  },
  {
    value: "FRAUD_SUSPICION",
    label: "Suspected Fraud / Impersonation",
    description: "Unverified third-party account, coercion, or deceit.",
  },
  {
    value: "OTHER",
    label: "Other Policy or Safety Concern",
    description: "Harassment, unacceptable conduct, or campus policy violation.",
  },
];

export function TradeReportModal({
  tradeId,
  partnerName,
  existingReports = [],
}: TradeReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReportReason>("NO_SHOW");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setError(null);
    setSuccessMessage(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isPending) return;
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!selectedReason) {
      setError("Please select a report category.");
      return;
    }

    if (details.trim().length > 1000) {
      setError("Details cannot exceed 1,000 characters.");
      return;
    }

    startTransition(async () => {
      const res = await submitTradeReportAction(
        tradeId,
        selectedReason,
        details.trim() || undefined
      );

      if (res.success) {
        setSuccessMessage(
          res.message || "Report filed successfully. Our campus moderation team has been alerted."
        );
        setDetails("");
      } else {
        setError(res.error || "Failed to submit report. Please try again.");
      }
    });
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={handleOpen}
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-zinc-600 hover:text-rose-700 text-xs font-semibold transition-all shadow-sm"
      >
        <Flag className="w-3.5 h-3.5 text-zinc-400 group-hover:text-rose-500" />
        Report Issue
      </button>

      {/* Modal Backdrop & Window */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950">
                    Report Issue with Trade
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Partner: <span className="font-semibold text-zinc-800">{partnerName}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isPending}
                className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing Reports Notice */}
            {existingReports.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  Your Filed Reports ({existingReports.length})
                </div>
                <div className="space-y-1.5">
                  {existingReports.map((r) => (
                    <div
                      key={r.id}
                      className="text-xs p-2 rounded-xl bg-white border border-zinc-200 flex items-center justify-between"
                    >
                      <span className="font-semibold text-zinc-800">
                        {r.reason.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          r.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : r.status === "INVESTIGATING"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : r.status === "RESOLVED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback Banners */}
            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Report Received
                </div>
                <p className="leading-relaxed pl-6">{successMessage}</p>
                <div className="pt-2 pl-6">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClose}
                    className="h-8 text-xs font-semibold bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100/50"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Form */}
            {!successMessage && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Reason Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    What went wrong?
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {REASONS.map((r) => {
                      const isSelected = selectedReason === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setSelectedReason(r.value)}
                          className={`w-full text-left p-3 rounded-2xl border transition-all ${
                            isSelected
                              ? "bg-rose-50/60 border-rose-300 ring-2 ring-rose-200/50"
                              : "bg-white border-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          <div className="text-xs font-bold text-zinc-950 flex items-center justify-between">
                            <span>{r.label}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-rose-600" />
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {r.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Details Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="report-details"
                      className="font-bold text-zinc-700"
                    >
                      Additional Details{" "}
                      <span className="font-normal text-zinc-400">(optional)</span>
                    </label>
                    <span
                      className={`text-[11px] ${
                        details.length > 900
                          ? "text-rose-600 font-bold"
                          : "text-zinc-400"
                      }`}
                    >
                      {details.length}/1000
                    </span>
                  </div>
                  <textarea
                    id="report-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Provide relevant details (e.g. timestamps, what was agreed upon, actions taken)..."
                    className="w-full text-xs p-3 rounded-2xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all resize-none text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    disabled={isPending}
                    className="text-xs text-zinc-500 hover:text-zinc-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isPending}
                    className="text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white px-4 h-9 shadow-sm"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Report"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
