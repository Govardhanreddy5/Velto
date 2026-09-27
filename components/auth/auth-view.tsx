"use client";

import * as React from "react";
import { useState } from "react";
import { SignUpForm } from "./signup-form";
import { LoginForm } from "./login-form";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function AuthView() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Back to home */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Velto
        </Link>
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3" />
          Campus Verified
        </span>
      </div>

      {/* Main Auth Card */}
      <div className="relative rounded-2xl bg-zinc-900/90 border border-zinc-800 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Glow ambient background */}
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative text-center space-y-2 mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {mode === "signup" ? "Create Student Account" : "Welcome Back"}
          </h1>
          <p className="text-xs text-zinc-400">
            {mode === "signup"
              ? "Join your campus P2P cash ↔ UPI peer exchange network."
              : "Access your campus trade requests and wallet."}
          </p>
        </div>

        {/* Tab Toggle Switch */}
        <div className="relative grid grid-cols-2 p-1 mb-6 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`py-2 rounded-md transition-all cursor-pointer ${
              mode === "signup"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`py-2 rounded-md transition-all cursor-pointer ${
              mode === "signin"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Dynamic Form View */}
        <div className="relative">
          {mode === "signup" ? (
            <SignUpForm onSwitchToSignIn={() => setMode("signin")} />
          ) : (
            <LoginForm />
          )}
        </div>

        {/* Footer switch prompt */}
        <div className="relative mt-6 pt-5 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
          {mode === "signup" ? (
            <p>
              Already registered with your college email?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="text-emerald-400 hover:underline font-semibold cursor-pointer"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              New to campus Velto?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-emerald-400 hover:underline font-semibold cursor-pointer"
              >
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
