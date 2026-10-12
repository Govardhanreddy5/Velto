"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X, Share2, PlusSquare, Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Standalone Store
function subscribeStandalone(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getStandaloneSnapshot() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(
      (window.navigator as unknown as { standalone?: boolean }).standalone
    ) ||
    document.referrer.includes("android-app://")
  );
}

function getStandaloneServerSnapshot() {
  return false;
}

// iOS Store
function subscribeIos() {
  return () => {};
}

function getIosSnapshot() {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIosDevice =
    /iphone|ipad|ipod/.test(ua) &&
    !(window.navigator as unknown as { standalone?: boolean }).standalone;
  return isIosDevice;
}

function getIosServerSnapshot() {
  return false;
}

export function InstallPrompt() {
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );

  const isIos = useSyncExternalStore(
    subscribeIos,
    getIosSnapshot,
    getIosServerSnapshot
  );

  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [showIosModal, setShowIosModal] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // If running in standalone mode, do nothing
    if (isStandalone) {
      return;
    }

    // Check if dismissed for current session
    const dismissedSession = sessionStorage.getItem("velto_pwa_dismissed");
    if (!dismissedSession) {
      // Delay showing the prompt so it's not jarring immediately on load
      const timer = setTimeout(() => {
        setIsDismissed(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isStandalone]);

  useEffect(() => {
    // Listen for beforeinstallprompt event on Chrome/Edge/Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissedSession = sessionStorage.getItem("velto_pwa_dismissed");
      if (!dismissedSession) {
        setIsDismissed(false);
      }
    };

    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setDeferredPrompt(null);
      setTimeout(() => {
        setIsDismissed(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosModal(true);
      return;
    }

    if (!deferredPrompt) {
      setShowIosModal(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setInstalledSuccess(true);
        setDeferredPrompt(null);
      } else {
        handleDismiss();
      }
    } catch (err) {
      console.warn("PWA install error:", err);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem("velto_pwa_dismissed", "true");
    } catch {
      // Ignore storage restrictions
    }
  };

  // If already running in standalone mode, do not show any prompt
  if (isStandalone) {
    return null;
  }

  // If dismissed and no iOS modal open
  if (isDismissed && !showIosModal) {
    if (!deferredPrompt && !isIos) return null;

    return (
      <button
        onClick={() => {
          setIsDismissed(false);
          if (isIos) setShowIosModal(true);
        }}
        id="pwa-install-mini-trigger"
        aria-label="Install Velto App"
        className="fixed bottom-4 right-4 z-40 bg-white/95 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 shadow-md rounded-full px-3.5 py-2 flex items-center gap-2 text-xs font-semibold backdrop-blur-sm transition-all hover:scale-105 active:scale-95"
      >
        <Download className="w-3.5 h-3.5 text-blue-600" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  return (
    <>
      {/* Subtle floating install banner */}
      {!isDismissed && (
        <aside
          role="region"
          aria-label="App installation banner"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-white/95 backdrop-blur-md border border-zinc-200/90 rounded-2xl shadow-xl p-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
        >
          <div className="flex items-start gap-3.5">
            {/* App Icon */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm border border-white/20">
              <span className="font-extrabold text-lg tracking-tight">V</span>
            </div>

            {/* Description */}
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h2 className="text-sm font-bold text-zinc-950 truncate">
                  Install Velto
                </h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  App
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-snug line-clamp-2">
                Fast campus cash ↔ UPI swaps from your home screen.
              </p>
            </div>

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss installation prompt"
              className="absolute top-3.5 right-3.5 text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Row */}
          <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400 hidden xs:inline">
              Instant launch &bull; Safe &amp; verified
            </span>
            <div className="flex items-center gap-2 w-full xs:w-auto justify-end">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Not now
              </button>
              <Button
                onClick={handleInstallClick}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-1.5 h-auto rounded-xl shadow-xs inline-flex items-center gap-1.5"
              >
                {installedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    Installed
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-white" />
                    Install
                  </>
                )}
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* iOS & Desktop Safari Instructions Modal */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
        >
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  V
                </div>
                <h3 id="ios-install-title" className="font-bold text-base text-zinc-950">
                  Install on {isIos ? "iPhone / iPad" : "Browser"}
                </h3>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 mb-5 leading-relaxed">
              Add Velto to your device home screen for quick access during campus
              trades:
            </p>

            <div className="space-y-3.5 text-xs text-zinc-700">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold block text-zinc-900">
                    Step 1
                  </span>
                  Tap the <strong className="text-blue-600">Share</strong> button
                  in Safari&apos;s navigation bar.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold block text-zinc-900">
                    Step 2
                  </span>
                  Scroll down and tap{" "}
                  <strong className="text-zinc-950">
                    Add to Home Screen
                  </strong>
                  .
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold block text-zinc-900">
                    Step 3
                  </span>
                  Tap <strong className="text-blue-600">Add</strong> in the top
                  right corner.
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowIosModal(false)}
              className="w-full mt-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
