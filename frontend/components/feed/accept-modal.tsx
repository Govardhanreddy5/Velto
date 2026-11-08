"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExchangeRequest } from "@/types/database";
import { acceptExchangeRequestAction } from "@/lib/trades/actions";
import {
  Banknote,
  Smartphone,
  MapPin,
  ShieldAlert,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  User,
} from "lucide-react";

interface AcceptModalProps {
  request: ExchangeRequest | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AcceptModal({ request, isOpen, onClose }: AcceptModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !request) return null;

  const isNeedCash = request.request_type === "NEED_CASH";
  const requester = request.requester;
  const requesterName = requester?.full_name || "Verified Student";

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await acceptExchangeRequestAction(request.id);

      if (!res.success) {
        setErrorMessage(res.error || "Failed to accept exchange request.");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      router.push(`/trades/${res.tradeId}`);
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`p-2 rounded-xl ${
                isNeedCash
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                  : "bg-blue-50 text-blue-600 border border-blue-100"
              }`}
            >
              {isNeedCash ? (
                <Banknote className="w-5 h-5" />
              ) : (
                <Smartphone className="w-5 h-5" />
              )}
            </span>
            <div>
              <h2 className="text-lg font-bold text-zinc-950">
                Confirm Cash Exchange Trade
              </h2>
              <p className="text-xs text-zinc-500">
                Peer-to-peer student swap on campus
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting || isSuccess}
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Cannot Accept Request</p>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Message Banner */}
          {isSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Trade matched! Opening trade room...</span>
            </div>
          )}

          {/* Amount & Meetup Summary Card */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Exchange Amount
              </span>
              <div className="text-3xl font-extrabold text-zinc-950 font-mono">
                ₹{request.amount}
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-zinc-700 font-semibold justify-end">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>{request.location_hint}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-zinc-500 justify-end">
                <User className="w-3 h-3 text-zinc-400" />
                <span>with {requesterName}</span>
              </div>
            </div>
          </div>

          {/* Breakdown of Mutual Responsibilities */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Exchange Breakdown
            </h4>

            <div className="rounded-xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100 text-xs">
              {/* Fulfiller Role (Current User) */}
              <div className="p-3.5 bg-blue-50/50 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                  YOU
                </div>
                <div>
                  <div className="font-bold text-zinc-900">
                    {isNeedCash ? "You GIVE Physical Cash" : "You PAY via UPI"}
                  </div>
                  <p className="text-zinc-600 text-[11px] mt-0.5 leading-relaxed">
                    {isNeedCash
                      ? `Bring ₹${request.amount} in paper currency to ${request.location_hint}.`
                      : `Open your UPI app to transfer ₹${request.amount} to the student upon meetup.`}
                  </p>
                </div>
              </div>

              {/* Requester Role */}
              <div className="p-3.5 bg-zinc-50/80 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-300 text-zinc-700 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                  THEM
                </div>
                <div>
                  <div className="font-bold text-zinc-900">
                    {isNeedCash ? "They PAY you via UPI" : "They GIVE you Physical Cash"}
                  </div>
                  <p className="text-zinc-600 text-[11px] mt-0.5 leading-relaxed">
                    {isNeedCash
                      ? `The student transfers ₹${request.amount} directly to your UPI ID on the spot.`
                      : `The student hands you ₹${request.amount} in physical cash in person.`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Campus Safety Notice */}
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2.5 text-[11px] text-amber-900 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p>
              <strong>Campus Safety:</strong> Only meet in designated public spots
              (canteen, library lobby). Velto never touches student funds. Verify
              both cash and UPI transfer before parting ways.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-zinc-100 flex items-center justify-end gap-3 bg-zinc-50/50">
          <button
            type="button"
            disabled={isSubmitting || isSuccess}
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSubmitting || isSuccess}
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Matching Trade...
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Matched!
              </>
            ) : (
              <>
                Confirm & Accept Trade
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
