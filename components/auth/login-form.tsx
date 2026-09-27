"use client";

import * as React from "react";
import { useState } from "react";
import { signInAction } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GraduationCap, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  onSuccess?: () => void;
  isAdminMode?: boolean;
  onSwitchToAdmin?: () => void;
  onSwitchToStudent?: () => void;
}

export function LoginForm({
  onSuccess,
  isAdminMode = false,
  onSwitchToAdmin,
  onSwitchToStudent,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(isAdminMode ? "govardhan0477@gmail.com" : "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setServerError("Please enter both your email address and password.");
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("collegeEmail", trimmedEmail);
      formData.append("password", password);

      const response = await signInAction(formData);

      if (!response.success) {
        setServerError(response.message);
      } else {
        if (onSuccess) {
          onSuccess();
        } else {
          // If admin email, redirect straight to admin moderation console
          if (trimmedEmail.toLowerCase() === "govardhan0477@gmail.com") {
            router.push("/admin");
          } else {
            router.push("/dashboard");
          }
          router.refresh();
        }
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2 text-left">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Email Input */}
      <Input
        type="email"
        label={isAdminMode ? "Administrator Email" : "College Email ID"}
        placeholder={isAdminMode ? "govardhan0477@gmail.com" : "example@vishnu.edu.in"}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={isAdminMode ? <Shield className="w-4 h-4 text-rose-400" /> : <GraduationCap className="w-4 h-4" />}
        autoComplete="email"
        required
      />

      {/* Password Input */}
      <Input
        type={showPassword ? "text" : "password"}
        label={isAdminMode ? "Administrator Password" : "Password"}
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        icon={<Lock className="w-4 h-4" />}
        autoComplete="current-password"
        endAdornment={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-zinc-500 hover:text-zinc-300 focus:outline-none cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
        required
      />

      <div className="pt-2">
        <Button
          type="submit"
          isLoading={isLoading}
          className={`w-full ${
            isAdminMode
              ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isAdminMode ? (
            <>
              <Shield className="w-4 h-4 mr-1.5" />
              Authorize & Enter Admin Console
            </>
          ) : (
            <>
              Sign In to Velto
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </>
          )}
        </Button>
      </div>

      {isAdminMode ? (
        <div className="pt-2 text-center">
          <p className="text-[11px] text-zinc-500">
            Designated master admin account for campus moderation.
          </p>
          {onSwitchToStudent && (
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="mt-2 text-xs text-blue-400 hover:underline cursor-pointer"
            >
              ← Back to Student Login
            </button>
          )}
        </div>
      ) : (
        <div className="pt-2 text-center space-y-1">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Only verified institutional college emails can access Velto peer-to-peer campus trades.
          </p>
          {onSwitchToAdmin && (
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="text-xs text-zinc-400 hover:text-rose-400 flex items-center justify-center gap-1 mx-auto transition-colors cursor-pointer pt-1"
            >
              <Shield className="w-3.5 h-3.5 text-rose-500" />
              <span>Campus Administrator Login</span>
            </button>
          )}
        </div>
      )}
    </form>
  );
}
