---
title: Module Index
link: module-index
type: code_index
created_at: 2025-12-31
uuid: a1b2c3d4-idx-0001
tags: [structure, files, modules]
---

# Module Index

## Directory Structure

```
apps/web/src/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   ├── dashboard/            # Dashboard pages
│   ├── messages/             # Message templates
│   ├── pricing/              # Pricing page
│   ├── settings/             # Configuration
│   ├── privacy/              # Privacy policy
│   ├── terms/                # Terms of service
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Landing page
│   └── not-found.tsx         # 404 page
│
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── layouts/              # Layout components
│   │   ├── AppHeader.tsx     # Navigation header
│   │   ├── MainLayout.tsx    # Standalone layout
│   │   └── WhopAppLayout.tsx # Iframe layout
│   ├── dashboard/            # Dashboard components
│   ├── landing/              # Landing page components
│   ├── messages/             # Message components
│   └── pricing/              # Pricing components
│
├── lib/
│   ├── context/
│   │   └── whop.tsx          # Auth context
│   ├── whop/
│   │   ├── sdk.ts            # Whop SDK wrapper
│   │   └── webhookValidator.ts
│   ├── qaDemo.ts             # QA demo system
│   ├── env.ts                # Environment utils
│   ├── utils.ts              # General utilities
│   └── navigation.ts         # Nav config
│
├── services/
│   ├── cases.ts              # Case management
│   ├── subscriptions.ts      # Subscription logic
│   ├── eventProcessor.ts     # Webhook processing
│   └── reminderScheduling.ts # Notification scheduling
│
├── server/
│   └── middleware/
│       └── rateLimit.ts      # Rate limiting
│
└── styles/
    ├── globals.css           # Global styles
    └── backgrounds.css       # Premium effects
```

## Key Entry Points

| Purpose | File |
|---------|------|
| App entry | `src/app/layout.tsx` |
| Landing page | `src/app/page.tsx` |
| Dashboard | `src/app/dashboard/[companyId]/DashboardClient.tsx` |
| Auth context | `src/lib/context/whop.tsx` |
| Webhooks | `src/app/api/webhooks/whop/route.ts` |
| QA Demo | `src/lib/qaDemo.ts` |
