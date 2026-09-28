"use server";

import { createClient } from "@/lib/supabase/server";
import { validateCollegeEmail, validatePassword } from "@/lib/auth/validation";
import { AuthResponse } from "@/types/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server Action: Registers a new student using their official college email.
 */
export async function signUpAction(formData: FormData): Promise<AuthResponse> {
  const collegeEmail = (formData.get("collegeEmail") as string)?.trim() ?? "";
  const password = (formData.get("password") as string) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

  // 1. Backend validation of college email
  const emailValidation = validateCollegeEmail(collegeEmail);
  if (!emailValidation.isValid) {
    return {
      success: false,
      message: emailValidation.error ?? "Invalid college email address.",
    };
  }

  // 2. Backend validation of password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return {
      success: false,
      message: passwordValidation.error ?? "Invalid password.",
    };
  }

  if (password !== confirmPassword) {
    return {
      success: false,
      message: "Passwords do not match.",
    };
  }

  // 3. Supabase Client
  const supabase = await createClient();
  if (!supabase) {
    return {
      success: false,
      message: "Supabase client is not configured. Check environment variables.",
    };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  // 4. Register with Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email: collegeEmail,
    password: password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: emailValidation.rollNumber,
        roll_number: emailValidation.rollNumber,
        campus: emailValidation.campusDomain,
      },
    },
  });

  if (error) {
    let friendlyMessage = error.message;
    if (
      error.message.toLowerCase().includes("rate limit") ||
      error.message.toLowerCase().includes("over_email_send_rate_limit")
    ) {
      friendlyMessage =
        "Email verification delivery rate limit reached. Please wait a few minutes before retrying or use the resend button.";
    }
    return {
      success: false,
      message: friendlyMessage,
    };
  }

  // Detect when Supabase prevents user enumeration: if user already exists, identities is []
  if (data.user?.identities && data.user.identities.length === 0) {
    return {
      success: false,
      message:
        "An account with this college email is already registered. If you haven't confirmed your email yet, click 'Resend Confirmation Email' below, or switch to Sign In.",
      data: {
        email: collegeEmail,
        rollNumber: emailValidation.rollNumber,
        isExistingUser: true,
        needsEmailConfirmation: true,
      },
    };
  }

  // If Supabase requires email verification, session will be null
  const requiresEmailVerification = !data.session;

  return {
    success: true,
    message: requiresEmailVerification
      ? "Account created! A confirmation email has been dispatched to your college inbox."
      : "Welcome to Velto! Your student account is active.",
    data: {
      email: data.user?.email,
      userId: data.user?.id,
      rollNumber: emailValidation.rollNumber,
      requiresEmailVerification,
    },
  };
}

/**
 * Server Action: Resends a confirmation email to an unverified student.
 */
export async function resendConfirmationEmailAction(
  email: string
): Promise<AuthResponse> {
  const collegeEmail = (email || "").trim().toLowerCase();

  const emailValidation = validateCollegeEmail(collegeEmail);
  if (!emailValidation.isValid) {
    return {
      success: false,
      message: emailValidation.error ?? "Invalid college email address.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      success: false,
      message: "Database connection failed. Please try again.",
    };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: collegeEmail,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    let friendlyMessage = error.message;
    if (
      error.message.toLowerCase().includes("rate limit") ||
      error.message.toLowerCase().includes("over_email_send_rate_limit")
    ) {
      friendlyMessage =
        "Email delivery rate limit reached. Please wait 60 seconds before trying again.";
    }
    return {
      success: false,
      message: friendlyMessage,
    };
  }

  return {
    success: true,
    message: `Verification email resent to ${collegeEmail}! Please check your inbox and Spam/Junk folder.`,
    data: {
      email: collegeEmail,
      rollNumber: emailValidation.rollNumber,
    },
  };
}

/**
 * Server Action: Authenticates an existing student.
 */
export async function signInAction(formData: FormData): Promise<AuthResponse> {
  const collegeEmail = (formData.get("collegeEmail") as string)?.trim() ?? "";
  const password = (formData.get("password") as string) ?? "";

  // 1. Backend validation of college email
  const emailValidation = validateCollegeEmail(collegeEmail);
  if (!emailValidation.isValid) {
    return {
      success: false,
      message: emailValidation.error ?? "Invalid college email.",
    };
  }

  if (!password) {
    return {
      success: false,
      message: "Password is required.",
    };
  }

  // 2. Supabase Client
  const supabase = await createClient();
  if (!supabase) {
    return {
      success: false,
      message: "Supabase client is not configured.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: collegeEmail,
    password: password,
  });

  if (error) {
    const isUnconfirmed = error.message.toLowerCase().includes("email not confirmed");
    return {
      success: false,
      message: isUnconfirmed
        ? "Your college email has not been confirmed yet. Please verify your inbox or click 'Resend Confirmation Email'."
        : error.message,
      data: {
        email: collegeEmail,
        needsEmailConfirmation: isUnconfirmed,
      },
    };
  }

  return {
    success: true,
    message: "Signed in successfully!",
    data: {
      email: data.user.email,
      userId: data.user.id,
      rollNumber: emailValidation.rollNumber,
    },
  };
}

/**
 * Server Action: Signs out the currently authenticated student.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/auth");
}

/**
 * Server Action: Fetches the current logged in user session.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
