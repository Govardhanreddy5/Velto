"use client";

import * as React from "react";
import { useState } from "react";
import { TradeRating } from "@/types/database";
import { submitTradeRatingAction } from "@/lib/trades/actions";
import { Star, CheckCircle2, AlertCircle, Loader2, HeartHandshake } from "lucide-react";

interface TradeRatingCardProps {
  tradeId: string;
  partnerName: string;
  initialRating: TradeRating | null;
}

export function TradeRatingCard({
  tradeId,
  partnerName,
  initialRating,
}: TradeRatingCardProps) {
  const [existingRating, setExistingRating] = useState<TradeRating | null>(initialRating);
  const [selectedStars, setSelectedStars] = useState<number>(0);
  const [hoverStars, setHoverStars] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStars < 1 || selectedStars > 5) {
      setErrorMessage("Please select a star rating between 1 and 5.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitTradeRatingAction(tradeId, selectedStars, comment);

      if (!res.success) {
        setErrorMessage(res.error || "Failed to submit rating.");
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage("Thank you! Your feedback helps keep our campus marketplace safe.");
      setExistingRating({
        id: res.ratingId || "new",
        trade_id: tradeId,
        reviewer_id: "",
        reviewed_id: "",
        rating: selectedStars,
        comment: comment.trim() || null,
        created_at: new Date().toISOString(),
      });
    } catch {
      setErrorMessage("Network error submitting rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If already rated: Display Read-Only Rating Card
  if (existingRating) {
    return (
      <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 border border-amber-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
            </span>
            <h3 className="text-sm font-bold text-zinc-950">
              Your Review for {partnerName}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Review Submitted
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-5 h-5 ${
                star <= existingRating.rating
                  ? "fill-amber-400 text-amber-500"
                  : "text-zinc-300"
              }`}
            />
          ))}
          <span className="ml-2 text-xs font-bold text-zinc-900 font-mono">
            {existingRating.rating}.0 / 5.0
          </span>
        </div>

        {existingRating.comment && (
          <p className="p-3 rounded-xl bg-white/80 border border-amber-100 text-xs text-zinc-700 italic leading-relaxed">
            &ldquo;{existingRating.comment}&rdquo;
          </p>
        )}

        <p className="text-[11px] text-zinc-500 pt-1">
          Your feedback strengthens campus trust and partner reputation.
        </p>
      </div>
    );
  }

  // Not yet rated: Interactive Rating Form
  return (
    <div className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-950">
              Rate Your Trade Experience
            </h3>
            <p className="text-xs text-zinc-500">
              How was your peer swap with {partnerName}?
            </p>
          </div>
        </div>

        <span className="text-[11px] font-semibold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">
          Milestone 8
        </span>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Star Rating Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Rating Score (1 to 5 Stars)
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = (hoverStars || selectedStars) >= star;
              return (
                <button
                  type="button"
                  key={star}
                  onClick={() => setSelectedStars(star)}
                  onMouseEnter={() => setHoverStars(star)}
                  onMouseLeave={() => setHoverStars(0)}
                  className="p-1 rounded-lg transition-transform hover:scale-110 active:scale-95 focus:outline-none cursor-pointer"
                  title={`${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      active
                        ? "fill-amber-400 text-amber-500"
                        : "text-zinc-300 hover:text-amber-300"
                    }`}
                  />
                </button>
              );
            })}
            <span className="ml-2 text-xs font-bold text-zinc-700">
              {selectedStars === 5
                ? "Excellent (5 Stars)"
                : selectedStars === 4
                ? "Great (4 Stars)"
                : selectedStars === 3
                ? "Good (3 Stars)"
                : selectedStars === 2
                ? "Fair (2 Stars)"
                : selectedStars === 1
                ? "Poor (1 Star)"
                : "Select stars"}
            </span>
          </div>
        </div>

        {/* Optional Comment */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Optional Feedback (Max 500 Chars)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={`Add a quick note about punctuality or ease of exchange with ${partnerName}...`}
            className="w-full text-xs p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-950 placeholder-zinc-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all resize-none"
          />
          <div className="text-right text-[10px] text-zinc-400">
            {comment.length}/500
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={selectedStars < 1 || isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-amber-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting Review...
              </>
            ) : (
              <>
                <Star className="w-4 h-4 fill-white" />
                Submit Partner Review
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
