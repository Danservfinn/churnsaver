#!/bin/bash
# Production Webhook Setup Script
# This script helps configure the production webhook for ChurnSaver

set -e

PRODUCTION_WEBHOOK_URL="https://churnsaver.vercel.app/api/webhooks/whop"
WEBHOOK_SECRET="${1:-ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e}"

echo "🔧 Production Webhook Setup"
echo "=========================="
echo ""
echo "Generated Webhook Secret:"
echo "$WEBHOOK_SECRET"
echo ""
echo "📋 Manual Steps Required:"
echo ""
echo "1. Go to Whop Dashboard:"
echo "   https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/apps/app_oU8bWaXOsDs6PO/webhooks/"
echo ""
echo "2. Click 'Create webhook' button"
echo ""
echo "3. Fill in the form:"
echo "   - URL: $PRODUCTION_WEBHOOK_URL"
echo "   - Secret: $WEBHOOK_SECRET"
echo "   - API Version: v1"
echo "   - Events: payment_failed, payment_succeeded, membership_activated, membership_deactivated"
echo ""
echo "4. Click 'Save' or 'Create'"
echo ""
echo "5. After creating the webhook, press Enter to continue with Vercel setup..."
read -r

echo ""
echo "🔐 Adding webhook secret to Vercel..."
echo ""

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Please install it:"
    echo "   npm i -g vercel"
    echo ""
    echo "Or manually add the environment variable:"
    echo "   Key: WHOP_WEBHOOK_SECRET"
    echo "   Value: $WEBHOOK_SECRET"
    echo "   Environment: Production, Preview"
    exit 1
fi

# Add environment variable to Vercel
echo "Adding WHOP_WEBHOOK_SECRET to Vercel production environment..."
vercel env add WHOP_WEBHOOK_SECRET production <<< "$WEBHOOK_SECRET" || {
    echo "⚠️  Failed to add via CLI. Please add manually:"
    echo "   1. Go to: https://vercel.com/dashboard"
    echo "   2. Select 'churnsaver' project"
    echo "   3. Settings → Environment Variables"
    echo "   4. Add:"
    echo "      Key: WHOP_WEBHOOK_SECRET"
    echo "      Value: $WEBHOOK_SECRET"
    echo "      Environment: Production, Preview"
    exit 1
}

echo ""
echo "✅ Webhook secret added to Vercel!"
echo ""
echo "🚀 Next step: Redeploy production"
echo "   Run: vercel deploy --prod"
echo ""
echo "Or redeploy via Vercel dashboard:"
echo "   https://vercel.com/dashboard"
echo ""
echo "✅ Setup complete!"

