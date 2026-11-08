# Velto — Campus Cash ↔ UPI Marketplace

Velto is a campus-only peer-to-peer physical cash ↔ UPI marketplace built for college students. It connects verified students who need physical cash (e.g. for campus canteens, auto-rickshaws, xerox shops) with students nearby who have physical cash and want an instant digital UPI bank credit.

> **Important Platform Boundary:** Velto does **not** hold money, operate wallets, escrow funds, or process bank transfers. Students exchange physical cash in hand and send UPI transfers directly to each other peer-to-peer at safe campus meetup spots.

---

## Clean Project Architecture

The codebase is organized into clear, dedicated top-level directories:

```
Velto/
├── frontend/               # Full Next.js Web App, UI, Server Actions & PWA
│   ├── app/                # Next.js App Router (pages, layout, routes)
│   ├── components/         # Modular React UI components (auth, feed, trades, ui, etc.)
│   ├── lib/                # Server Actions, Supabase client/server bindings, Web Push
│   ├── public/             # Static assets, PWA icons, Service Worker
│   ├── types/              # TypeScript database & authentication schemas
│   ├── middleware.ts       # Session refresh and routing guards
│   ├── next.config.ts      # Next.js configuration
│   ├── postcss.config.mjs  # Tailwind CSS v4 setup
│   ├── tsconfig.json       # Path aliases (@/* -> ./*)
│   ├── .env.local          # Local environment variables
│   └── package.json        # Frontend scripts and dependencies
│
├── backend/                # Database Migrations, SQL Schemas & Test Suites
│   ├── supabase/           # 15 Chronological SQL migrations & base schema
│   │   ├── migrations/
│   │   └── schema.sql
│   ├── scripts/            # Comprehensive automated verification suites
│   ├── .env.local          # Database connection details
│   ├── package.json        # Backend test runner configuration
│   └── README.md           # Backend documentation & test commands
│
├── .gitignore              # Unified git exclusion rules
├── package.json            # Root configuration with convenient workspace scripts
├── tsconfig.json           # Root TypeScript configuration
└── README.md               # Main project overview and setup instructions
```

---

## Quick Start & Running Commands

All commands can be run directly from the **project root**:

```bash
# Start frontend development server (http://localhost:3000)
npm run dev

# Run TypeScript typecheck across all files
npm run typecheck

# Build frontend for production
npm run build

# Run linting
npm run lint

# Run backend verification test suites
npm run backend:test:campus
npm run backend:test:auth
npm run backend:test:push
npm run backend:verify:e2e
```

Alternatively, you can work inside either directory individually:
- `cd frontend && npm run dev`
- `cd backend && npm run test:campus`

---

## Technology Stack

- **Frontend & App Engine**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Turbopack)
- **Language**: TypeScript (Strict mode)
- **Styling**: Tailwind CSS v4 & Lucide Icons
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Realtime WebSockets)
- **Notifications**: Web Push API (RFC 8291 / VAPID compliant service worker)
- **Hosting**: Vercel (Edge & Serverless Node.js runtime)

---

## Core Milestones Completed (1–11)

1. **Authentication**: Strict campus-domain email verification (`@vishnu.edu.in` for Vishnu Educational Society and `@svecw.edu.in` for Shri Vishnu Engineering College for Women), Postgres `Before User Created` Auth Hook, secure session cookies.
2. **Student Onboarding & Dashboard**: Roll number extraction, department, year, encrypted UPI ID.
3. **Database Foundation**: Forward-only schema migrations with PostgreSQL Row Level Security (RLS) and strict campus feed isolation.
4. **Request Creation & Realtime Feed**: Boundary-checked exchange requests (₹20 to ₹500, expiry timeouts, location hints, same-campus matching).
5. **Atomic Acceptance & Trade Creation**: Row-level `FOR UPDATE` PostgreSQL transaction preventing race conditions and cross-campus trades. Exactly 1 fulfiller per request.
6. **Private Realtime Trade Chat**: Isolated in-trade meetup coordination with WebSockets and RLS privacy guards.
7. **Two-Sided Settlement & Atomic Completion**: Independent confirmations from both students before trade completion.
8. **Campus Reputation & Trade History**: 1–5 star reviews, rolling average recalculation, tamper-proof history.
9. **Disputes & Secure Admin Moderation**: Issue reporting (`NO_SHOW`, `DID_NOT_RECEIVE_CASH`, etc.), hidden `/admin` console, confirmed account suspension/bans, immutable audit log.
10. **Final Hardening & Pilot Readiness**: Zero secrets in repo, concurrency race testing, comprehensive automated test suites.
11. **Multi-Campus Support & Domain Enforcement**: Strict dual-domain allowlist (`@vishnu.edu.in` & `@svecw.edu.in`), Supabase Before User Created Auth Hook, immutable campus profiles, and bidirectional feed isolation.

---

## Canonical Trade Types

- **`NEED_CASH`**:
  - Requester needs physical cash and pays via UPI.
  - Fulfiller hands over physical cash and receives UPI.
  - Settlement: Requester confirms *"I received cash"*; Fulfiller confirms *"I received UPI"*.
- **`HAVE_CASH_WANT_UPI`**:
  - Requester has physical cash and wants digital UPI into bank account.
  - Fulfiller pays via UPI and receives physical cash.
  - Settlement: Requester confirms *"I received UPI"*; Fulfiller confirms *"I received cash"*.

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Required variables:

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://xyzcompany.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key (RLS protected) | `sb_publishable_...` |
| `NEXT_PUBLIC_SITE_URL` | Site root URL for redirects | `http://localhost:3000` (local) or `https://velto.vercel.app` (prod) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key | `BEk4PRuGh...` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key (server-only) | `2CzXkk...` |
| `VAPID_SUBJECT` | Web Push contact mailto URI | `mailto:support@velto.local` |

---

## Supabase Database Migrations

All database schema, constraints, RLS policies, and RPC functions are organized in chronological forward-only migration scripts in [`backend/supabase/migrations/`](./backend/supabase/migrations/):

1. `01_foundation_schema.sql`: Base profiles, requests, trades, ratings, safety reports, RLS.
2. `02_canonical_request_types.sql`: Aligns trade type enum values with canonical types.
3. `03_canonical_status_types.sql`: Enables realtime feed broadcasting across campus peers.
4. `04_atomic_request_acceptance.sql`: PostgreSQL RPC `accept_exchange_request` with `FOR UPDATE` lock and same-campus verification.
5. `05_trade_messages_chat.sql`: Append-only chat messages with participant-only RLS.
6. `06_trade_settlement_completion.sql`: PostgreSQL RPC `confirm_trade_settlement` with two-sided atomic completion.
7. `07_trade_ratings_reputation.sql`: PostgreSQL RPC `submit_trade_rating` with auto rolling reputation calculation.
8. `08_reports_and_admin_moderation.sql`: Dispute reporting, `moderation_audit_logs`, trigger privilege protection, admin RPCs.
9. `09_final_security_hardening.sql`: Internal RPC reputation bypass authorization and secure `get_trade_partner_upi`.
10. `10_avatars_storage.sql`: Secure storage policies for student avatars.
11. `11_admin_full_access.sql`: Campus administrator moderation policies and trade visibility.
12. `12_safety_reports_admin_policy.sql`: Admin policy for reviewing student safety reports.
13. `13_auth_hook_and_campus_domains.sql`: `Before User Created` Auth Hook restricting signups strictly to `@vishnu.edu.in` and `@svecw.edu.in`, automatic campus assignment, and RLS campus feed isolation.
14. `14_shared_community_and_search.sql`: Shared community feed across partner campuses.
15. `15_push_notifications.sql`: Web Push subscription schema, RLS, and delivery tracking.
