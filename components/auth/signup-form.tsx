"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { signUpAction, resendConfirmationEmailAction } from "@/lib/auth/actions";
import { validateCollegeEmail } from "@/lib/auth/validation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  MailCheck,
  Building2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { AuthResponse } from "@/types/auth";

interface SignUpFormProps {
  onSuccess?: (res: AuthResponse) => void;
  onSwitchToSignIn?: () => void;
}

export function SignUpForm({ onSuccess, onSwitchToSignIn }: SignUpFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [successResult, setSuccessResult] = useState<AuthResponse | null>(null);

  // Resend state & cooldown
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showUnconfirmedResendBanner, setShowUnconfirmedResendBanner] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Live validation detection for college email
  const emailValidation = React.useMemo(() => {
    if (!email) return null;
    return validateCollegeEmail(email);
  }, [email]);

  const handleResendConfirmation = async (targetEmail?: string) => {
    const emailToUse = (targetEmail || email).trim();
    if (!emailToUse) {
      setResendStatus({
        type: "error",
        message: "Please enter your college email address first.",
      });
      return;
    }

    setIsResending(true);
    setResendStatus(null);

    try {
      const res = await resendConfirmationEmailAction(emailToUse);
      if (res.success) {
        setResendStatus({
          type: "success",
          message: res.message,
        });
        setResendCooldown(60); // 60 seconds cooldown
      } else {
        setResendStatus({
          type: "error",
          message: res.message,
        });
      }
    } catch {
      setResendStatus({
        type: "error",
        message: "Failed to dispatch confirmation email. Please check your network.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setShowUnconfirmedResendBanner(false);
    setResendStatus(null);
    const errors: Record<string, string> = {};

    // Validate email
    const emailCheck = validateCollegeEmail(email);
    if (!emailCheck.isValid) {
      errors.email = emailCheck.error || "Invalid college email.";
    }

    // Validate password
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("collegeEmail", email);
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);

      const response = await signUpAction(formData);

      if (!response.success) {
        setServerError(response.message);
        if (response.data?.needsEmailConfirmation) {
          setShowUnconfirmedResendBanner(true);
        }
      } else {
        setSuccessResult(response);
        if (onSuccess) {
          onSuccess(response);
        }
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // If user completed sign up and email verification is needed
  if (successResult?.data?.requiresEmailVerification) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <MailCheck className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">Check Your College Inbox</h3>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            We sent a verification link to{" "}
            <span className="text-emerald-400 font-semibold">{email}</span>.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-left space-y-2 text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Student Roll No:</span>
            <span className="font-mono text-zinc-200 font-medium">
              {successResult.data.rollNumber}
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Status:</span>
            <span className="text-amber-400 font-medium">Pending Verification</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400 pt-1 border-t border-zinc-800 text-[11px]">
            <span>Tip:</span>
            <span className="text-zinc-400">Check Spam/Junk folder if not in primary inbox.</span>
          </div>
        </div>

        {/* Resend status feedback */}
        {resendStatus && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2 text-left ${
              resendStatus.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
            }`}
          >
            {resendStatus.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{resendStatus.message}</span>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isResending || resendCooldown > 0}
            onClick={() => handleResendConfirmation(email)}
            className="w-full text-xs flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
            {resendCooldown > 0
              ? `Resend available in ${resendCooldown}s`
              : isResending
              ? "Dispatching Email..."
              : "Resend Confirmation Email"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-zinc-400 hover:text-white text-xs"
            onClick={onSwitchToSignIn}
          >
            Already confirmed? Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2 text-left">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Unconfirmed user quick resend helper */}
      {showUnconfirmedResendBanner && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-2 text-left">
          <p className="font-semibold text-amber-200">
            Account already exists but awaiting verification?
          </p>
          <p className="text-[11px] text-amber-300/80">
            Click below to receive a fresh verification link in your college mailbox.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={isResending || resendCooldown > 0}
            onClick={() => handleResendConfirmation(email)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isResending ? "animate-spin" : ""}`} />
            {resendCooldown > 0
              ? `Resend cooldown: ${resendCooldown}s`
              : isResending
              ? "Dispatching..."
              : `Resend Link to ${email}`}
          </Button>
        </div>
      )}

      {resendStatus && (
        <div
          className={`p-3 rounded-lg text-xs flex items-start gap-2 text-left ${
            resendStatus.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
          }`}
        >
          {resendStatus.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{resendStatus.message}</span>
        </div>
      )}

      {/* College Email Input */}
      <div className="space-y-1.5">
        <Input
          type="email"
          label="College Email ID"
          placeholder="example@vishnu.edu.in or @svecw.edu.in"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (clientErrors.email) {
              setClientErrors((prev) => ({ ...prev, email: "" }));
            }
          }}
          error={clientErrors.email}
          icon={<GraduationCap className="w-4 h-4" />}
          autoComplete="email"
          required
        />

        {/* Live campus / roll number detector badge */}
        {emailValidation?.isValid && (
          <div className="flex items-center gap-2 pt-1 text-xs">
            <Badge variant="success">
              <CheckCircle2 className="w-3 h-3" />
              Roll No: {emailValidation.rollNumber}
            </Badge>
            {emailValidation.campusDomain && (
              <Badge variant="info">
                <Building2 className="w-3 h-3" />
                {emailValidation.campusDomain}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Password Input */}
      <Input
        type={showPassword ? "text" : "password"}
        label="Password"
        placeholder="At least 6 characters"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (clientErrors.password) {
            setClientErrors((prev) => ({ ...prev, password: "" }));
          }
        }}
        error={clientErrors.password}
        icon={<Lock className="w-4 h-4" />}
        autoComplete="new-password"
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

      {/* Confirm Password Input */}
      <Input
        type={showPassword ? "text" : "password"}
        label="Confirm Password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          if (clientErrors.confirmPassword) {
            setClientErrors((prev) => ({ ...prev, confirmPassword: "" }));
          }
        }}
        error={clientErrors.confirmPassword}
        icon={<Lock className="w-4 h-4" />}
        autoComplete="new-password"
        required
      />

      <div className="pt-2">
        <Button type="submit" isLoading={isLoading} className="w-full">
          Create Student Account
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>

      <p className="text-[11px] text-zinc-500 text-center pt-2 leading-relaxed">
        By creating an account, you verify that you are an enrolled student at Vishnu Educational Society (@vishnu.edu.in) or SVECW (@svecw.edu.in).
      </p>
    </form>
  );
}
