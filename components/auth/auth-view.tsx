"use client";

import * as React from "react";
import { useState } from "react";
import { SignUpForm } from "./signup-form";
import { LoginForm } from "./login-form";
import { ShieldCheck, ArrowLeft, Shield, Clock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function AuthView() {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const reason = searchParams.get("reason");
  const isSessionExpired = reason === "session_expired";

  const initialMode: "signup" | "signin" | "admin" =
    requestedMode === "admin"
      ? "admin"
      : requestedMode === "signin" || isSessionExpired
      ? "signin"
      : "signup";

  const [mode, setMode] = useState<"signup" | "signin" | "admin">(initialMode);

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
        <span
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
            mode === "admin"
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          }`}
        >
          {mode === "admin" ? (
            <>
              <Shield className="w-3 h-3 text-rose-500" />
              Admin Portal
            </>
          ) : (
            <>
              <ShieldCheck className="w-3 h-3" />
              Campus Verified
            </>
          )}
        </span>
      </div>

      {/* Main Auth Card */}
      <div className="relative rounded-2xl bg-zinc-900/90 border border-zinc-800 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Glow ambient background */}
        <div
          className={`absolute -top-12 -left-12 w-40 h-40 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
            mode === "admin" ? "bg-rose-500/15" : "bg-emerald-500/10"
          }`}
        />
        <div
          className={`absolute -bottom-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
            mode === "admin" ? "bg-amber-500/10" : "bg-cyan-500/10"
          }`}
        />

        {/* Header */}
        <div className="relative text-center space-y-2 mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {mode === "signup"
              ? "Create Student Account"
              : mode === "signin"
              ? "Student Sign In"
              : "Administrator Portal"}
          </h1>
          <p className="text-xs text-zinc-400">
            {mode === "signup"
              ? "Join your campus P2P cash ↔ UPI peer exchange network."
              : mode === "signin"
              ? "Access your campus trade requests and wallet."
              : "Restricted platform administrator login."}
          </p>
        </div>

        {/* Expired Session Graceful Banner */}
        {isSessionExpired && mode === "signin" && (
          <div className="relative mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5 text-left">
            <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-200">Session Expired</p>
              <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                Your previous student session has expired for your account security. Please sign in to resume your campus activities.
              </p>
            </div>
          </div>
        )}

        {/* Tab Toggle Switch */}
        <div className="relative grid grid-cols-3 p-1 mb-6 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-semibold">
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
            Student
          </button>
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`py-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
              mode === "admin"
                ? "bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-sm"
                : "text-zinc-400 hover:text-rose-400"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-rose-500" />
            Admin
          </button>
        </div>

        {/* Dynamic Form View */}
        <div className="relative">
          {mode === "signup" && (
            <SignUpForm onSwitchToSignIn={() => setMode("signin")} />
          )}
          {mode === "signin" && (
            <LoginForm onSwitchToAdmin={() => setMode("admin")} />
          )}
          {mode === "admin" && (
            <LoginForm
              isAdminMode
              onSwitchToStudent={() => setMode("signin")}
            />
          )}
        </div>

        {/* Footer switch prompt */}
        {mode !== "admin" && (
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
        )}
      </div>
    </div>
  );
}
