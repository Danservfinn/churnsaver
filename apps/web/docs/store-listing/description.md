# ChurnSaver - Automated Payment Recovery for Whop

## Overview

ChurnSaver is an automated payment recovery system designed specifically for Whop marketplace creators. It helps you retain subscribers by automatically detecting failed payments, managing recovery cases, and sending timely reminders to recover lost revenue.

## Key Features

### 🔄 Automated Recovery Case Management
- Automatically creates recovery cases when payments fail
- Tracks case lifecycle from detection to recovery or closure
- Provides real-time visibility into recovery status

### 📧 Smart Reminder System
- Configurable multi-touch reminder sequences
- Customizable reminder schedules (default: Day 0, 2, 4 after failure)
- Supports both push notifications and direct messages

### 💰 Revenue Recovery Tracking
- Tracks recovered revenue with attribution
- Distinguishes between click-through and organic recoveries
- Provides recovery rate metrics and KPIs

### 📊 Analytics Dashboard
- Real-time recovery metrics and insights
- Case status tracking and management
- Revenue attribution analysis

### 🔒 Multi-Tenant Security
- Full data isolation per company/creator
- Row-Level Security (RLS) enforced at database level
- Secure webhook signature validation

## How It Works

1. **Detection**: Automatically detects failed payments via Whop webhooks
2. **Case Creation**: Creates recovery cases for each failed payment
3. **Reminder Sequence**: Sends automated reminders at configured intervals
4. **Recovery Tracking**: Monitors and attributes successful recoveries
5. **Analytics**: Provides insights into recovery performance

## Use Cases

- **SaaS Subscriptions**: Recover failed recurring payments
- **Membership Platforms**: Retain members with payment issues
- **Digital Products**: Reduce churn from payment failures
- **Marketplace Sellers**: Automate recovery workflows

## Technical Details

- **Architecture**: Serverless-first, event-driven design
- **Processing**: Cron-based event processing (low-cost launch mode)
- **Security**: End-to-end encryption, RLS tenant isolation
- **Integration**: Native Whop API integration

## Requirements

- Whop marketplace account
- Active Whop app installation
- Webhook events enabled: `payment_failed`, `payment_succeeded`, `membership_activated`, `membership_deactivated`

## Support

For support, questions, or feature requests, please contact us through the Whop app dashboard or visit our support page.

