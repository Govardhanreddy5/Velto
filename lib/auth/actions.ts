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
  const origin = headerList.get("origin") || "http://localhost:3000";

  // 4. Register with Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email: collegeEmail,
    password: password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        roll_number: emailValidation.rollNumber,
        campus: emailValidation.campusDomain,
      },
    },
  });

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  // If Supabase requires email verification, session will be null
  const requiresEmailVerification = !data.session;

  return {
    success: true,
    message: requiresEmailVerification
      ? "Account created! Please check your college inbox to confirm your email."
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
    return {
      success: false,
      message: error.message,
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
