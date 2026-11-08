import { Suspense } from "react";
import { AuthView } from "@/components/auth/auth-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campus Authentication | Velto",
  description: "Sign up or sign in to Velto using your official college email.",
};

export default function AuthPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-md h-96 rounded-2xl bg-zinc-900/50 animate-pulse border border-zinc-800" />
        }
      >
        <AuthView />
      </Suspense>
    </main>
  );
}
