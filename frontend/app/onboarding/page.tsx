import { checkUserRouting } from "@/lib/profile/actions";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Student Profile | Velto",
  description: "Complete your campus profile to exchange cash and UPI on Velto.",
};

export default async function OnboardingPage() {
  const routing = await checkUserRouting();

  if (routing.status === "UNAUTHENTICATED") {
    redirect("/auth?mode=signin");
  }

  if (routing.status === "RESTRICTED") {
    redirect("/access-restricted");
  }

  if (routing.status === "READY") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 px-4 py-12 flex flex-col items-center justify-center">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <ShieldCheck className="w-3.5 h-3.5" />
            Step 2 of 2: Campus Onboarding
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
            Complete Your Student Profile
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 max-w-sm mx-auto">
            Set up your details once to start exchanging cash and UPI safely with
            verified peers across campus.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xl p-6 sm:p-8">
          <OnboardingForm
            initialProfile={routing.profile}
            userEmail={routing.user?.email || ""}
          />
        </div>
      </div>
    </main>
  );
}
