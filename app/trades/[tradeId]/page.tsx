import { checkUserRouting } from "@/lib/profile/actions";
import { getTradeById } from "@/lib/trades/actions";
import { redirect } from "next/navigation";
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
  MessageSquare,
  Lock,
  AlertCircle,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Room | Velto",
  description: "Matched peer-to-peer cash exchange trade room.",
};

interface TradePageProps {
  params: Promise<{
    tradeId: string;
  }>;
}

export default async function TradePage({ params }: TradePageProps) {
  const { tradeId } = await params;

  const routing = await checkUserRouting();

  if (routing.status === "UNAUTHENTICATED") {
    redirect("/auth?mode=signin");
  }

  if (routing.status === "RESTRICTED") {
    redirect("/access-restricted");
  }

  if (routing.status === "NEEDS_ONBOARDING") {
    redirect("/onboarding");
  }

  const { trade, error } = await getTradeById(tradeId);

  // If trade not found or user is not a participant
  if (error || !trade) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-zinc-950">
              Trade Room Inaccessible
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {error ||
                "This trade room does not exist or you do not have permission to view it."}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Campus Feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentUserId = routing.user?.id;
  const isRequester = trade.requester_id === currentUserId;
  const partner = isRequester ? trade.fulfiller : trade.requester;
  const isNeedCash = trade.request_type === "NEED_CASH";

  const partnerName = partner?.full_name || "Verified Student";
  const partnerDept = partner?.department || "Campus Student";
  const partnerYear = partner?.year_of_study
    ? `Year ${partner.year_of_study}`
    : "Enrolled";
  const partnerRating = Number(partner?.rating_avg || 5.0).toFixed(1);
  const partnerTrades = partner?.total_trades || 0;

  // Format creation timestamp
  const startedAt = new Date(trade.started_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

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

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Matched
            </span>
          </div>
        </div>
      </header>

      {/* Main Trade Content */}
      <main className="max-w-4xl mx-auto px-6 pt-8 space-y-6">
        {/* Status Banner */}
        <div className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100/70 text-emerald-800 border border-emerald-200">
                Matched — arrange your meetup
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
              You are matched with a verified student. Coordinate meetup and complete
              the physical cash ↔ UPI swap directly.
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
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md shadow-blue-500/10">
                {partnerName.charAt(0).toUpperCase()}
              </div>

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
              Student UPI IDs are kept secure and private until the upcoming payment
              confirmation step.
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
                    Campus: Vishnu Educational Society
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

        {/* Milestone 6 Preview: Realtime Trade Chat (Placeholder) */}
        <div className="p-8 bg-white rounded-3xl border border-zinc-200/90 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-500 border border-zinc-200 flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6 text-zinc-600" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" />
              Realtime Chat: Milestone 6
            </div>
            <h3 className="text-lg font-bold text-zinc-950">
              Private In-Trade Chat Coming Next
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              In Milestone 6, you and {partnerName} will be able to exchange live,
              encrypted instant messages to coordinate exact timing, landmarks, and
              confirmations right here.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Campus Feed
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
