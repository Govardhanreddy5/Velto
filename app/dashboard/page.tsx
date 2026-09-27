import { getCurrentUser, signOutAction } from "@/lib/auth/actions";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, LogOut, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Dashboard | Velto",
  description: "Verified student profile on Velto.",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth?mode=signin");
  }

  const rollNumber = user.user_metadata?.roll_number || user.email?.split("@")[0].toUpperCase();
  const campus = user.user_metadata?.campus || "Verified Campus";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center">
      <div className="max-w-md w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mx-auto flex items-center justify-center text-emerald-400">
          <GraduationCap className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-white">Student Verified</h1>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-400">Authenticated via College SSO / Supabase Auth</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-3 text-sm">
          <div>
            <span className="text-xs text-zinc-500 block uppercase font-medium">Roll Number</span>
            <span className="font-mono text-emerald-400 font-bold text-base">{rollNumber}</span>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block uppercase font-medium">College Email</span>
            <span className="text-zinc-200 font-medium break-all">{user.email}</span>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block uppercase font-medium">Campus</span>
            <Badge variant="info" className="mt-1">
              {campus}
            </Badge>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <form action={signOutAction}>
            <Button variant="outline" type="submit" className="w-full text-rose-400 hover:text-rose-300 hover:border-rose-500/50">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </form>

          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Return to Landing Page
          </Link>
        </div>
      </div>
    </main>
  );
}
