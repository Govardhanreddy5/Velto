"use client";

import * as React from "react";
import { useState } from "react";
import { signInAction } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GraduationCap, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    if (!email || !password) {
      setServerError("Please enter both your college email and password.");
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("collegeEmail", email);
      formData.append("password", password);

      const response = await signInAction(formData);

      if (!response.success) {
        setServerError(response.message);
      } else {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/dashboard");
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

      {/* College Email Input */}
      <Input
        type="email"
        label="College Email ID"
        placeholder="e.g. 24pa1a1210@vishnu.edu.in"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<GraduationCap className="w-4 h-4" />}
        autoComplete="email"
        required
      />

      {/* Password Input */}
      <Input
        type={showPassword ? "text" : "password"}
        label="Password"
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
        <Button type="submit" isLoading={isLoading} className="w-full">
          Sign In to Velto
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>

      <p className="text-[11px] text-zinc-500 text-center pt-2 leading-relaxed">
        Only verified institutional college emails can access Velto peer-to-peer campus trades.
      </p>
    </form>
  );
}
