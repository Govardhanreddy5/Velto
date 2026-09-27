# Velto

Velto is a campus-focused P2P cash ↔ UPI exchange platform.

It is designed to connect verified college students who need physical cash with students nearby who can provide cash in exchange for an instant UPI digital transfer.

---

### Current Status

Project initialization / foundation setup.

---

### Technology

* **Next.js** (App Router)
* **TypeScript**
* **Tailwind CSS**
* **Supabase**
* **PostgreSQL**
* **Vercel**

---

### Getting Started

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Environment Variables

Copy `.env.example` to `.env.local` and provide your Supabase credentials:

```bash
cp .env.example .env.local
```

Variables required:
* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### 4. Build for Production

```bash
npm run build
```

---

### Development Approach

The application will be developed incrementally.

Future milestones will include:

1. Authentication
2. College verification
3. User onboarding
4. Request creation
5. Request feed
6. Request acceptance
7. Trade room
8. Chat
9. Cash + UPI exchange flow
10. Trade confirmation
11. Ratings
12. Reporting
13. Admin dashboard
14. Trust and safety
15. Production deployment
