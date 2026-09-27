"use client";

import * as React from "react";
import { useState } from "react";
import { signUpAction } from "@/lib/auth/actions";
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

  // Live validation detection for college email
  const emailValidation = React.useMemo(() => {
    if (!email) return null;
    return validateCollegeEmail(email);
  }, [email]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
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
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-xs text-zinc-500">
            Click the link in the email to activate your Velto peer profile.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSwitchToSignIn}
          >
            Go to Sign In
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

      {/* College Email Input */}
      <div className="space-y-1.5">
        <Input
          type="email"
          label="College Email ID"
          placeholder="e.g. 24pa1a1210@vishnu.edu.in"
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
        By creating an account, you verify that you are a currently enrolled student with access to your institutional college email.
      </p>
    </form>
  );
}
