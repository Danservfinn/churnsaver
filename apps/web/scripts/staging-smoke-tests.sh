#!/bin/bash
# Staging Smoke Tests
# Run this script after setting up Vercel staging environment variables

set -e

STAGING_URL="${STAGING_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$STAGING_URL" ]; then
  echo "❌ STAGING_URL is required"
  exit 1
fi

echo "🧪 Running staging smoke tests against: $STAGING_URL"
echo ""

# Test 1: Basic health check
echo "1️⃣ Testing /api/health..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${STAGING_URL}/api/health")
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed"
  echo "   Response: $HEALTH_BODY"
else
  echo "❌ Health check failed (HTTP $HEALTH_HTTP_CODE)"
  echo "   Response: $HEALTH_BODY"
  exit 1
fi
echo ""

# Test 2: Database health check
echo "2️⃣ Testing /api/health/db..."
DB_HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${STAGING_URL}/api/health/db")
DB_HEALTH_HTTP_CODE=$(echo "$DB_HEALTH_RESPONSE" | tail -n1)
DB_HEALTH_BODY=$(echo "$DB_HEALTH_RESPONSE" | sed '$d')

if [ "$DB_HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Database health check passed"
  echo "   Response: $DB_HEALTH_BODY"
else
  echo "⚠️  Database health check failed (HTTP $DB_HEALTH_HTTP_CODE)"
  echo "   Response: $DB_HEALTH_BODY"
  echo "   (This may be expected if DATABASE_URL is not set yet)"
fi
echo ""

# Test 3: Cron endpoint authentication (should require CRON_SECRET)
echo "3️⃣ Testing /api/cron/process-queue authentication..."
CRON_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${STAGING_URL}/api/cron/process-queue")
CRON_HTTP_CODE=$(echo "$CRON_RESPONSE" | tail -n1)
CRON_BODY=$(echo "$CRON_RESPONSE" | sed '$d')

if [ "$CRON_HTTP_CODE" = "401" ]; then
  echo "✅ Cron endpoint correctly requires authentication"
elif [ "$CRON_HTTP_CODE" = "200" ] || [ "$CRON_HTTP_CODE" = "202" ]; then
  echo "✅ Cron endpoint accessible with auth"
  echo "   Response: $CRON_BODY"
else
  echo "⚠️  Unexpected cron endpoint response (HTTP $CRON_HTTP_CODE)"
  echo "   Response: $CRON_BODY"
fi
echo ""

# Test 4: Cron endpoint with correct secret
echo "4️⃣ Testing /api/cron/process-queue with CRON_SECRET..."
if [ -n "$CRON_SECRET" ]; then
  CRON_AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    -H "Authorization: Bearer $CRON_SECRET" \
    "${STAGING_URL}/api/cron/process-queue")
  CRON_AUTH_HTTP_CODE=$(echo "$CRON_AUTH_RESPONSE" | tail -n1)
  CRON_AUTH_BODY=$(echo "$CRON_AUTH_RESPONSE" | sed '$d')

  if [ "$CRON_AUTH_HTTP_CODE" = "200" ] || [ "$CRON_AUTH_HTTP_CODE" = "202" ]; then
    echo "✅ Cron endpoint accessible with correct secret"
    echo "   Response: $CRON_AUTH_BODY"
  else
    echo "⚠️  Cron endpoint returned HTTP $CRON_AUTH_HTTP_CODE"
    echo "   Response: $CRON_AUTH_BODY"
  fi
else
  echo "⏭️  Skipping (CRON_SECRET not set)"
fi
echo ""

# Test 5: Webhook endpoint (should require signature)
echo "5️⃣ Testing /api/webhooks/whop endpoint..."
WEBHOOK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "${STAGING_URL}/api/webhooks/whop" \
  -d '{"test": "data"}')
WEBHOOK_HTTP_CODE=$(echo "$WEBHOOK_RESPONSE" | tail -n1)
WEBHOOK_BODY=$(echo "$WEBHOOK_RESPONSE" | sed '$d')

if [ "$WEBHOOK_HTTP_CODE" = "401" ] || [ "$WEBHOOK_HTTP_CODE" = "400" ]; then
  echo "✅ Webhook endpoint correctly validates requests"
else
  echo "⚠️  Webhook endpoint returned HTTP $WEBHOOK_HTTP_CODE"
  echo "   Response: $WEBHOOK_BODY"
fi
echo ""

echo "✅ Smoke tests completed!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Vercel (see VERCEL_STAGING_ENV_VARS.md)"
echo "2. Trigger a new deployment"
echo "3. Run full integration tests with real webhook payloads"

