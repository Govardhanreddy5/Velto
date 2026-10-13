"use server";

import { createClient } from "@/lib/supabase/server";
import { validateOnboardingData } from "@/lib/profile/validation";
import { getCampusForEmail } from "@/lib/auth/validation";
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
 * Used by protected routes (/dashboard, /onboarding, /requests, /feed).
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
    const isSessionExpired =
      authError?.message?.toLowerCase().includes("jwt") ||
      authError?.message?.toLowerCase().includes("expired") ||
      authError?.message?.toLowerCase().includes("session");

    return {
      status: "UNAUTHENTICATED",
      destination: isSessionExpired
        ? "/auth?mode=signin&reason=session_expired"
        : "/auth?mode=signin",
      user: null,
      profile: null,
      message: isSessionExpired ? "Your session has expired. Please sign in again." : undefined,
    };
  }

  // Fetch student profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile in checkUserRouting:", profileError);
  }

  // If profile doesn't exist yet, attempt to create base profile
  if (!profile) {
    const rollNumber =
      user.user_metadata?.roll_number || user.email.split("@")[0].toUpperCase();
    const campus =
      getCampusForEmail(user.email) ||
      user.user_metadata?.campus ||
      "Vishnu Educational Society";

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
      profile: (newProfile as Profile) || ({
        id: user.id,
        email: user.email,
        roll_number: rollNumber,
        campus: campus,
        is_onboarded: false,
        is_verified: true,
      } as unknown as Profile),
    };
  }

  if (profile.is_banned || profile.is_suspended) {
    return {
      status: "RESTRICTED",
      destination: "/access-restricted",
      user: { id: user.id, email: user.email },
      profile: profile as Profile,
      message: profile.is_banned
        ? "Your campus account has been permanently banned."
        : "Your campus account is temporarily suspended.",
    };
  }

  if (!profile.is_onboarded) {
    return {
      status: "NEEDS_ONBOARDING",
      destination: "/onboarding",
      user: { id: user.id, email: user.email },
      profile: profile as Profile,
    };
  }

  // Safe sync for existing users: if full_name is present in profile but not in auth metadata, update it
  if (profile.full_name && user.user_metadata?.full_name !== profile.full_name) {
    try {
      await supabase.auth.updateUser({
        data: { full_name: profile.full_name },
      });
    } catch (err) {
      // Non-blocking
      console.error("Non-blocking error syncing auth user metadata for existing user:", err);
    }
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
 * Strictly verifies database update succeeded before returning success.
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

  if (!user || !user.email) {
    return { success: false, message: "You must be signed in to complete onboarding." };
  }

  const fullName = (formData.get("fullName") as string)?.trim() ?? "";
  const department = (formData.get("department") as string)?.trim() ?? "";
  const yearOfStudy = (formData.get("yearOfStudy") as string)?.trim() ?? "";
  const upiId = (formData.get("upiId") as string)?.trim().toLowerCase() ?? "";
  const avatarUrl = (formData.get("avatarUrl") as string)?.trim() || null;

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

  const rollNumber =
    user.user_metadata?.roll_number || user.email.split("@")[0].toUpperCase();
  const campus =
    getCampusForEmail(user.email) ||
    user.user_metadata?.campus ||
    "Vishnu Educational Society";
  const parsedYear = parseInt(yearOfStudy, 10);

  // 2. First attempt: update existing row and verify using .select()
  const { data: updatedRows, error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      department: department,
      year_of_study: parsedYear,
      upi_id: upiId,
      avatar_url: avatarUrl,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select();

  if (updateError) {
    if (updateError.message.includes("does not exist")) {
      return {
        success: false,
        message:
          "Database columns missing in Supabase: Please run the SQL migration script in your Supabase SQL Editor.",
      };
    }
    return {
      success: false,
      message: `Database error during update: ${updateError.message}`,
    };
  }

  let savedProfile = updatedRows && updatedRows.length > 0 ? updatedRows[0] : null;

  // 3. Fallback: If 0 rows were updated, profile row does not exist yet. Insert or upsert it.
  if (!savedProfile) {
    const { data: insertedRows, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        roll_number: rollNumber,
        campus: campus,
        full_name: fullName,
        department: department,
        year_of_study: parsedYear,
        upi_id: upiId,
        avatar_url: avatarUrl,
        is_onboarded: true,
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (insertError) {
      if (
        insertError.code === "42501" ||
        insertError.message.includes("row-level security")
      ) {
        return {
          success: false,
          message:
            "RLS Permission Notice: Profile row does not exist yet and RLS blocked insertion. Please run the provided SQL in Supabase SQL Editor to enable profile creation.",
        };
      }
      return {
        success: false,
        message: `Failed to insert profile record: ${insertError.message}`,
      };
    }

    savedProfile = insertedRows && insertedRows.length > 0 ? insertedRows[0] : null;
  }

  // 4. Strict Verification: NEVER report success unless is_onboarded is confirmed true in DB
  if (!savedProfile || savedProfile.is_onboarded !== true) {
    return {
      success: false,
      message:
        "Database verification failed: The profile was not saved with is_onboarded = true. Please check your Supabase tables.",
    };
  }

  // 5. Sync full_name into Supabase Auth user metadata so Display name is visible in Supabase Auth
  try {
    await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
  } catch (authMetaErr) {
    // Non-blocking: public.profiles remains the authoritative application profile record
    console.error("Non-blocking error syncing full_name to auth user metadata:", authMetaErr);
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/profile");

  return {
    success: true,
    message: "Profile setup completed successfully!",
  };
}

/**
 * Server action to update the user's profile picture.
 */
export async function updateAvatarAction(
  avatarUrl: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { success: false, error: "Database unavailable." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Authentication required." };

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("Error updating avatar:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  return { success: true };
}
