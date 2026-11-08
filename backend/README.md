# Velto Backend

This directory houses all backend assets, database architecture, migrations, and automated verification suites for the Velto application.

## Directory Structure

```
backend/
├── supabase/
│   ├── migrations/          # 15 Canonical SQL migrations
│   │   ├── 01_foundation_schema.sql
│   │   ├── 02_canonical_request_types.sql
│   │   ├── 03_canonical_status_types.sql
│   │   ├── 04_atomic_request_acceptance.sql
│   │   ├── 05_trade_messages_chat.sql
│   │   ├── 06_trade_settlement_completion.sql
│   │   ├── 07_trade_ratings_reputation.sql
│   │   ├── 08_reports_and_admin_moderation.sql
│   │   ├── 09_final_security_hardening.sql
│   │   ├── 10_avatars_storage.sql
│   │   ├── 11_admin_full_access.sql
│   │   ├── 12_safety_reports_admin_view.sql
│   │   ├── 13_auth_hook_and_campus_enforcement.sql
│   │   ├── 14_shared_community_and_search.sql
│   │   └── 15_push_notifications.sql
│   └── schema.sql           # Base database schema
├── scripts/                 # Automated test & verification scripts
│   ├── test_campus_domain_enforcement.js
│   ├── test_milestone5.js
│   ├── test_milestone6.js
│   ├── test_milestone7.js
│   ├── test_milestone8.js
│   ├── test_milestone9.js
│   ├── test_milestone10_concurrency_and_lifecycle.js
│   ├── test_push_notifications.js
│   ├── verify_production_e2e.js
│   └── verify_cross_college_e2e.js
├── .env.example
├── .env.local
└── package.json
```

## Running Backend Verification Suites

From the project root:
```bash
npm run backend:test:campus
npm run backend:test:push
npm run backend:verify:e2e
```

Or from inside `backend/`:
```bash
cd backend
npm run test:campus
npm run test:milestone5
npm run test:push
```

