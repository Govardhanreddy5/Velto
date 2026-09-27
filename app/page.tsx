import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-6 py-12">
      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Foundation Setup
        </div>

        <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
          Velto
        </h1>

        <p className="text-xl font-medium text-emerald-400 sm:text-2xl">
          Campus-to-campus cash ↔ UPI exchange.
        </p>

        <p className="text-zinc-400 text-base leading-relaxed sm:text-lg">
          Velto is intended to connect verified students who need physical cash
          with students who can provide cash in exchange for UPI payments. Fast,
          secure, and campus-friendly peer-to-peer exchanges.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth?mode=signup"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 text-center cursor-pointer"
          >
            Get Started (Sign Up)
          </Link>
          <Link
            href="/auth?mode=signin"
            className="w-full sm:w-auto px-6 py-3 rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 active:scale-95 transition-all text-center cursor-pointer"
          >
            Student Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
