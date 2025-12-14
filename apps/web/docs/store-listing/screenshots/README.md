# Store Listing Screenshots

Generated: 2025-12-13T03:12:00.375Z

## Screenshots

### 1. 01 Homepage Hero

**File:** `01-homepage-hero.png`  
**Description:** Homepage hero section with main CTA  
**URL:** https://churnsaver-staging.vercel.app/?qa_demo=true


### 2. 02 Homepage Features

**File:** `02-homepage-features.png`  
**Description:** Homepage features showcase section  
**URL:** https://churnsaver-staging.vercel.app/?qa_demo=true


### 3. 03 Dashboard Overview

**File:** `03-dashboard-overview.png`  
**Description:** Dashboard overview with KPIs and recovery cases  
**URL:** https://churnsaver-staging.vercel.app/dashboard/demo-company?qa_demo=true


### 4. 04 Settings Page

**File:** `04-settings-page.png`  
**Description:** Settings page showing configuration options  
**URL:** https://churnsaver-staging.vercel.app/settings?qa_demo=true



## Usage

These screenshots are intended for Whop App Store submission. They showcase:

- Homepage with hero section and features
- Dashboard with recovery cases and KPIs
- Settings page with configuration options

## Requirements

- Format: PNG
- Resolution: 1920x1080 (or full page)
- File size: < 5MB per image

## Regenerating Screenshots

To regenerate screenshots, run:

```bash
cd apps/web
pnpm tsx scripts/generate-store-screenshots.ts
```

Or with custom base URL:

```bash
SCREENSHOT_BASE_URL=https://churnsaver-staging.vercel.app pnpm tsx scripts/generate-store-screenshots.ts
```
