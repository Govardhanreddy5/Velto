"use client";

import { useState, useRef, useTransition } from "react";
import { Camera, Check, UploadCloud, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAvatarAction } from "@/lib/profile/actions";
import { createClient } from "@/lib/supabase/client";

interface AvatarPickerProps {
  currentAvatarUrl?: string | null;
  name: string;
  onAvatarChange?: (url: string) => void;
  isStandalone?: boolean; // If true, provides direct "Save" button to update profile
}

// Sleek campus avatar presets (SVG-based data URLs)
const CAMPUS_PRESETS: { id: string; label: string; url: string }[] = [
  {
    id: "preset-1",
    label: "Gradient Blue",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><defs><linearGradient id='g1' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%232563eb'/><stop offset='100%' stop-color='%234f46e5'/></linearGradient></defs><circle cx='50' cy='50' r='50' fill='url(%23g1)'/><path d='M50 45a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-18 0-35 9-35 25v5h70v-5c0-16-17-25-35-25z' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: "preset-2",
    label: "Emerald Campus",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><defs><linearGradient id='g2' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23059669'/><stop offset='100%' stop-color='%2310b981'/></linearGradient></defs><circle cx='50' cy='50' r='50' fill='url(%23g2)'/><path d='M50 45a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-18 0-35 9-35 25v5h70v-5c0-16-17-25-35-25z' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: "preset-3",
    label: "Sunset Tech",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><defs><linearGradient id='g3' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23ea580c'/><stop offset='100%' stop-color='%23f59e0b'/></linearGradient></defs><circle cx='50' cy='50' r='50' fill='url(%23g3)'/><path d='M50 45a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-18 0-35 9-35 25v5h70v-5c0-16-17-25-35-25z' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: "preset-4",
    label: "Violet Scholar",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><defs><linearGradient id='g4' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%237c3aed'/><stop offset='100%' stop-color='%23ec4899'/></linearGradient></defs><circle cx='50' cy='50' r='50' fill='url(%23g4)'/><path d='M50 45a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-18 0-35 9-35 25v5h70v-5c0-16-17-25-35-25z' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: "preset-5",
    label: "Cyber Navy",
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><defs><linearGradient id='g5' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%230f172a'/><stop offset='100%' stop-color='%23334155'/></linearGradient></defs><circle cx='50' cy='50' r='50' fill='url(%23g5)'/><path d='M50 45a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-18 0-35 9-35 25v5h70v-5c0-16-17-25-35-25z' fill='%2338bdf8' opacity='0.9'/></svg>",
  },
];

export function AvatarPicker({
  currentAvatarUrl,
  name,
  onAvatarChange,
  isStandalone = false,
}: AvatarPickerProps) {
  const [avatarUrl, setAvatarUrl] = useState<string>(currentAvatarUrl || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialLetter = name ? name.trim().charAt(0).toUpperCase() : "U";

  // Compress and resize image file client-side using HTML5 Canvas
  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }

          // Center crop calculation
          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);

          // Export as compressed WebP or JPEG
          const compressedDataUrl = canvas.toDataURL("image/webp", 0.85);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: max 5MB before compression
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: "error", message: "Please select an image smaller than 5MB." });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      // 1. Client-side compression
      const compressedDataUrl = await processImageFile(file);

      let finalUrl = compressedDataUrl;

      // 2. Attempt Supabase Storage upload
      try {
        const supabase = createClient();
        if (supabase) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const fileName = `${user.id}-${Date.now()}.webp`;

            // Convert data URL to Blob
            const res = await fetch(compressedDataUrl);
            const blob = await res.blob();

            const { data: uploadData, error: uploadErr } = await supabase.storage
              .from("avatars")
              .upload(fileName, blob, {
                contentType: "image/webp",
                upsert: true,
              });

            if (!uploadErr && uploadData) {
              const { data: publicUrlData } = supabase.storage
                .from("avatars")
                .getPublicUrl(uploadData.path);

              if (publicUrlData?.publicUrl) {
                finalUrl = publicUrlData.publicUrl;
              }
            }
          }
        }
      } catch (storageErr) {
        // Fall back gracefully to compressedDataUrl
        console.warn("Storage upload note: using compressed data URL fallback", storageErr);
      }

      setAvatarUrl(finalUrl);
      if (onAvatarChange) {
        onAvatarChange(finalUrl);
      }

      setFeedback({
        type: "success",
        message: "Profile photo ready! Click 'Save' to apply changes.",
      });
    } catch (err) {
      console.error("Error processing image:", err);
      setFeedback({ type: "error", message: "Failed to process image. Please try another file." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPreset = (presetUrl: string) => {
    setAvatarUrl(presetUrl);
    setFeedback(null);
    if (onAvatarChange) {
      onAvatarChange(presetUrl);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl("");
    setFeedback(null);
    if (onAvatarChange) {
      onAvatarChange("");
    }
  };

  const handleSaveStandalone = () => {
    startSaving(async () => {
      const res = await updateAvatarAction(avatarUrl);
      if (res.success) {
        setFeedback({
          type: "success",
          message: "Profile picture updated successfully!",
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to update profile picture.",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Avatar Preview & Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* Avatar Ring */}
        <div className="relative group shrink-0">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-2xl sm:text-3xl flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-zinc-200/80 transition-all">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile picture"
                className="w-full h-full object-cover"
              />
            ) : (
              initialLetter
            )}
          </div>

          {/* Quick upload overlay */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            title="Upload photo"
            className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer backdrop-blur-[2px]"
          >
            <Camera className="w-6 h-6" />
          </button>
        </div>

        {/* Action Buttons & Guidance */}
        <div className="space-y-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-800"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Processing...
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Upload Photo
                </>
              )}
            </Button>

            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveAvatar}
                className="text-xs text-zinc-500 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Remove
              </Button>
            )}

            {isStandalone && avatarUrl !== currentAvatarUrl && (
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={handleSaveStandalone}
                className="text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    Save Picture
                  </>
                )}
              </Button>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            JPG, PNG, or WebP up to 5MB. Automatically cropped and optimized for campus trust.
          </p>
        </div>
      </div>

      {/* Preset Campus Avatars */}
      <div className="space-y-1.5 pt-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          Or choose a campus style
        </span>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {CAMPUS_PRESETS.map((preset) => {
            const isSelected = avatarUrl === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.url)}
                className={`w-9 h-9 rounded-xl overflow-hidden border transition-all shrink-0 p-0.5 ${
                  isSelected
                    ? "ring-2 ring-blue-600 border-transparent scale-105"
                    : "border-zinc-200 hover:border-zinc-300 opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="w-full h-full rounded-lg object-cover"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Feedback */}
      {feedback && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
