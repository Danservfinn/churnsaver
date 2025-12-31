---
title: Dev Commands
link: dev-commands
type: cheatsheet
created_at: 2025-12-31
uuid: a1b2c3d4-cheat-0001
tags: [cli, dev, test, commands]
---

# Development Commands

## Quick Reference

```bash
# Start development
cd apps/web
pnpm dev

# Run tests
pnpm test              # All tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage

# Build
pnpm build             # Production build
pnpm lint              # Linting

# Deploy
vercel --prod          # Production deploy
```

## Testing Commands

```bash
# Specific test suites
pnpm test:security     # Security tests
pnpm test:webhooks     # Webhook tests
pnpm test:rls          # RLS tests
pnpm test:e2e          # E2E tests

# Single file
pnpm test path/to/test.ts
```

## Database Commands

```bash
# Migrations
pnpm db:migrate        # Run migrations
pnpm db:setup-role     # Setup DB role

# Supabase
npx supabase start     # Local Supabase
npx supabase db push   # Push migrations
```

## QA Demo Mode

```bash
# Enable via env
QA_DEMO_BYPASS=true pnpm dev

# Or via URL
http://localhost:3000/dashboard?qa_demo=true

# Or via localStorage
localStorage.setItem('qa_demo_bypass', 'true')
```

## Git Workflow

```bash
# Feature branch
git checkout -b feat/feature-name

# Commit
git add -A
git commit -m "feat: description"

# Push
git push origin feat/feature-name
```

## Vercel CLI

```bash
vercel                 # Preview deploy
vercel --prod          # Production deploy
vercel logs            # View logs
vercel env pull        # Pull env vars
```

## Debugging

```bash
# Enable debug logs
DEBUG=* pnpm dev

# Check health
curl http://localhost:3000/api/health

# Check auth
curl http://localhost:3000/api/health/context
```
