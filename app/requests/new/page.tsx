import { checkUserRouting } from "@/lib/profile/actions";
import { redirect } from "next/navigation";
import { CreateRequestForm } from "@/components/requests/create-request-form";
import Link from "next/link";
import { ArrowLeft, PlusCircle } from "lucide-react";
import { RequestType } from "@/types/database";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post Cash Request | Velto",
  description: "Create a peer-to-peer cash and UPI exchange request on campus.",
};

interface CreateRequestPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CreateRequestPage({
  searchParams,
}: CreateRequestPageProps) {
  const routing = await checkUserRouting();

  if (routing.status === "UNAUTHENTICATED") {
    redirect("/auth?mode=signin");
  }

  if (routing.status === "RESTRICTED") {
    redirect("/access-restricted");
  }

  if (routing.status === "NEEDS_ONBOARDING") {
    redirect("/onboarding");
  }

  const resolvedParams = await searchParams;
  const initialType: RequestType =
    resolvedParams.type === "HAVE_CASH_WANT_UPI"
      ? "HAVE_CASH_WANT_UPI"
      : "NEED_CASH";

  const campus = routing.profile?.campus || "Vishnu Educational Society";

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 px-4 py-8 sm:py-12 flex flex-col items-center">
      <div className="w-full max-w-lg space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/feed"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Campus Feed
          </Link>
          <span className="text-xs text-zinc-500 font-medium">{campus}</span>
        </div>

        {/* Page Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <PlusCircle className="w-3.5 h-3.5" />
            Peer Exchange
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
            Create Exchange Request
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 max-w-sm mx-auto">
            Connect with a verified student nearby to swap physical cash and UPI.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xl p-6 sm:p-8">
          <CreateRequestForm
            initialType={initialType}
            campusName={campus}
          />
        </div>
      </div>
    </main>
  );
}
