# Whop Development Proxy Setup

This document explains how to configure the Whop development proxy for local iframe testing.

## Prerequisites

1. Whop developer account and app created
2. Local Next.js app running on `http://localhost:3000`
3. ngrok or similar tunneling service (optional, for external webhook testing)

### 1. Whop App Settings

In your Whop developer dashboard:

1. Go to your app's settings
2. Set the **App URL** to your local development URL:
   - Development: `http://localhost:3000`
   - Production: `https://your-domain.com`

3. Enable "Allow iframe embedding" in app settings
4. Configure webhook endpoints for testing (see webhook documentation)

## Environment Configuration

### Required Environment Variables

The application requires the following Whop credentials:

```bash
# Primary App Credentials
NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXOsDs6PO
WHOP_API_KEY=X-Y-nTi5c2M8Yp8MpqsSdyF2w67WpI2Sr8YcLufQqnA

# Default Context (for scheduled jobs and fallbacks)
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_IJ6DUru5He0hG
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_hqNeRcxEMkuyOL

# Webhook Security
WHOP_WEBHOOK_SECRET=your_webhook_secret_from_dashboard

# Legacy Compatibility (automatically aliased)
WHOP_APP_ID=app_oU8bWaXOsDs6PO
```

### Setup Steps

1. Copy environment template to `.env.local`:
   ```bash
   # From apps/web directory
   cp env.example .env.local
   # Or for minimal Whop template setup:
   cp env.development.template .env.local
   ```

2. Update `.env.local` with your actual Whop credentials from the dashboard

3. The environment schema automatically:
   - Aliases `WHOP_APP_ID` to `NEXT_PUBLIC_WHOP_APP_ID`
   - Uses `NEXT_PUBLIC_WHOP_COMPANY_ID` as default company context
   - Uses `NEXT_PUBLIC_WHOP_AGENT_USER_ID` as default sender for notifications

### 3. Authentication and Company Context

The Churn Saver app uses Whop iframe tokens for authentication and multi-tenant company scoping. Each request includes an `x-whop-user-token` header that contains:

- `app_id`: The Whop app identifier
- `company_id`: The creator/company identifier (may be same as app_id for single-tenant)
- `user_id`: The authenticated user identifier
- JWT signature for validation

**Token Validation:**
- Tokens are validated using the Whop SDK with WHOP_API_KEY
- Invalid tokens result in fallback to `NEXT_PUBLIC_WHOP_COMPANY_ID` with anonymous user
- All API endpoints extract `company_id` from the token for data scoping

**Local Development:**
For local testing without real Whop iframe:

1. Set environment variables as shown above

2. The app will work with fallback authentication when no token is provided:
   - Company context defaults to `NEXT_PUBLIC_WHOP_COMPANY_ID`
   - User defaults to anonymous
   - Notifications use `NEXT_PUBLIC_WHOP_AGENT_USER_ID` as sender

3. For testing specific company contexts, you can:
   - Set `x-company-id` header in webhook requests
   - Use the Whop dev proxy to provide realistic token context

**Production:**
- All requests must include valid `x-whop-user-token` header
- Company data is strictly scoped by `company_id`
- Settings and cases are isolated per company

## Running the Application

### Development Mode

```bash
# Using pnpm (recommended)
pnpm dev

# The dev script uses whop-proxy automatically:
# "dev": "whop-proxy --command 'next dev --turbopack'"
```

The app will start on `http://localhost:3000` and automatically reload when environment variables change. The `whop-proxy` command automatically configures the iframe context for local development.

### Testing in Whop Iframe

1. Configure your Whop app's base URL to `http://localhost:3000`
2. Install the app in a test Whop community
3. Access the app through the Whop dashboard
4. The iframe will automatically provide authentication context

### Webhook Testing

#### Local Webhook Testing

1. Ensure `WHOP_WEBHOOK_SECRET` is set in `.env.local`
2. Start the dev server: `npm run dev`
3. Use a test script or curl to send webhooks:

```bash
# Example webhook test
node test-webhook.js
```

#### Production Webhook Testing

For testing webhooks from Whop in local development:

1. Use ngrok to create a public URL:
   ```bash
   ngrok http 3000
   ```

2. Configure the ngrok URL in your Whop app webhook settings
3. Webhooks from Whop will be forwarded to your local instance

### Webhook Signatures
- Ensure webhook signature validation is working
- Test with sample webhook events from Whop
- In development, signature validation is skipped if `WHOP_WEBHOOK_SECRET` is not set
- In production, signature validation is always enforced

## Troubleshooting

### Missing Credentials

If you see errors about missing credentials:

1. Verify `.env.local` exists and contains all required variables
2. Check that values are not empty or placeholder text
3. Restart the dev server after changing environment variables

### Token Verification Failures

If token verification is failing:

1. Verify `WHOP_API_KEY` is correct
2. Check that `NEXT_PUBLIC_WHOP_APP_ID` matches your app
3. Review security logs for specific error messages

### Webhook Signature Failures

If webhooks are being rejected:

1. Verify `WHOP_WEBHOOK_SECRET` matches the value in Whop dashboard
2. Check webhook signature format in logs
3. Ensure webhook body is not being modified before verification
