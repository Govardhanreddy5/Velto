import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // Handle reverse-proxy / Vercel host header
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_SITE_URL || origin;

  const supabase = await createClient();

  if (supabase) {
    // 1. Handle token_hash verification (common in email confirmation links)
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });
      if (!error) {
        return NextResponse.redirect(`${baseUrl}${next}`);
      }
      console.error("[Auth Callback] OTP verification error:", error);
    }

    // 2. Handle PKCE code exchange
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${baseUrl}${next}`);
      }
      console.error("[Auth Callback] Code exchange error:", error);
    }
  }

  // Return the student to auth page with error parameter if verification failed
  return NextResponse.redirect(`${baseUrl}/auth?error=could_not_verify`);
}
