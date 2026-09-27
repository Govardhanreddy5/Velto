import {
  verifyAdminAccess,
  getAdminReports,
  getModerationAuditLogs,
  getAllStudentsAdmin,
  getAllRequestsAdmin,
  getAllTradesAdmin,
  getPlatformOverviewStats,
} from "@/lib/admin/actions";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Moderation | Velto",
  description: "Secure campus administrator moderation and dispute console.",
};

export default async function AdminPage() {
  const adminCheck = await verifyAdminAccess();

  // If unauthenticated, redirect to sign-in
  if (!adminCheck.user) {
    redirect("/auth?mode=admin");
  }

  // If user is authenticated but not an admin, conceal existence with notFound (404)
  if (!adminCheck.isAdmin) {
    notFound();
  }

  const [reports, auditLogs, students, requests, trades, stats] = await Promise.all([
    getAdminReports(),
    getModerationAuditLogs(),
    getAllStudentsAdmin(),
    getAllRequestsAdmin(),
    getAllTradesAdmin(),
    getPlatformOverviewStats(),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Student Dashboard
            </Link>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-600" />
              <span className="text-sm font-bold text-zinc-950">Velto Admin Console</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Campus Feed
            </Link>
            <Link
              href="/profile"
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Profile
            </Link>
          </div>
        </div>
      </header>

      {/* Main Admin Console */}
      <main className="max-w-6xl mx-auto px-6 pt-8">
        <AdminDashboard
          initialReports={reports}
          initialAuditLogs={auditLogs}
          initialStudents={students}
          initialRequests={requests}
          initialTrades={trades}
          initialStats={stats}
          adminEmail={adminCheck.user.email}
        />
      </main>
    </div>
  );
}
