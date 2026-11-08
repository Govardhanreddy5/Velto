# Velto Frontend

This directory contains the Next.js full-stack frontend application for Velto, including all pages, UI components, Next.js server actions, PWA capabilities, and Supabase client bindings.

## Directory Structure

```
frontend/
├── app/                     # Next.js App Router (pages, layout, routes)
│   ├── (auth, feed, dashboard, trades, profile, admin, onboarding, etc.)
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── manifest.ts
├── components/              # Modular React UI components
│   ├── admin/
│   ├── auth/
│   ├── feed/
│   ├── onboarding/
│   ├── profile/
│   ├── pwa/
│   ├── requests/
│   ├── trades/
│   └── ui/
├── lib/                     # Server Actions, Supabase clients, Push services
│   ├── admin/
│   ├── auth/
│   ├── profile/
│   ├── push/
│   ├── reports/
│   ├── requests/
│   ├── supabase/
│   └── trades/
├── public/                  # Static assets, PWA icons, Service Worker
│   ├── icons/
│   ├── images/
│   └── sw.js
├── types/                   # TypeScript interfaces & database schemas
│   ├── auth.ts
│   ├── database.ts
│   └── index.ts
├── middleware.ts            # Route protection and session refresh middleware
├── next.config.ts           # Next.js configuration
├── postcss.config.mjs       # Tailwind CSS v4 PostCSS setup
├── tsconfig.json            # Path alias mapping (@/* -> ./*)
├── .env.local               # Local environment variables
└── package.json
```

## Running the Frontend

From the project root:
```bash
npm run dev
```

Or from inside `frontend/`:
```bash
cd frontend
npm run dev
```

