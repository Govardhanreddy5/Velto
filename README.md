# Velto — Campus Cash ↔ UPI Marketplace

Velto is a campus-only peer-to-peer physical cash ↔ UPI marketplace built for college students. It connects verified students who need physical cash (e.g. for campus canteens, auto-rickshaws, xerox shops) with students nearby who have physical cash and want an instant digital UPI bank credit.

> **Important Platform Boundary:** Velto does **not** hold money, operate wallets, escrow funds, or process bank transfers. Students exchange physical cash in hand and send UPI transfers directly to each other peer-to-peer at safe campus meetup spots.

---

## Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Turbopack)
- **Language**: TypeScript (Strict mode)
- **Styling**: Tailwind CSS & Lucide Icons
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Realtime WebSockets)
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

---

## Supabase Database Migrations (In Execution Order)

All database schema, constraints, RLS policies, and RPC functions are organized in chronological forward-only migration scripts in [`supabase/migrations/`](./supabase/migrations/):

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

---

## How to Promote the First Campus Administrator

By default, all registered students have `is_admin = FALSE`. Non-admins accessing `/admin` receive a standard `404 Not Found` response.

To promote an initial authorized student to an administrator:
1. Open your Supabase Dashboard -> **SQL Editor**.
2. Run:
```sql
UPDATE public.profiles
SET is_admin = TRUE
WHERE email = 'your_college_email@vishnu.edu.in'; -- or your_college_email@svecw.edu.in
```
3. That user will now see the **Admin Console** badge in their profile/dashboard and can access `/admin`.

---

## Automated Test Suites

Run test suites directly using Node.js against your Supabase instance:

```bash
# Milestone 7: Two-sided trade settlement & completion tests (12 tests)
$env:NODE_PATH="node_modules"; node scripts/test_milestone7.js

# Milestone 8: Ratings, reputation calculation & constraints (16 tests)
$env:NODE_PATH="node_modules"; node scripts/test_milestone8.js

# Milestone 9: Reporting, dispute resolution & admin moderation (24 tests)
$env:NODE_PATH="node_modules"; node scripts/test_milestone9.js

# Milestone 10: Full lifecycle, critical concurrency race & edge cases (23 tests)
$env:NODE_PATH="node_modules"; node scripts/test_milestone10_concurrency_and_lifecycle.js
```

---

## Deployment Guide (Vercel)

### 1. Supabase Dashboard Settings
1. Navigate to **Authentication** -> **URL Configuration**:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: Add `https://your-app.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.
2. Navigate to **Database** -> **Replication**:
   - Ensure `exchange_requests` and `trade_messages` are in `supabase_realtime` publication.

### 2. Vercel Deployment
1. Connect your GitHub repository to Vercel.
2. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://your-app.vercel.app`
3. Click **Deploy**. Next.js Turbopack will compile all static and dynamic routes.

---

## Small Real-World Pilot Launch Checklist (20–50 Students)

- [x] **Zero Secrets in Repository**: No private service-role keys or `.env` files committed.
- [x] **Database Constraints**: Request amounts strictly enforced between ₹20 and ₹500.
- [x] **Race Condition Guard**: Atomic request acceptance verified under concurrent traffic.
- [x] **Private Data Isolation**: Student UPI IDs, personal emails, and chat logs protected by RLS.
- [x] **Anti-Privilege Escalation**: Trigger prevents users from making themselves administrators or unbanning accounts.
- [x] **Real-time Synchronization**: Supabase Realtime enabled for feed updates and in-trade chat.
- [x] **Dispute Resolution**: Active and completed trades support immediate issue reporting to campus admins.
- [x] **Designated Safe Meetup Spots**: Prominently display public campus spots (e.g. Canteen, Central Library Desk).
