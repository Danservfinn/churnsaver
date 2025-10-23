# Whop Development Proxy Setup

This document explains how to configure the Whop development proxy for local iframe testing.

## Overview

The Churn Saver app runs as an iframe within the Whop platform. To develop and test locally, you need to configure a development proxy that allows Whop to load your local Next.js app in an iframe.

## Prerequisites

1. Whop developer account and app created
2. Local Next.js app running on `http://localhost:3000`
3. ngrok or similar tunneling service (optional, for external webhook testing)

## Configuration Steps

### 1. Whop App Settings

In your Whop developer dashboard:

1. Go to your app's settings
2. Set the **App URL** to your local development URL:
   - Development: `http://localhost:3000`
   - Production: `https://your-domain.com`

3. Enable "Allow iframe embedding" in app settings
4. Configure webhook endpoints for testing (see webhook documentation)

### 2. Local Development Server

The Next.js app is configured to handle iframe requests. The app will:

- Accept `x-whop-user-token` headers for authentication
- Log iframe context information
- Handle CORS appropriately for iframe embedding

### 3. Authentication and Company Context

The Churn Saver app uses Whop iframe tokens for authentication and multi-tenant company scoping. Each request includes an `x-whop-user-token` header that contains:

- `app_id`: The Whop app identifier
- `company_id`: The creator/company identifier (may be same as app_id for single-tenant)
- `user_id`: The authenticated user identifier
- JWT signature for validation

**Token Validation:**
- Tokens are validated using HMAC with `WHOP_APP_SECRET`
- Invalid tokens result in fallback to `WHOP_APP_ID` with anonymous user
- All API endpoints extract `company_id` from the token for data scoping

**Local Development:**
For local testing without real Whop iframe:

1. Set environment variables:
   ```bash
   # Use app ID as company ID for single-tenant testing
   export WHOP_APP_ID="your-app-id"
   export WHOP_APP_SECRET="your-app-secret"
   ```

2. The app will work with fallback authentication when no token is provided
3. For testing specific company contexts, you can:
   - Set `x-company-id` header in webhook requests
   - Modify the auth helper for local overrides

**Production:**
- All requests must include valid `x-whop-user-token` header
- Company data is strictly scoped by `company_id`
- Settings and cases are isolated per company

### 4. Testing iframe Context

To test the app in iframe context locally:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. In your browser, you can simulate iframe behavior by:
   - Opening the app directly at `http://localhost:3000`
   - Using browser developer tools to simulate iframe headers
   - For API testing, include `x-whop-user-token` or rely on fallback auth

### 5. Webhook Testing

For webhook testing during development:

1. Use ngrok to expose your local webhook endpoint:
   ```bash
   ngrok http 3000
   ```

2. Update Whop webhook URLs to use the ngrok URL
3. Test webhook events using Whop's developer tools
4. For company-specific testing, include `x-company-id` header in webhook requests

### 6. Production Deployment

When deploying to production:

1. Set the App URL in Whop to your production domain
2. Ensure HTTPS is enabled
3. Update webhook URLs to production endpoints
4. Configure environment variables in production
5. Set up external cron service to call `/api/scheduler/reminders` endpoint

## Reminder Scheduler Operation

The Churn Saver uses a background scheduler to send T+2/T+4 reminders:

**Local Development:**
- Run `npm run cron start` to start the local scheduler (runs every minute)
- Use `npm run cron trigger` to manually trigger reminder processing
- Use `npm run cron status` to check scheduler status

**Production:**
- Set up an external cron service (e.g., cron-job.org, GitHub Actions, Vercel Cron)
- Configure it to POST to `https://your-domain.com/api/scheduler/reminders` every 5-15 minutes
- Include optional `SCHEDULER_API_KEY` for authentication
- The endpoint returns `{ processed, successful, failed, results }`

**Scheduler Logic:**
- Processes open recovery cases per company
- Sends reminders based on configured offsets (T+0, T+2, T+4)
- Applies incentives once per case
- Records attempt counts and timestamps
- Stops processing when cases are recovered or cancelled

## Common Issues

### CORS Issues
- Ensure the app handles iframe requests properly
- Check that `x-whop-user-token` headers are being processed

### Authentication
- Tokens are validated using HMAC with `WHOP_APP_SECRET`
- Invalid tokens fall back to anonymous access with `WHOP_APP_ID` as company

### Webhook Signatures
- Ensure webhook signature validation is working
- Test with sample webhook events from Whop

## Security Notes

- Never log sensitive information from iframe headers
- Validate webhook signatures properly
- Webhook timestamp validation: enforced with 5-minute skew protection in production
- Use HTTPS in production
- Store secrets securely

### Webhook Security

**Signature Validation:**
- Webhooks require valid HMAC-SHA256 signature with `WHOP_WEBHOOK_SECRET`
- Support for multiple signature header formats:
  - `x-whop-signature: sha256=<hex>`
  - `X-Whop-Signature: v1,<hex>`
  - `x-whop-signature: <hex>` (raw hex)
- Timing-safe comparison prevents timing attacks

**Timestamp Protection:**
- Whop webhooks include `x-whop-timestamp` headers for replay prevention
- 5-minute skew window enforced in production (disabled for local testing)
- Outside window → 401 rejection (helps prevent replay attacks)
- Timestamp validation only applied when header is present

**Rate Limiting:**
- Global webhook rate limit: 300/hour with fail-open behavior
- Duplicate processing prevention with idempotent event handling by `whop_event_id`
- Case actions rate limited: 30/minute per company using `case_action:{companyId}` keys
- Rate limit headers returned: `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset`
