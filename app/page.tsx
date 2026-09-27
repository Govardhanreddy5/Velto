import Link from "next/link";
import Image from "next/image";
import {
  Users,
  ArrowLeftRight,
  MapPin,
  ShieldCheck,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-950 font-sans">
              Velto
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-700 transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-blue-600"
            >
              Home
            </Link>
            <a href="#about" className="hover:text-zinc-950 transition-colors">
              About
            </a>
            <a href="#how-it-works" className="hover:text-zinc-950 transition-colors">
              How It Works
            </a>
            <a href="#faq" className="hover:text-zinc-950 transition-colors">
              FAQ
            </a>
          </nav>

          {/* Action CTA */}
          <div className="flex items-center gap-3">
            <Link
              href="/auth?mode=signin"
              className="hidden sm:inline-block text-sm font-medium text-zinc-700 hover:text-zinc-950 px-3 py-2 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth?mode=signup"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 md:pt-16 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100">
              Campus Only
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-tight text-zinc-950 leading-[1.15]">
              Exchange Cash and UPI, on Campus
            </h1>

            <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-lg">
              Velto helps verified college students find each other to exchange
              physical cash and UPI quickly and safely within their campus.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/10 text-sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/auth?mode=signin"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-semibold transition-all text-sm"
              >
                Student Sign In
              </Link>
            </div>
          </div>

          {/* Right Hero Image */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-zinc-100 aspect-[16/10] bg-zinc-100">
              <Image
                src="/images/campus_hero.jpg"
                alt="Students walking together on campus"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section id="about" className="border-y border-zinc-100 bg-zinc-50/60 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-950">Verified Students</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Only college students can join with institutional email.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-950">Quick Exchange</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Find someone nearby in minutes across campus.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-950">On Campus</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Meet at a safe place inside your college (e.g. Canteen, Library).
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-950">Simple & Safe</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Built for students, by students. Direct P2P transfers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            How Velto Works
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 max-w-xl mx-auto">
            A simple 4-step process to exchange cash and UPI within your campus.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          {/* Step 1 */}
          <div className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-sm">
              1
            </div>
            <h3 className="font-bold text-base text-zinc-950">Post a Request</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Choose if you need cash or want UPI, enter the amount (₹20–₹500),
              location and time.
            </p>
          </div>

          {/* Step 2 */}
          <div className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-sm">
              2
            </div>
            <h3 className="font-bold text-base text-zinc-950">Find a Match</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Verified students nearby can see your request on the live feed and
              accept it.
            </p>
          </div>

          {/* Step 3 */}
          <div className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-sm">
              3
            </div>
            <h3 className="font-bold text-base text-zinc-950">Meet & Exchange</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Chat in the private trade room, meet at the agreed spot and
              complete the cash & UPI exchange.
            </p>
          </div>

          {/* Step 4 */}
          <div className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-sm">
              4
            </div>
            <h3 className="font-bold text-base text-zinc-950">Confirm & Rate</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Both sides confirm the completed trade and rate each other to
              build campus reputation.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="border-t border-zinc-100 bg-zinc-50/50 py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center space-y-2 mb-12">
            <h2 className="text-2xl font-bold text-zinc-950 sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-zinc-500">
              Everything you need to know about peer-to-peer campus exchanges.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm space-y-2">
              <h3 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                Does Velto hold or process my money?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed pl-6">
                No. Velto never holds money, processes payments, or operates a
                wallet. Students exchange cash directly in person and send UPI
                directly via their own UPI apps (Google Pay, PhonePe, Paytm).
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm space-y-2">
              <h3 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                Who can use Velto?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed pl-6">
                Only verified students with an active institutional college email
                (e.g., @vishnu.edu.in) can join. Outsiders cannot create accounts
                or view trade requests.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-zinc-200/80 shadow-sm space-y-2">
              <h3 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                What is the exchange limit?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed pl-6">
                To keep exchanges safe, fast, and student-focused, requests are
                capped between ₹20 and ₹500.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 py-8 bg-white text-center text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Velto — Campus Cash ↔ UPI Exchange. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="hover:text-zinc-800">
              How It Works
            </a>
            <a href="#faq" className="hover:text-zinc-800">
              Safety & FAQ
            </a>
            <Link href="/auth?mode=signin" className="hover:text-zinc-800 font-medium text-blue-600">
              Student Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
