"use server";

import { createClient } from "@/lib/supabase/server";
import { validateOnboardingData } from "@/lib/profile/validation";
import { Profile } from "@/types/database";
import { revalidatePath } from "next/cache";

export type RoutingStatus =
  | "UNAUTHENTICATED"
  | "RESTRICTED"
  | "NEEDS_ONBOARDING"
  | "READY";

export interface UserRoutingResult {
  status: RoutingStatus;
  destination: string;
  user: { id: string; email: string } | null;
  profile: Profile | null;
  message?: string;
}

/**
 * Server-side check for user authentication and onboarding status.
 * Used by protected routes (/dashboard, /onboarding, /requests).
 */
export async function checkUserRouting(): Promise<UserRoutingResult> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      status: "UNAUTHENTICATED",
      destination: "/auth?mode=signin",
      user: null,
      profile: null,
      message: "Supabase client not configured.",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return {
      status: "UNAUTHENTICATED",
      destination: "/auth?mode=signin",
      user: null,
      profile: null,
    };
  }

  // Fetch student profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // If profile doesn't exist yet (e.g. trigger didn't run), create base profile
  if (!profile && !profileError) {
    const rollNumber =
      user.user_metadata?.roll_number || user.email.split("@")[0].toUpperCase();
    const campus = user.user_metadata?.campus || "Vishnu Educational Society";

    const { data: newProfile } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        roll_number: rollNumber,
        campus: campus,
        is_verified: true,
        is_onboarded: false,
      })
      .select()
      .maybeSingle();

    return {
      status: "NEEDS_ONBOARDING",
      destination: "/onboarding",
      user: { id: user.id, email: user.email },
      profile: (newProfile as Profile) || null,
    };
  }

  if (profile?.is_banned || profile?.is_suspended) {
    return {
      status: "RESTRICTED",
      destination: "/access-restricted",
      user: { id: user.id, email: user.email },
      profile: profile as Profile,
      message: profile?.is_banned
        ? "Your campus account has been permanently banned."
        : "Your campus account is temporarily suspended.",
    };
  }

  if (!profile?.is_onboarded) {
    return {
      status: "NEEDS_ONBOARDING",
      destination: "/onboarding",
      user: { id: user.id, email: user.email },
      profile: profile as Profile,
    };
  }

  return {
    status: "READY",
    destination: "/dashboard",
    user: { id: user.id, email: user.email },
    profile: profile as Profile,
  };
}

/**
 * Server Action: Submit profile onboarding information.
 * Enforces server-side validation and protects sensitive fields.
 */
export async function completeOnboardingAction(formData: FormData): Promise<{
  success: boolean;
  message: string;
  errors?: Record<string, string>;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { success: false, message: "Server connection failed." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "You must be signed in to onboard." };
  }

  const fullName = (formData.get("fullName") as string)?.trim() ?? "";
  const department = (formData.get("department") as string)?.trim() ?? "";
  const yearOfStudy = (formData.get("yearOfStudy") as string)?.trim() ?? "";
  const upiId = (formData.get("upiId") as string)?.trim().toLowerCase() ?? "";

  // 1. Validate fields
  const validation = validateOnboardingData({
    fullName,
    department,
    yearOfStudy,
    upiId,
  });

  if (!validation.isValid) {
    return {
      success: false,
      message: "Please correct the form errors.",
      errors: validation.errors,
    };
  }

  // 2. Update profile with ONLY allowed fields
  // Prevents tampering with email, roll_number, rating, trade counts, or admin status
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      department: department,
      year_of_study: parseInt(yearOfStudy, 10),
      upi_id: upiId,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    // If the database columns haven't been created yet in Supabase
    if (updateError.message.includes("does not exist")) {
      return {
        success: false,
        message:
          "Database migration required: Please run 'supabase/migrations/01_foundation_schema.sql' in your Supabase SQL Editor.",
      };
    }
    return {
      success: false,
      message: `Failed to save profile: ${updateError.message}`,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");

  return {
    success: true,
    message: "Profile setup completed successfully!",
  };
}
