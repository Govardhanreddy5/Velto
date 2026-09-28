import { checkUserRouting } from "@/lib/profile/actions";
import { getTradeById, getTradeMessages, getTradeRatingForUser } from "@/lib/trades/actions";
import { getUserReportsForTrade } from "@/lib/reports/actions";
import { TradeRoomClient } from "@/components/trades/trade-room-client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
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

  const [{ trade, error }, { messages }, userRating, userReports] = await Promise.all([
    getTradeById(tradeId),
    getTradeMessages(tradeId),
    getTradeRatingForUser(tradeId),
    getUserReportsForTrade(tradeId),
  ]);

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

  return (
    <TradeRoomClient
      initialTrade={trade}
      initialMessages={messages}
      currentUserId={routing.user!.id}
      userRating={userRating}
      userReports={userReports}
    />
  );
}
