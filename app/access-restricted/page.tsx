import { signOutAction } from "@/lib/auth/actions";
import { checkUserRouting } from "@/lib/profile/actions";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access Restricted | Velto",
  description: "Account access restricted on Velto campus platform.",
};

export default async function AccessRestrictedPage() {
  const routing = await checkUserRouting();

  const isBanned = routing.profile?.is_banned;
  const title = isBanned ? "Account Suspended / Banned" : "Access Restricted";
  const message =
    routing.message ||
    "Your Velto campus account has been flagged or temporarily restricted due to trust & safety policy violations.";

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-zinc-900">
      <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 shadow-xl p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-zinc-950">{title}</h1>
          <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-500 space-y-1 text-left">
          <p className="font-semibold text-zinc-700">Need help or wish to appeal?</p>
          <p>
            Please contact your campus student administrator or support desk with
            your registered college email.
          </p>
        </div>

        <form action={signOutAction} className="pt-2">
          <Button variant="outline" type="submit" className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </form>
      </div>
    </main>
  );
}
