import { checkUserRouting } from "@/lib/profile/actions";
import { getUserTradeHistory } from "@/lib/trades/actions";
import { signOutAction } from "@/lib/auth/actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  User,
  Star,
  CheckCircle2,
  Banknote,
  Smartphone,
  MapPin,
  Clock,
  ArrowRight,
  LogOut,
  LayoutDashboard,
  Radio,
  Lock,
  Building,
  GraduationCap,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Profile & Trade History | Velto",
  description: "View verified campus reputation, trust score, and completed trade history.",
};

export default async function ProfilePage() {
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

  const profile = routing.profile;
  const user = routing.user;

  const [tradeHistory] = await Promise.all([
    getUserTradeHistory(),
  ]);

  const displayName = profile?.full_name || "Verified Student";
  const rollNumber =
    profile?.roll_number || user?.email?.split("@")[0].toUpperCase();
  const department = profile?.department || "Campus Department";
  const yearText = profile?.year_of_study
    ? `Year ${profile.year_of_study}`
    : "Enrolled";
  const campus = profile?.campus || "Vishnu Educational Society";
  const ratingAvg = Number(profile?.rating_avg || 5.0).toFixed(1);
  const totalTrades = profile?.total_trades || 0;
  const totalRatings = profile?.total_ratings || 0;
  const upiId = profile?.upi_id || "Not configured";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
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
                className="text-zinc-600 hover:text-zinc-950 flex items-center gap-1.5 transition-colors"
              >
                <Radio className="w-3.5 h-3.5" />
                Campus Feed
              </Link>
              <Link
                href="/profile"
                className="text-blue-600 flex items-center gap-1.5 font-bold"
              >
                <User className="w-3.5 h-3.5" />
                Profile & History
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {profile?.is_admin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 h-8 rounded-lg bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 transition-colors shadow-xs"
              >
                <Shield className="w-3.5 h-3.5 text-rose-600" />
                Admin Console
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
      <main className="max-w-4xl mx-auto px-6 pt-8 space-y-8">
        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl border border-zinc-200/90 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
                {displayName.charAt(0).toUpperCase()}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-zinc-950">
                    {displayName}
                  </h1>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Verified Student
                  </span>
                </div>

                <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-zinc-800">
                    {rollNumber}
                  </span>
                  <span>•</span>
                  <span>{user?.email}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-600">
                  <span className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-zinc-400" />
                    {department}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-zinc-400" />
                    {yearText}
                  </span>
                  <span>•</span>
                  <span>{campus}</span>
                </div>
              </div>
            </div>

            {/* Reputation Highlights */}
            <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200">
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                <span className="text-sm font-black text-amber-900 font-mono">
                  {ratingAvg}
                </span>
                <span className="text-[11px] text-amber-700 font-medium">
                  ({totalRatings} reviews)
                </span>
              </div>

              <span className="text-xs font-semibold text-zinc-500">
                {totalTrades} completed swaps
              </span>
            </div>
          </div>

          {/* Secure Private UPI ID Callout */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-700">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Personal UPI ID:{" "}
                <strong className="font-mono text-zinc-950 font-bold">
                  {upiId}
                </strong>
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 italic">
              Encrypted & strictly private to your verified account.
            </span>
          </div>
        </div>

        {/* Trade History Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-950">
                Completed Trade History
              </h2>
              <p className="text-xs text-zinc-500">
                All physical cash and UPI swaps completed on campus
              </p>
            </div>
            <span className="text-xs font-bold text-zinc-400">
              {tradeHistory.length} completed
            </span>
          </div>

          {tradeHistory.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200/90 p-12 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto border border-zinc-200">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900">
                  No completed trades yet
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  When you exchange cash and UPI with verified students and both
                  confirm receipt, your completed swaps appear here.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/feed"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Radio className="w-4 h-4" />
                  Explore Campus Feed
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {tradeHistory.map((item) => {
                const isNeedCash = item.request_type === "NEED_CASH";
                const partnerName = item.partner?.full_name || "Verified Student";
                const completedTime = item.completed_at
                  ? new Date(item.completed_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Completed";

                return (
                  <div
                    key={item.id}
                    className="p-5 bg-white rounded-3xl border border-zinc-200/90 hover:border-zinc-300 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isNeedCash
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}
                      >
                        {isNeedCash ? (
                          <Banknote className="w-5 h-5" />
                        ) : (
                          <Smartphone className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black font-mono text-zinc-950">
                            ₹{item.amount}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isNeedCash
                                ? "bg-emerald-100/70 text-emerald-800"
                                : "bg-blue-100/70 text-blue-800"
                            }`}
                          >
                            {isNeedCash ? "Cash Received" : "UPI Received"}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            • {completedTime}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-600 flex items-center gap-1.5">
                          <span>Partner: <strong>{partnerName}</strong></span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-zinc-500">
                            <MapPin className="w-3 h-3 text-blue-600" />
                            {item.meetup_location}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions & Rating Badge */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {item.hasRated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          Rated {item.myRating}★
                        </span>
                      ) : (
                        <Link
                          href={`/trades/${item.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-xl border border-blue-200 transition-colors"
                        >
                          <Star className="w-3.5 h-3.5 text-blue-600" />
                          Rate Partner
                        </Link>
                      )}

                      <Link
                        href={`/trades/${item.id}`}
                        className="p-2 rounded-xl text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
                        title="View Trade Room"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
