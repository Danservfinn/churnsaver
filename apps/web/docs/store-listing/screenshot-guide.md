# Screenshot Guide for Whop App Store

## Generated Screenshots

All screenshots have been automatically generated and are ready for Whop App Store submission.

**Location:** `apps/web/docs/store-listing/screenshots/`

### Available Screenshots

1. **01-homepage-hero.png**
   - **Description:** Homepage hero section with main call-to-action
   - **Shows:** "Stop Churn, Save Revenue" headline, feature overview, and CTA buttons
   - **Use Case:** Main app showcase image

2. **02-homepage-features.png**
   - **Description:** Homepage features showcase section
   - **Shows:** Four key features (Push Notifications, Direct Messages, Smart Incentives, Analytics)
   - **Use Case:** Feature highlights

3. **03-dashboard-overview.png**
   - **Description:** Dashboard overview with KPIs and recovery cases
   - **Shows:** Recovery metrics, active cases table, and dashboard navigation
   - **Use Case:** Main dashboard view

4. **04-settings-page.png**
   - **Description:** Settings page showing configuration options
   - **Shows:** Communication channels, incentive strategy, reminder schedule
   - **Use Case:** Configuration interface

## Screenshot Specifications

- **Format:** PNG
- **Resolution:** 1920x1080 (viewport) or full page
- **Source:** Staging environment (`churnsaver-staging.vercel.app`)
- **Authentication:** Uses QA demo bypass mode (`?qa_demo=true`)

## Regenerating Screenshots

To regenerate screenshots with updated content:

```bash
cd apps/web
pnpm exec tsx scripts/generate-store-screenshots.ts
```

Or with custom base URL:

```bash
SCREENSHOT_BASE_URL=https://churnsaver.vercel.app pnpm exec tsx scripts/generate-store-screenshots.ts
```

## Using Screenshots in Whop App Store

1. **Upload to Whop Dashboard:**
   - Navigate to your app's store listing page
   - Upload screenshots in the "Screenshots" section
   - Recommended order: Hero → Features → Dashboard → Settings

2. **Screenshot Requirements:**
   - Minimum resolution: 1280x720
   - Maximum file size: 5MB per image
   - Format: PNG or JPG
   - Our screenshots meet all requirements ✅

3. **Best Practices:**
   - Use homepage hero as the first/main screenshot
   - Include dashboard to show functionality
   - Show settings to demonstrate configurability
   - Consider adding mobile-responsive views if available

## Alternative: Manual Screenshots

If you prefer to take manual screenshots:

1. **Navigate to staging:** https://churnsaver-staging.vercel.app/?qa_demo=true
2. **Take screenshots of:**
   - Homepage (hero section)
   - Homepage (features section - scroll down)
   - Dashboard: https://churnsaver-staging.vercel.app/dashboard/demo-company?qa_demo=true
   - Settings: https://churnsaver-staging.vercel.app/settings?qa_demo=true

3. **Use browser developer tools:**
   - Chrome DevTools: Cmd+Shift+P → "Capture screenshot"
   - Or use browser extensions like "Full Page Screen Capture"

## Notes

- Screenshots are generated from staging environment with demo data
- All screenshots use QA demo bypass mode for consistent access
- Screenshots show the actual UI as users will see it
- For production screenshots, update `SCREENSHOT_BASE_URL` to production URL

---

**Last Updated:** December 13, 2024  
**Status:** ✅ Screenshots generated and ready

