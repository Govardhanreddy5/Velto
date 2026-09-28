"use client";

import * as React from "react";
import { useState } from "react";
import { Trade, TradeMessage, TradeRating, SafetyReport } from "@/types/database";
import { TradeChat } from "@/components/trades/trade-chat";
import { TradeSettlement } from "@/components/trades/trade-settlement";
import { TradeRatingCard } from "@/components/trades/trade-rating-card";
import { TradeReportModal } from "@/components/trades/trade-report-modal";
import Link from "next/link";
import {
  Banknote,
  Smartphone,
  MapPin,
  Clock,
  Star,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  Lock,
} from "lucide-react";

interface TradeRoomClientProps {
  initialTrade: Trade;
  initialMessages: TradeMessage[];
  currentUserId: string;
  userRating: TradeRating | null;
  userReports: SafetyReport[];
  campus?: string;
}

export function TradeRoomClient({
  initialTrade,
  initialMessages,
  currentUserId,
  userRating,
  userReports,
  campus,
}: TradeRoomClientProps) {
  const [trade, setTrade] = useState<Trade>(initialTrade);

  const isRequester = trade.requester_id === currentUserId;
  const partner = isRequester ? trade.fulfiller : trade.requester;
  const isNeedCash = trade.request_type === "NEED_CASH";
  const campusName = campus || trade.requester?.campus || partner?.campus || "Vishnu Educational Society";

  const partnerName = partner?.full_name || "Verified Student";
  const partnerDept = partner?.department || "Campus Student";
  const partnerYear = partner?.year_of_study
    ? `Year ${partner.year_of_study}`
    : "Enrolled";
  const partnerRating = Number(partner?.rating_avg || 5.0).toFixed(1);
  const partnerTrades = partner?.total_trades || 0;

  const startedAt = new Date(trade.started_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleTradeUpdate = (updatedTrade: Trade) => {
    setTrade(updatedTrade);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Feed
            </Link>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-950">Trade Room</span>
              <span className="font-mono text-xs text-zinc-400">
                #{trade.id.slice(0, 8)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border transition-all ${
                trade.status === "COMPLETED"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : trade.status === "IN_PROGRESS"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
              }`}
            >
              {trade.status === "IN_PROGRESS" && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
              {trade.status === "COMPLETED" && (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              )}
              {trade.status === "IN_PROGRESS" ? "Active Trade" : trade.status}
            </span>

            {/* Safety & Issue Reporting */}
            <TradeReportModal
              tradeId={trade.id}
              partnerName={partnerName}
              existingReports={userReports}
            />
          </div>
        </div>
      </header>

      {/* Main Trade Content */}
      <main className="max-w-4xl mx-auto px-6 pt-8 space-y-6">
        {/* Status Banner */}
        <div className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  trade.status === "COMPLETED"
                    ? "bg-emerald-100/70 text-emerald-800 border-emerald-200"
                    : "bg-blue-100/70 text-blue-800 border-blue-200"
                }`}
              >
                {trade.status === "COMPLETED"
                  ? "Trade Completed Successfully"
                  : "Matched — arrange your meetup"}
              </span>
              <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5" />
                Matched at {startedAt}
              </span>
            </div>
            <h1 className="text-2xl font-black text-zinc-950 tracking-tight">
              Peer Swap: ₹{trade.amount}
            </h1>
            <p className="text-xs text-zinc-500">
              {trade.status === "COMPLETED"
                ? "Both students confirmed receipt. Funds and physical cash swapped directly."
                : "You are matched with a verified student. Coordinate meetup and complete the physical cash ↔ UPI swap directly."}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <div className="px-5 py-3 rounded-2xl bg-zinc-100 text-right">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Swap Amount
              </span>
              <div className="text-2xl font-black font-mono text-zinc-950">
                ₹{trade.amount}
              </div>
            </div>
          </div>
        </div>

        {/* Exchange Direction & Mutual Responsibility Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Your Action */}
          <div className="p-5 bg-blue-50/60 rounded-2xl border border-blue-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                Your Obligation ({isRequester ? "Requester" : "Fulfiller"})
              </span>
              <span className="p-1.5 rounded-lg bg-blue-600 text-white">
                {(isRequester && isNeedCash) || (!isRequester && !isNeedCash) ? (
                  <Smartphone className="w-4 h-4" />
                ) : (
                  <Banknote className="w-4 h-4" />
                )}
              </span>
            </div>

            <div>
              <div className="text-base font-bold text-zinc-950">
                {isRequester
                  ? isNeedCash
                    ? "Pay via UPI → Receive Physical Cash"
                    : "Give Physical Cash → Receive UPI"
                  : isNeedCash
                  ? "Give Physical Cash → Receive UPI"
                  : "Pay via UPI → Receive Physical Cash"}
              </div>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                {isRequester
                  ? isNeedCash
                    ? `You receive ₹${trade.amount} physical cash in hand. Pay ₹${trade.amount} via UPI to ${partnerName}.`
                    : `Hand over ₹${trade.amount} physical cash in hand. ${partnerName} will transfer ₹${trade.amount} via UPI.`
                  : isNeedCash
                  ? `Bring ₹${trade.amount} in physical cash to hand over. ${partnerName} will transfer ₹${trade.amount} via UPI.`
                  : `Transfer ₹${trade.amount} via UPI. ${partnerName} will hand you ₹${trade.amount} physical cash.`}
              </p>
            </div>
          </div>

          {/* Partner Action */}
          <div className="p-5 bg-white rounded-2xl border border-zinc-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Partner Obligation ({isRequester ? "Fulfiller" : "Requester"})
              </span>
              <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
                {(isRequester && isNeedCash) || (!isRequester && !isNeedCash) ? (
                  <Banknote className="w-4 h-4" />
                ) : (
                  <Smartphone className="w-4 h-4" />
                )}
              </span>
            </div>

            <div>
              <div className="text-base font-bold text-zinc-950">
                {isRequester
                  ? isNeedCash
                    ? "Gives Physical Cash & Receives UPI"
                    : "Pays via UPI & Receives Physical Cash"
                  : isNeedCash
                  ? "Pays via UPI & Receives Physical Cash"
                  : "Gives Physical Cash & Receives UPI"}
              </div>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                {isRequester
                  ? isNeedCash
                    ? `${partnerName} hands you ₹${trade.amount} physical cash in person.`
                    : `${partnerName} pays you ₹${trade.amount} via UPI upon meetup.`
                  : isNeedCash
                  ? `${partnerName} pays you ₹${trade.amount} via UPI upon receiving physical cash.`
                  : `${partnerName} hands you ₹${trade.amount} physical cash upon verified UPI payment.`}
              </p>
            </div>
          </div>
        </div>

        {/* Partner Public Profile & Meetup Spot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Partner Card */}
          <div className="p-6 bg-white rounded-3xl border border-zinc-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Trading Partner
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Verified Student
              </span>
            </div>

            <div className="flex items-start gap-4">
              {partner?.avatar_url ? (
                <img
                  src={partner.avatar_url}
                  alt={partnerName}
                  className="w-12 h-12 rounded-2xl object-cover shrink-0 shadow-md border border-zinc-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md shadow-blue-500/10">
                  {partnerName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="space-y-1">
                <h4 className="text-base font-bold text-zinc-950">
                  {partnerName}
                </h4>
                <div className="text-xs text-zinc-500">
                  <span>{partnerDept}</span> • <span>{partnerYear}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                    {partnerRating}
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-600 font-medium">
                    {partnerTrades} completed trades
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-zinc-400 italic">
              Student UPI IDs are kept secure and private until the payment confirmation step.
            </div>
          </div>

          {/* Meetup Location */}
          <div className="p-6 bg-white rounded-3xl border border-zinc-200/90 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Campus Meetup Spot
                </h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  <MapPin className="w-3 h-3 text-blue-600" />
                  Designated Area
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-blue-600 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-zinc-950">
                    {trade.meetup_location}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Campus: {campusName}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-[11px] text-zinc-600 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Always swap in public view (near canteen counters, central library
                front desk, or active hostel gates).
              </span>
            </div>
          </div>
        </div>

        {/* Two-Sided Settlement & Confirmation Section */}
        <section className="space-y-3">
          <TradeSettlement
            trade={trade}
            currentUserId={currentUserId}
            partnerName={partnerName}
            onTradeUpdate={handleTradeUpdate}
            onTradeStatusChange={(newStatus) => {
              setTrade((prev) => ({ ...prev, status: newStatus as Trade["status"] }));
            }}
          />
        </section>

        {/* Milestone 8: Partner Rating Card (Shows immediately when trade is COMPLETED) */}
        {trade.status === "COMPLETED" && (
          <section className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-200">
            <TradeRatingCard
              tradeId={trade.id}
              partnerName={partnerName}
              initialRating={userRating}
            />
          </section>
        )}

        {/* Private Realtime In-Trade Chat */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-950">
                Meetup Coordination Chat
              </h2>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Private
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              Visible only to you and {partnerName}
            </span>
          </div>

          <TradeChat
            tradeId={trade.id}
            initialMessages={initialMessages}
            currentUserId={currentUserId}
            partnerName={partnerName}
            partnerRole={isRequester ? "Fulfiller" : "Requester"}
            tradeStatus={trade.status}
            meetupLocation={trade.meetup_location}
          />
        </section>
      </main>
    </div>
  );
}
