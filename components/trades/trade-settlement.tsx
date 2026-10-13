"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Trade } from "@/types/database";
import { confirmTradeSettlementAction, getTradeById } from "@/lib/trades/actions";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Banknote,
  Smartphone,
  Loader2,
  Star,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

interface TradeSettlementProps {
  trade: Trade;
  currentUserId: string;
  partnerName: string;
  onTradeStatusChange?: (newStatus: string) => void;
  onTradeUpdate?: (updatedTrade: Trade) => void;
}

export function TradeSettlement({
  trade: initialTrade,
  currentUserId,
  partnerName,
  onTradeStatusChange,
  onTradeUpdate,
}: TradeSettlementProps) {
  const router = useRouter();

  const [trade, setTrade] = useState<Trade>(initialTrade);
  const [prevInitialTrade, setPrevInitialTrade] = useState<Trade>(initialTrade);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasCheckedNotice, setHasCheckedNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep local state in sync if initial prop changes
  if (initialTrade !== prevInitialTrade) {
    setPrevInitialTrade(initialTrade);
    setTrade(initialTrade);
  }

  const isRequester = currentUserId === trade.requester_id;
  const isNeedCash = trade.request_type === "NEED_CASH";

  const myConfirmed = isRequester
    ? trade.requester_confirmed
    : trade.fulfiller_confirmed;

  const partnerConfirmed = isRequester
    ? trade.fulfiller_confirmed
    : trade.requester_confirmed;

  const isCompleted = trade.status === "COMPLETED";

  // Secure fallback trade refresher respecting RLS
  const refreshTrade = React.useCallback(async () => {
    try {
      const res = await getTradeById(trade.id);
      if (res.trade) {
        setTrade((prev) => {
          const next = { ...prev, ...res.trade! };
          if (next.status && onTradeStatusChange) {
            onTradeStatusChange(next.status);
          }
          if (onTradeUpdate) {
            onTradeUpdate(next);
          }
          return next;
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[TradeSettlement Fallback Refresh Error]:", err);
      }
    }
  }, [trade.id, onTradeStatusChange, onTradeUpdate]);

  // Realtime subscription to trade settlement updates
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let isMounted = true;
    let authSub: { unsubscribe: () => void } | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const initSubscription = async () => {
      // 1. Ensure access token is set on Realtime WebSocket for RLS authorization
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[TradeSettlement Auth Warning]:", err);
        }
      }

      // Listen for session refresh
      const { data } = supabase.auth.onAuthStateChange(async (_event: unknown, session: { access_token?: string } | null) => {
        if (session?.access_token) {
          try {
            await supabase.realtime.setAuth(session.access_token);
          } catch {
            // ignore
          }
        }
      });
      authSub = data.subscription;

      if (!isMounted) return;

      // 2. Subscribe to UPDATE on this specific trade row
      channel = supabase
        .channel(`trade_settlement_${trade.id}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "UPDATE",
            schema: "public",
            table: "trades",
            filter: `id=eq.${trade.id}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: { new: Record<string, any> }) => {
            const updated = payload.new as Partial<Trade>;
            setTrade((prev) => {
              const next = { ...prev, ...updated };
              if (next.status && onTradeStatusChange) {
                onTradeStatusChange(next.status);
              }
              if (onTradeUpdate) {
                onTradeUpdate(next);
              }
              return next;
            });
          }
        )
        .subscribe((status: string, err?: unknown) => {
          if (!isMounted) return;

          if (process.env.NODE_ENV === "development") {
            if (err) {
              console.error(`[TradeSettlement Realtime Error] Status: ${status}`, err);
            } else {
              console.log(`[TradeSettlement Realtime Status]: ${status}`);
            }
          }

          if (status === "SUBSCRIBED") {
            refreshTrade();
          }
        });
    };

    initSubscription();

    // 3. Fallback refresh when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshTrade();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 4. Polling fallback while trade is not yet completed
    const interval = setInterval(() => {
      if (!isCompleted) {
        refreshTrade();
      }
    }, 7000);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      if (authSub) authSub.unsubscribe();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [trade.id, onTradeStatusChange, onTradeUpdate, router, refreshTrade, isCompleted]);


  // Determine what I am confirming receipt of:
  // NEED_CASH: Requester confirms CASH receipt; Fulfiller confirms UPI receipt
  // HAVE_CASH_WANT_UPI: Requester confirms UPI receipt; Fulfiller confirms CASH receipt
  const iReceiveCash = (isRequester && isNeedCash) || (!isRequester && !isNeedCash);

  const confirmReceiptTitle = iReceiveCash
    ? `I Received ₹${trade.amount} in Cash`
    : `I Received ₹${trade.amount} via UPI`;

  const confirmReceiptExplanation = iReceiveCash
    ? `Verify that you have physically counted ₹${trade.amount} in paper cash handed to you by ${partnerName}.`
    : `Verify that ₹${trade.amount} has credited to your personal UPI/bank account from ${partnerName}.`;

  const handleConfirmSubmit = async () => {
    if (!hasCheckedNotice || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await confirmTradeSettlementAction(trade.id);

      if (!res.success) {
        setErrorMessage(res.error || "Failed to confirm settlement.");
        setIsSubmitting(false);
        return;
      }

      setShowConfirmModal(false);

      // Optimistically update local state
      setTrade((prev) => {
        const next = {
          ...prev,
          requester_confirmed: isRequester ? true : prev.requester_confirmed,
          fulfiller_confirmed: !isRequester ? true : prev.fulfiller_confirmed,
          status: res.status ? (res.status as Trade["status"]) : prev.status,
          completed_at: res.completed ? new Date().toISOString() : prev.completed_at,
        };
        if (next.status && onTradeStatusChange) {
          onTradeStatusChange(next.status);
        }
        if (onTradeUpdate) {
          onTradeUpdate(next);
        }
        return next;
      });
    } catch {
      setErrorMessage("Network error confirming receipt. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedTimeFormatted = trade.completed_at
    ? new Date(trade.completed_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Settlement Main Card */}
      <div
        className={`rounded-3xl border p-6 shadow-sm transition-all ${
          isCompleted
            ? "bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 border-emerald-200"
            : "bg-white border-zinc-200/90"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Two-Sided Settlement
              </span>
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Completed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  <Clock className="w-3 h-3 text-blue-600 animate-spin" />
                  Awaiting Confirmations
                </span>
              )}
            </div>

            <h3 className="text-lg font-black text-zinc-950">
              {isCompleted
                ? "Trade Successfully Completed!"
                : "Confirm What You Received"}
            </h3>
            <p className="text-xs text-zinc-500">
              {isCompleted
                ? "Both students confirmed receipt. Funds and cash swapped directly."
                : "Both students must separately verify and confirm receipt before this trade completes."}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-zinc-100 text-right">
              <span className="text-[10px] uppercase font-bold text-zinc-400">
                Settled Amount
              </span>
              <div className="text-xl font-black font-mono text-zinc-950">
                ₹{trade.amount}
              </div>
            </div>
          </div>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-5">
          {/* Your Confirmation State */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              myConfirmed
                ? "bg-emerald-50/70 border-emerald-200"
                : "bg-zinc-50 border-zinc-200/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Your Confirmation
              </span>
              {myConfirmed ? (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  Pending
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <div className="text-sm font-bold text-zinc-900">
                {confirmReceiptTitle}
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {myConfirmed
                  ? "You verified receipt of your owed balance."
                  : confirmReceiptExplanation}
              </p>
            </div>
          </div>

          {/* Partner Confirmation State */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              partnerConfirmed
                ? "bg-emerald-50/70 border-emerald-200"
                : "bg-zinc-50 border-zinc-200/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {partnerName}&apos;s Confirmation
              </span>
              {partnerConfirmed ? (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  Pending
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <div className="text-sm font-bold text-zinc-900">
                {iReceiveCash
                  ? `${partnerName} confirms UPI receipt`
                  : `${partnerName} confirms Cash receipt`}
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {partnerConfirmed
                  ? `${partnerName} has confirmed receiving their balance.`
                  : `Waiting for ${partnerName} to confirm on their screen.`}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button Area */}
        <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {isCompleted ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  Trade finalized at <strong>{completedTimeFormatted || "now"}</strong>.
                  Both students verified and settled.
                </span>
              </div>

              {/* Milestone 8 Placeholder */}
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-600 text-xs font-semibold cursor-not-allowed">
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                Rate {partnerName} (Milestone 8)
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Only confirm receipt <strong>after</strong> verifying physical
                  currency or checking your bank balance.
                </span>
              </div>

              <div>
                {myConfirmed ? (
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                    <Check className="w-4 h-4" />
                    You Confirmed Receipt (Waiting for {partnerName})
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-500/10 transition-all cursor-pointer"
                  >
                    {iReceiveCash ? (
                      <Banknote className="w-4 h-4" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                    {confirmReceiptTitle}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog / Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden transform animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-zinc-950">
                    Confirm Receipt
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Final settlement verification
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-center space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Amount Received
                </span>
                <div className="text-3xl font-black font-mono text-zinc-950">
                  ₹{trade.amount}
                </div>
                <div className="text-xs text-zinc-600 font-medium">
                  {iReceiveCash ? "in Physical Cash" : "via UPI Transfer"}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1.5">
                <p className="font-bold">Irreversible Action Notice:</p>
                <p>
                  Velto is a non-custodial peer swap. Confirming receipt signals to
                  the system that you have received your exact funds. This cannot be
                  reversed casually.
                </p>
              </div>

              {/* Checkbox Agreement */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasCheckedNotice}
                  onChange={(e) => setHasCheckedNotice(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-700 leading-normal">
                  I certify that I have physically counted the cash or checked my
                  bank account balance and confirm receiving{" "}
                  <strong>₹{trade.amount}</strong> from {partnerName}.
                </span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="p-6 pt-4 border-t border-zinc-100 flex items-center justify-end gap-3 bg-zinc-50/50">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl text-zinc-600 hover:bg-zinc-200/60 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!hasCheckedNotice || isSubmitting}
                onClick={handleConfirmSubmit}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/10 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recording Settlement...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Yes, Confirm Receipt
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
