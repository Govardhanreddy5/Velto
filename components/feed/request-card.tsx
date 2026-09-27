"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { ExchangeRequest } from "@/types/database";
import {
  Banknote,
  Smartphone,
  MapPin,
  Clock,
  Star,
  CheckCircle2,
  FileText,
  User,
} from "lucide-react";

interface RequestCardProps {
  request: ExchangeRequest;
  isOwner?: boolean;
  onCancel?: (id: string) => void;
  onAccept?: (request: ExchangeRequest) => void;
  isCancelling?: boolean;
}

export function RequestCard({
  request,
  isOwner = false,
  onCancel,
  onAccept,
  isCancelling = false,
}: RequestCardProps) {
  const isNeedCash = request.request_type === "NEED_CASH";
  const requester = request.requester;

  // Live countdown timer calculation
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const expiresAt = new Date(request.expires_at).getTime();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("Expired");
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMins = minutes % 60;
        setTimeLeft(`${hours}h ${remMins}m left`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m left`);
      } else {
        setTimeLeft(`${seconds}s left`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 5000);
    return () => clearInterval(interval);
  }, [request.expires_at]);

  const ratingAvg = Number(requester?.rating_avg || 5.0).toFixed(1);
  const totalTrades = requester?.total_trades || 0;
  const requesterName = requester?.full_name || "Verified Student";
  const department = requester?.department || "Department Student";
  const yearText = requester?.year_of_study
    ? `Year ${requester.year_of_study}`
    : "Enrolled";

  return (
    <div
      className={`rounded-2xl border bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-4 transition-all hover:shadow-md ${
        isExpired
          ? "opacity-60 border-zinc-200"
          : isNeedCash
          ? "border-emerald-200/80 hover:border-emerald-300"
          : "border-blue-200/80 hover:border-blue-300"
      }`}
    >
      {/* Top Banner: Trade Type & Amount */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-4">
        <div className="space-y-1.5">
          {/* Plain-Language Label */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isNeedCash
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {isNeedCash ? (
                <>
                  <Banknote className="w-3.5 h-3.5" />
                  Need Cash
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  Have Cash → Want UPI
                </>
              )}
            </span>

            {/* Time Left pill */}
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
                isExpired
                  ? "bg-zinc-100 text-zinc-500"
                  : "bg-amber-50 text-amber-800 border border-amber-200/60"
              }`}
            >
              <Clock className="w-3 h-3" />
              {timeLeft}
            </span>
          </div>

          {/* Description */}
          <h3 className="text-base font-bold text-zinc-950">
            {isNeedCash ? (
              <span>
                Needs <strong className="text-emerald-600">₹{request.amount}</strong> cash — pays by UPI
              </span>
            ) : (
              <span>
                Has <strong className="text-blue-600">₹{request.amount}</strong> cash — wants UPI
              </span>
            )}
          </h3>
        </div>

        {/* Amount Badge */}
        <div className="text-right shrink-0">
          <span className="text-2xl font-extrabold text-zinc-950 font-mono">
            ₹{request.amount}
          </span>
        </div>
      </div>

      {/* Middle Details: Location & Note */}
      <div className="space-y-2 text-xs text-zinc-600">
        <div className="flex items-center gap-1.5 font-medium text-zinc-800">
          <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Meetup at: <strong className="text-zinc-950">{request.location_hint}</strong></span>
        </div>

        {request.note && (
          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200/70 text-zinc-600 flex items-start gap-2">
            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p className="italic leading-relaxed">{request.note}</p>
          </div>
        )}
      </div>

      {/* Bottom Footer: Requester Public Profile & Action */}
      <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Public profile summary (NO UPI ID EXPOSED) */}
        {!isOwner && requester ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>{requesterName}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            </div>
            <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
              <span>{department}</span>
              <span>•</span>
              <span>{yearText}</span>
              <span>•</span>
              <span className="flex items-center gap-0.5 text-amber-700 font-medium">
                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                {ratingAvg}
              </span>
              <span>•</span>
              <span>{totalTrades} trades</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-200">
                <User className="w-3 h-3" />
                Posted by you
              </span>
              <span className="text-[11px] font-mono font-medium text-zinc-500">
                ({request.status})
              </span>
            </div>
            {requester && (
              <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
                <span>{requesterName}</span>
                <span>•</span>
                <span>{department}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div>
          {isOwner ? (
            request.status === "OPEN" && !isExpired && (
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => onCancel && onCancel(request.id)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                {isCancelling ? "Cancelling..." : "Cancel Request"}
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={isExpired || request.status !== "OPEN"}
              onClick={() => onAccept && onAccept(request)}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/10 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
            >
              Accept Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
