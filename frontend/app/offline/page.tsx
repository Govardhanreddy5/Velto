"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { WifiOff, RotateCcw, Home, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

export default function OfflinePage() {
  const [isRetrying, setIsRetrying] = useState(false);
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot
  );

  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
              Velto
            </span>
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Offline Mode
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center text-center">
        {/* Wifi Off Icon with soft glowing aura */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
            <WifiOff className="w-10 h-10 stroke-[2.2]" />
          </div>
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs font-bold border-2 border-white shadow-xs">
            !
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 mb-3">
          Internet Connection Needed
        </h1>

        <p className="text-zinc-600 text-sm leading-relaxed mb-6">
          Velto is a live peer-to-peer campus exchange. Viewing live requests,
          participating in trade chats, and verifying UPI transfers require an
          active internet connection to keep all student trades secure.
        </p>

        {isOnline && (
          <div className="w-full mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Internet restored! Reconnecting to Velto...
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col sm:flex-row gap-3 mb-8">
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all"
          >
            <RotateCcw
              className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Reconnecting..." : "Try Again"}
          </Button>

          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-semibold text-sm transition-all"
          >
            <Home className="w-4 h-4 text-zinc-500" />
            Go to Home
          </Link>
        </div>

        {/* Informational Card */}
        <div className="w-full text-left p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
            <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Why doesn&apos;t Velto work fully offline?</span>
          </div>
          <p className="text-xs text-zinc-500 leading-normal">
            To prevent double-spending and stale requests, trades and verification
            codes are synced in realtime with campus servers. Your private data,
            UPI IDs, and chat histories are never stored in unverified offline caches.
          </p>
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Check campus Wi-Fi or cellular data</span>
            <span className="font-mono">PWA v1.0</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-zinc-400 border-t border-zinc-200/60">
        <p>Velto &mdash; Campus Cash &harr; UPI Exchange Platform</p>
      </footer>
    </div>
  );
}
