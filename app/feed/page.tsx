import { checkUserRouting } from "@/lib/profile/actions";
import { getFeedRequests, getMyRequests } from "@/lib/requests/actions";
import { signOutAction } from "@/lib/auth/actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FeedView } from "@/components/feed/feed-view";
import { Button } from "@/components/ui/button";
import { LogOut, PlusCircle, LayoutDashboard, User } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campus Feed | Velto",
  description: "Browse live peer-to-peer cash and UPI exchange requests on campus.",
};

export default async function FeedPage() {
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

  const [feedData, myRequests] = await Promise.all([
    getFeedRequests(),
    getMyRequests(),
  ]);

  const rollNumber =
    routing.profile?.roll_number ||
    routing.user?.email?.split("@")[0].toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-zinc-950">
                Velto
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-4 text-xs font-semibold">
              <Link
                href="/dashboard"
                className="text-zinc-600 hover:text-zinc-950 flex items-center gap-1.5 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Link>
              <Link
                href="/feed"
                className="text-blue-600 flex items-center gap-1.5 font-bold"
              >
                Campus Feed
              </Link>
              <Link
                href="/profile"
                className="text-zinc-600 hover:text-zinc-950 flex items-center gap-1.5 transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                Profile
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/requests/new"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Post</span> Request
            </Link>

            <div className="hidden md:flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md">
              <span>{rollNumber}</span>
            </div>

            <form action={signOutAction}>
              <Button
                variant="outline"
                type="submit"
                className="text-xs py-1.5 px-3 h-8 text-zinc-600 hover:text-zinc-950 border-zinc-300"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Feed Container */}
      <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10">
        <FeedView
          initialFeedRequests={feedData.requests}
          initialMyRequests={myRequests}
          campus={feedData.campus || "Vishnu Educational Society"}
          currentUserId={feedData.currentUserId || ""}
        />
      </main>
    </div>
  );
}
