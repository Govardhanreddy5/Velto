import { checkUserRouting } from "@/lib/profile/actions";
import { getActiveUserTrades } from "@/lib/trades/actions";
import { signOutAction } from "@/lib/auth/actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Banknote,
  Smartphone,
  Star,
  CheckCircle2,
  LogOut,
  Building,
  GraduationCap,
  Clock,
  ShieldCheck,
  ArrowRight,
  PlusCircle,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Dashboard | Velto",
  description: "Campus cash and UPI peer exchange hub.",
};

export default async function DashboardPage() {
  const routing = await checkUserRouting();

  // 1. Strict Server-Side Routing Guards
  if (routing.status === "UNAUTHENTICATED") {
    redirect("/auth?mode=signin");
  }

  if (routing.status === "RESTRICTED") {
    redirect("/access-restricted");
  }

  if (routing.status === "NEEDS_ONBOARDING") {
    redirect("/onboarding");
  }

  const profile = routing.profile;
  const user = routing.user;

  const displayName = profile?.full_name || "Verified Student";
  const rollNumber =
    profile?.roll_number || user?.email?.split("@")[0].toUpperCase();
  const department = profile?.department || "General Studies";
  const yearText = profile?.year_of_study
    ? `Year ${profile.year_of_study}`
    : "Enrolled";
  const campus = profile?.campus || "Vishnu Educational Society";
  const ratingAvg = Number(profile?.rating_avg || 5.0).toFixed(1);
  const totalTrades = profile?.total_trades || 0;
  const totalRatings = profile?.total_ratings || 0;

  const activeTrades = await getActiveUserTrades();

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
                className="text-blue-600 font-bold"
              >
                Dashboard
              </Link>
              <Link
                href="/feed"
                className="text-zinc-600 hover:text-zinc-950 transition-colors"
              >
                Campus Feed
              </Link>
              <Link
                href="/profile"
                className="text-zinc-600 hover:text-zinc-950 transition-colors"
              >
                Profile & History
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
              <span className="hidden sm:inline">Campus</span> Feed
            </Link>

            <div className="flex items-center gap-2">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="w-7 h-7 rounded-full object-cover border border-zinc-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden md:flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-2 py-1 rounded-md">
                <span>{rollNumber}</span>
              </div>
            </div>

            {profile?.is_admin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 h-8 rounded-lg bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 transition-colors shadow-xs"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                Admin
              </Link>
            )}

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

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10 space-y-8">
        {/* Welcome Banner & Public Profile Card */}
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-6">
            <div className="flex items-center gap-4">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 shadow-sm border border-zinc-200"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xl sm:text-2xl flex items-center justify-center shrink-0 shadow-sm">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                    Welcome, {displayName}
                  </h1>
                  <Badge variant="success">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </Badge>
                </div>
                <p className="text-sm text-zinc-600">
                  Connected to <strong className="text-zinc-900">{campus}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Rating Pill */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                <span>{ratingAvg}</span>
                <span className="text-amber-700/70 font-normal">
                  ({totalRatings} reviews)
                </span>
              </div>

              {/* Completed Trades Pill */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>{totalTrades} Trades</span>
              </div>
            </div>
          </div>

          {/* Public Profile Details Grid (NO UPI ID EXPOSED) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
              <span className="text-zinc-500 uppercase tracking-wider font-semibold text-[10px] flex items-center gap-1">
                <GraduationCap className="w-3 h-3 text-blue-600" />
                Academic Department
              </span>
              <p className="font-semibold text-zinc-900 text-sm">{department}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
              <span className="text-zinc-500 uppercase tracking-wider font-semibold text-[10px] flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-600" />
                Year of Study
              </span>
              <p className="font-semibold text-zinc-900 text-sm">{yearText}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
              <span className="text-zinc-500 uppercase tracking-wider font-semibold text-[10px] flex items-center gap-1">
                <Building className="w-3 h-3 text-blue-600" />
                Student Roll Number
              </span>
              <p className="font-mono font-bold text-zinc-900 text-sm">{rollNumber}</p>
            </div>
          </div>
        </div>

        {/* Live Campus Feed Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-blue-500/10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
              <Radio className="w-3 h-3 animate-pulse" />
              Live Campus Exchange
            </div>
            <h2 className="text-xl font-bold">Browse Active Requests Nearby</h2>
            <p className="text-xs text-blue-100 max-w-md">
              See students across {campus} currently offering or requesting cash
              in exchange for UPI transfers.
            </p>
          </div>

          <Link
            href="/feed"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-blue-700 font-bold text-xs hover:bg-blue-50 active:scale-95 transition-all shrink-0 shadow-sm"
          >
            Open Campus Feed
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Active Trades in Progress Section */}
        {activeTrades.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-zinc-950 flex items-center gap-2">
                  <span>Active Trades in Progress</span>
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                </h2>
                <p className="text-xs text-zinc-500">
                  You have active peer swaps awaiting meetup or receipt confirmation.
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {activeTrades.length} active
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {activeTrades.map((trade) => {
                const partnerName = trade.partner?.full_name || "Verified Student";
                const isNeedCash = trade.request_type === "NEED_CASH";

                return (
                  <div
                    key={trade.id}
                    className="p-5 bg-white rounded-2xl border border-blue-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                          isNeedCash
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}
                      >
                        {isNeedCash ? (
                          <Banknote className="w-6 h-6" />
                        ) : (
                          <Smartphone className="w-6 h-6" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black font-mono text-zinc-950">
                            ₹{trade.amount}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isNeedCash
                                ? "bg-emerald-100/70 text-emerald-800"
                                : "bg-blue-100/70 text-blue-800"
                            }`}
                          >
                            {isNeedCash ? "Need Cash" : "Have Cash (Want UPI)"}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-600 flex items-center gap-2">
                          <span>Trading with <strong>{partnerName}</strong></span>
                          <span>•</span>
                          <span className="text-zinc-500">{trade.meetup_location}</span>
                        </div>

                        {/* Status notification */}
                        <div className="pt-1">
                          {trade.myConfirmed && !trade.partnerConfirmed ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              You confirmed receipt • Waiting for {partnerName} to confirm
                            </span>
                          ) : !trade.myConfirmed && trade.partnerConfirmed ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {partnerName} has confirmed receipt! Please verify & confirm.
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                              <Clock className="w-3 h-3 text-blue-600" />
                              Meetup & swap in progress
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 self-end md:self-center">
                      <Link
                        href={`/trades/${trade.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all"
                      >
                        Open Trade Room
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Action Cards for Creating Requests */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-950">
              Post an Exchange Request
            </h2>
            <span className="text-xs text-zinc-500">
              Exchange limit: ₹20 – ₹500 per trade
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Card 1: Need Cash */}
            <div className="relative rounded-2xl bg-white border border-zinc-200/90 p-6 shadow-sm flex flex-col justify-between space-y-5 transition-all hover:border-emerald-300 hover:shadow-md">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <Badge variant="success">Active Feature</Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-base text-zinc-950">
                    Need Physical Cash
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    You need cash near the canteen, library, or gate. You will send
                    an instant UPI payment to a verified student who gives you physical
                    cash.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/requests/new?type=NEED_CASH"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create &quot;Need Cash&quot; Request
                </Link>
              </div>
            </div>

            {/* Card 2: Have Cash Want UPI */}
            <div className="relative rounded-2xl bg-white border border-zinc-200/90 p-6 shadow-sm flex flex-col justify-between space-y-5 transition-all hover:border-blue-300 hover:shadow-md">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <Badge variant="info">Active Feature</Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-base text-zinc-950">
                    Have Cash → Want UPI
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    You have spare physical cash and want money in your bank account.
                    You hand over physical cash and receive an instant UPI payment.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/requests/new?type=HAVE_CASH_WANT_UPI"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create &quot;Have Cash&quot; Request
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
