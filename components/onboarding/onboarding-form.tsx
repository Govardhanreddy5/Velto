"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction } from "@/lib/profile/actions";
import { validateOnboardingData } from "@/lib/profile/validation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User,
  GraduationCap,
  CreditCard,
  Lock,
  AlertCircle,
  CheckCircle2,
  Building,
  ArrowRight,
} from "lucide-react";
import { Profile } from "@/types/database";

interface OnboardingFormProps {
  initialProfile: Partial<Profile> | null;
  userEmail: string;
}

const DEPARTMENTS = [
  "Computer Science & Engineering (CSE)",
  "Information Technology (IT)",
  "Artificial Intelligence & Data Science (AI&DS)",
  "Artificial Intelligence & Machine Learning (AI&ML)",
  "Electronics & Communication Engineering (ECE)",
  "Electrical & Electronics Engineering (EEE)",
  "Mechanical Engineering (MECH)",
  "Civil Engineering (CIVIL)",
  "Computer Science & Business Systems (CSBS)",
  "Master of Computer Applications (MCA)",
  "Master of Business Administration (MBA)",
  "Other Department",
];

export function OnboardingForm({
  initialProfile,
  userEmail,
}: OnboardingFormProps) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initialProfile?.full_name || "");
  const [department, setDepartment] = useState(
    initialProfile?.department || DEPARTMENTS[0]
  );
  const [yearOfStudy, setYearOfStudy] = useState<number>(
    initialProfile?.year_of_study || 1
  );
  const [upiId, setUpiId] = useState(initialProfile?.upi_id || "");

  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const rollNumber =
    initialProfile?.roll_number ||
    userEmail.split("@")[0].toUpperCase();
  const campus = initialProfile?.campus || "Vishnu Educational Society";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    // Client-side validation check
    const validation = validateOnboardingData({
      fullName,
      department,
      yearOfStudy,
      upiId,
    });

    if (!validation.isValid) {
      setClientErrors(validation.errors);
      return;
    }

    setClientErrors({});
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("fullName", fullName);
      formData.append("department", department);
      formData.append("yearOfStudy", yearOfStudy.toString());
      formData.append("upiId", upiId);

      const result = await completeOnboardingAction(formData);

      if (!result.success) {
        if (result.errors) {
          setClientErrors(result.errors);
        }
        setServerError(result.message);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {serverError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="space-y-1">
            <p className="font-semibold">Setup Error</p>
            <p className="leading-relaxed">{serverError}</p>
          </div>
        </div>
      )}

      {/* Read-Only Pre-Verified Student Details */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Verified Campus Identity
          </span>
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3" />
            Verified
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 block">Student Roll No:</span>
            <span className="font-mono font-bold text-zinc-900 text-sm">
              {rollNumber}
            </span>
          </div>

          <div>
            <span className="text-zinc-500 block">College Email:</span>
            <span className="font-medium text-zinc-800 break-all">
              {userEmail}
            </span>
          </div>

          <div className="sm:col-span-2">
            <span className="text-zinc-500 block">Campus:</span>
            <span className="font-medium text-zinc-800 flex items-center gap-1.5 mt-0.5">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              {campus}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 italic border-t border-zinc-200/60 pt-2">
          Note: Roll number, email, and campus are permanently locked to your
          institutional login.
        </p>
      </div>

      {/* Full Name */}
      <Input
        type="text"
        label="Full Name"
        placeholder="e.g. Govardhan Reddy"
        value={fullName}
        onChange={(e) => {
          setFullName(e.target.value);
          if (clientErrors.fullName) {
            setClientErrors((prev) => ({ ...prev, fullName: "" }));
          }
        }}
        error={clientErrors.fullName}
        icon={<User className="w-4 h-4" />}
        hint="Used to identify you to campus trade partners."
        required
      />

      {/* Department Dropdown */}
      <div className="space-y-1.5 text-left">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Department / Branch
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-3 text-zinc-400 pointer-events-none">
            <GraduationCap className="w-4 h-4" />
          </div>
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              if (clientErrors.department) {
                setClientErrors((prev) => ({ ...prev, department: "" }));
              }
            }}
            className="w-full rounded-lg bg-white border border-zinc-300 text-zinc-900 text-sm py-2.5 pl-10 pr-4 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all appearance-none cursor-pointer"
          >
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
        {clientErrors.department && (
          <p className="text-xs text-rose-600 font-medium">
            • {clientErrors.department}
          </p>
        )}
      </div>

      {/* Year of Study */}
      <div className="space-y-2 text-left">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Year of Study
        </label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => {
                setYearOfStudy(year);
                if (clientErrors.yearOfStudy) {
                  setClientErrors((prev) => ({ ...prev, yearOfStudy: "" }));
                }
              }}
              className={`py-2 text-center text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                yearOfStudy === year
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              Year {year}
            </button>
          ))}
        </div>
        {clientErrors.yearOfStudy && (
          <p className="text-xs text-rose-600 font-medium">
            • {clientErrors.yearOfStudy}
          </p>
        )}
      </div>

      {/* UPI ID */}
      <div className="space-y-2">
        <Input
          type="text"
          label="Your UPI ID (For Digital Settlements)"
          placeholder="e.g. yourname@okaxis or 9876543210@paytm"
          value={upiId}
          onChange={(e) => {
            setUpiId(e.target.value);
            if (clientErrors.upiId) {
              setClientErrors((prev) => ({ ...prev, upiId: "" }));
            }
          }}
          error={clientErrors.upiId}
          icon={<CreditCard className="w-4 h-4" />}
          autoCapitalize="none"
          autoCorrect="off"
          required
        />

        {/* Privacy badge for UPI ID */}
        <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-100 flex items-start gap-2.5 text-left">
          <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            <strong className="text-blue-900 font-semibold">
              Private & Secure:
            </strong>{" "}
            Your UPI ID is never displayed in the public feed or profile. It is
            only shared securely with your trade partner inside an active trade
            room to facilitate payment.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10 py-3"
        >
          Complete Profile & Enter Campus Feed
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </form>
  );
}
