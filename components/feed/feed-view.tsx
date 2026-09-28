"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExchangeRequest, RequestType } from "@/types/database";
import { RequestCard } from "./request-card";
import { AcceptModal } from "./accept-modal";
import { cancelRequestAction } from "@/lib/requests/actions";
import { createClient } from "@/lib/supabase/client";
import {
  PlusCircle,
  Sparkles,
  Inbox,
  Filter,
} from "lucide-react";

interface FeedViewProps {
  initialFeedRequests: ExchangeRequest[];
  initialMyRequests: ExchangeRequest[];
  campus: string;
  currentUserId: string;
}

export function FeedView({
  initialFeedRequests,
  initialMyRequests,
  campus,
  currentUserId,
}: FeedViewProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"feed" | "my">("feed");
  const [filterType, setFilterType] = useState<"ALL" | RequestType>("ALL");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [acceptTargetRequest, setAcceptTargetRequest] = useState<ExchangeRequest | null>(null);
  const [now, setNow] = useState<number>(0);

  // Periodically update time to auto-filter expired requests from view
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime Subscription for live updates
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("feed_exchange_requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exchange_requests",
        },
        () => {
          // Re-fetch server data without manual full-page reload
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Filter public feed requests:
  // 1. Must be OPEN
  // 2. Must not be expired
  const visibleFeedRequests = useMemo(() => {
    return initialFeedRequests.filter((r) => {
      const isUnexpired = now === 0 ? true : new Date(r.expires_at).getTime() > now;
      const isOpen = r.status === "OPEN";
      const matchesFilter =
        filterType === "ALL" || r.request_type === filterType;

      return isUnexpired && isOpen && matchesFilter;
    });
  }, [initialFeedRequests, now, filterType]);

  const visibleMyRequests = useMemo(() => {
    if (filterType === "ALL") return initialMyRequests;
    return initialMyRequests.filter((r) => r.request_type === filterType);
  }, [initialMyRequests, filterType]);

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this request?")) return;
    setCancellingId(id);
    try {
      await cancelRequestAction(id);
      router.refresh();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200/90 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
              Campus Exchange Feed
            </h1>
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Active peer-to-peer cash ↔ UPI requests across{" "}
            <strong className="text-zinc-800">Vishnu & SVECW Community</strong>
          </p>
        </div>

        <Link
          href="/requests/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/10"
        >
          <PlusCircle className="w-4 h-4" />
          Create Request
        </Link>
      </div>

      {/* Tabs & Type Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Main Tabs */}
        <div className="inline-flex p-1 rounded-xl bg-zinc-200/70 border border-zinc-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === "feed"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Campus Feed ({visibleFeedRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === "my"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            My Requests ({initialMyRequests.length})
          </button>
        </div>

        {/* Category Filters */}
        <div className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-zinc-400 flex items-center gap-1 text-[11px] mr-1">
            <Filter className="w-3 h-3" />
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setFilterType("ALL")}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              filterType === "ALL"
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType("NEED_CASH")}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              filterType === "NEED_CASH"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            Need Cash
          </button>
          <button
            type="button"
            onClick={() => setFilterType("HAVE_CASH_WANT_UPI")}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              filterType === "HAVE_CASH_WANT_UPI"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            Have Cash
          </button>
        </div>
      </div>

      {/* Requests Feed Grid */}
      {activeTab === "feed" ? (
        visibleFeedRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleFeedRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isOwner={req.requester_id === currentUserId}
                onCancel={handleCancel}
                onAccept={setAcceptTargetRequest}
                isCancelling={cancellingId === req.id}
              />
            ))}
          </div>
        ) : (
          /* Empty State for Public Feed */
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-12 text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-zinc-900">
                No active requests right now
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No peers have open cash requests at {campus} right now. Need cash
                or have cash to exchange?
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Post the First Request
              </Link>
            </div>
          </div>
        )
      ) : (
        /* My Requests Tab */
        visibleMyRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleMyRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isOwner={true}
                onCancel={handleCancel}
                isCancelling={cancellingId === req.id}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-12 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
              <Inbox className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-zinc-900">
                You haven&apos;t posted any requests yet
              </h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                When you post cash requests, they will appear here along with their
                matching status.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Create New Request
              </Link>
            </div>
          </div>
        )
      )}

      {/* Confirmation & Acceptance Modal */}
      <AcceptModal
        request={acceptTargetRequest}
        isOpen={!!acceptTargetRequest}
        onClose={() => setAcceptTargetRequest(null)}
      />
    </div>
  );
}
