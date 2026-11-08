"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRequestAction } from "@/lib/requests/actions";
import { validateCreateRequestData } from "@/lib/requests/validation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RequestType } from "@/types/database";
import {
  Banknote,
  Smartphone,
  MapPin,
  Clock,
  FileText,
  AlertCircle,
  ArrowRight,
  Info,
} from "lucide-react";

interface CreateRequestFormProps {
  initialType?: RequestType;
  campusName: string;
}

const QUICK_AMOUNTS = [50, 100, 200, 500];
const LOCATION_SUGGESTIONS = [
  "College Canteen",
  "Central Library",
  "Campus Main Gate",
  "Hostel Block",
  "Cafeteria",
  "Auditorium",
];
const EXPIRY_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min (Recommended)", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
];

export function CreateRequestForm({
  initialType = "NEED_CASH",
  campusName,
}: CreateRequestFormProps) {
  const router = useRouter();

  const [requestType, setRequestType] = useState<RequestType>(initialType);
  const [amount, setAmount] = useState<string>("100");
  const [location, setLocation] = useState<string>("");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(30);
  const [note, setNote] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const isNeedCash = requestType === "NEED_CASH";
  const numericAmount = parseFloat(amount) || 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    const validation = validateCreateRequestData({
      requestType,
      amount,
      location,
      expiryMinutes,
      note,
    });

    if (!validation.isValid) {
      setClientErrors(validation.errors);
      return;
    }

    setClientErrors({});
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("requestType", requestType);
      formData.append("amount", amount);
      formData.append("location", location);
      formData.append("expiryMinutes", expiryMinutes.toString());
      if (note) formData.append("note", note);

      const result = await createRequestAction(formData);

      if (!result.success) {
        if (result.errors) setClientErrors(result.errors);
        setServerError(result.message);
      } else {
        router.push("/feed");
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
          <p className="leading-relaxed font-medium">{serverError}</p>
        </div>
      )}

      {/* 1. Request Type Segmented Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          What do you need?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option: Need Cash */}
          <button
            type="button"
            onClick={() => {
              setRequestType("NEED_CASH");
              if (clientErrors.requestType) {
                setClientErrors((p) => ({ ...p, requestType: "" }));
              }
            }}
            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              isNeedCash
                ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm"
                : "bg-white border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isNeedCash
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              <Banknote className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-bold text-sm text-zinc-950">
                I Need Cash
              </h4>
              <p className="text-xs text-zinc-500 leading-normal">
                Receive physical cash & pay student via UPI.
              </p>
            </div>
          </button>

          {/* Option: Have Cash -> Want UPI */}
          <button
            type="button"
            onClick={() => {
              setRequestType("HAVE_CASH_WANT_UPI");
              if (clientErrors.requestType) {
                setClientErrors((p) => ({ ...p, requestType: "" }));
              }
            }}
            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              !isNeedCash
                ? "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                : "bg-white border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                !isNeedCash
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-bold text-sm text-zinc-950">
                Have Cash → Want UPI
              </h4>
              <p className="text-xs text-zinc-500 leading-normal">
                Give physical cash & receive UPI into your bank.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Amount Input & Quick Presets */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Exchange Amount (₹20 to ₹500)
        </label>

        {/* Quick Amount Buttons */}
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                setAmount(val.toString());
                if (clientErrors.amount) {
                  setClientErrors((p) => ({ ...p, amount: "" }));
                }
              }}
              className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                amount === val.toString()
                  ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              ₹{val}
            </button>
          ))}
        </div>

        {/* Custom Input */}
        <div className="relative">
          <span className="absolute left-3.5 top-2.5 text-zinc-400 font-semibold text-sm">
            ₹
          </span>
          <input
            type="number"
            min={20}
            max={500}
            step="1"
            placeholder="Enter amount between 20 and 500"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (clientErrors.amount) {
                setClientErrors((p) => ({ ...p, amount: "" }));
              }
            }}
            className={`w-full rounded-lg bg-white border text-zinc-900 text-sm py-2.5 pl-8 pr-4 outline-none focus:ring-2 transition-all ${
              clientErrors.amount
                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-zinc-300 focus:border-blue-600 focus:ring-blue-600/20"
            }`}
          />
        </div>
        {clientErrors.amount && (
          <p className="text-xs text-rose-600 font-medium">
            • {clientErrors.amount}
          </p>
        )}
      </div>

      {/* 3. Campus Meetup Location */}
      <div className="space-y-2">
        <Input
          type="text"
          label="Campus Meetup Spot"
          placeholder="e.g. Near Canteen counter, Library entrance"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            if (clientErrors.location) {
              setClientErrors((p) => ({ ...p, location: "" }));
            }
          }}
          error={clientErrors.location}
          icon={<MapPin className="w-4 h-4" />}
          hint={`Meetup must be inside ${campusName}.`}
          required
        />

        {/* Location Suggestions */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {LOCATION_SUGGESTIONS.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setLocation(loc);
                if (clientErrors.location) {
                  setClientErrors((p) => ({ ...p, location: "" }));
                }
              }}
              className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              + {loc}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Expiry Duration */}
      <div className="space-y-2 text-left">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          Request Expiry Duration
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setExpiryMinutes(opt.value)}
              className={`py-2 px-2 text-center text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                expiryMinutes === opt.value
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">
          Unaccepted requests automatically expire after this period to keep the feed fresh.
        </p>
      </div>

      {/* 5. Optional Note */}
      <div className="space-y-1.5 text-left">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-zinc-400" />
          Optional Note / Appearance Hint
        </label>
        <textarea
          rows={2}
          maxLength={300}
          placeholder="e.g. Wearing a blue hoodie near the Nescafe stall."
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (clientErrors.note) {
              setClientErrors((p) => ({ ...p, note: "" }));
            }
          }}
          className="w-full rounded-lg bg-white border border-zinc-300 text-zinc-900 text-sm p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all placeholder-zinc-400 resize-none"
        />
        {clientErrors.note && (
          <p className="text-xs text-rose-600 font-medium">• {clientErrors.note}</p>
        )}
      </div>

      {/* 6. Live Plain-Language Preview */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-zinc-900">Feed Preview for Peers:</p>
          <p className="text-zinc-600">
            {isNeedCash ? (
              <>
                <strong>Needs ₹{numericAmount || "___"} cash</strong> — pays by UPI
                {location ? ` near ${location}` : ""}
              </>
            ) : (
              <>
                <strong>Has ₹{numericAmount || "___"} cash</strong> — wants UPI
                {location ? ` near ${location}` : ""}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10 py-3"
        >
          Post Request to Campus Feed
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </form>
  );
}
