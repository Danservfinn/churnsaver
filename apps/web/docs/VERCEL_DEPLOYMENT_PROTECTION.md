# Vercel Deployment Protection Configuration

## Issue: 401 Errors on Public Pages

If your ChurnSaver deployment returns 401 for public pages (landing, pricing), this is caused by **Vercel Deployment Protection**.

## Solution Options

### Option 1: Disable Protection (Recommended for Development)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your ChurnSaver project
3. Navigate to **Settings** → **Deployment Protection**
4. Set protection to one of:
   - **Only Production Deployments** (protects only prod, previews are public)
   - **None** (all deployments are public)

### Option 2: Use Protection Bypass Secret

The `vercel.json` includes a protection bypass configuration:

```json
{
  "protectionBypass": [
    {
      "scope": "preview",
      "secret": "churnsaver-e2e-bypass-2025"
    }
  ]
}
```

To bypass protection in E2E tests, add the secret as a cookie or header:

```bash
# Using curl
curl -H "x-vercel-protection-bypass: churnsaver-e2e-bypass-2025" https://your-preview.vercel.app/

# In Playwright
await page.context().addCookies([{
  name: 'x-vercel-protection-bypass',
  value: 'churnsaver-e2e-bypass-2025',
  domain: '.vercel.app',
  path: '/'
}]);
```

### Option 3: Allow Specific Domains

In Vercel Dashboard → Settings → Deployment Protection:
1. Enable "Shareable Links"
2. Or add specific domains to the allowlist

## E2E Test Configuration

Update your E2E tests to include the bypass:

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': process.env.VERCEL_PROTECTION_BYPASS || 'churnsaver-e2e-bypass-2025',
    },
  },
});
```

Or set the environment variable:

```bash
export VERCEL_PROTECTION_BYPASS=churnsaver-e2e-bypass-2025
pnpm test:e2e
```

## Why This Happens

Vercel's Deployment Protection is a security feature that:
- Requires authentication for preview deployments
- Prevents unauthorized access to staging/preview URLs
- Is configured at the **project level** in Vercel dashboard

The `x-vercel-sso-protection: none` header in `vercel.json` only affects SSO-based protection, not Standard Protection.

## Recommended Setup

For ChurnSaver:

| Environment | Protection Setting |
|-------------|-------------------|
| Production | Enabled (Standard) |
| Preview | Bypass with secret |
| Local Dev | None (localhost) |

This allows:
- Secure production deployments
- Automated E2E testing of previews
- Easy local development
