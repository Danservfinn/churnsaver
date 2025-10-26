# Webhook Integration Guide

Webhooks enable real-time communication between Churn Saver and external systems, providing instant notifications about recovery events, incentive applications, and system updates.

## Overview

### What are Webhooks?

Webhooks are HTTP callbacks that notify external systems when specific events occur in Churn Saver. Instead of polling for updates, your application receives real-time notifications.

### Use Cases

- **CRM Integration**: Update customer records when recovery cases are created or resolved
- **Email Marketing**: Trigger personalized email sequences based on recovery events
- **Analytics Systems**: Send events to analytics platforms for real-time tracking
- **Notification Systems**: Alert internal teams about high-priority recovery cases
- **External Workflows**: Trigger automation workflows in tools like Zapier or Integromat

## Setup

### Creating Webhook Endpoints

#### Step 1: Configure Webhook URL

1. Log into your Churn Saver dashboard
2. Navigate to **Settings** → **Integrations** → **Webhooks**
3. Click **"Add Webhook"**
4. Enter your endpoint URL: `https://your-app.com/webhooks/churn-saver`

#### Step 2: Generate Webhook Secret

```bash
# Generate a secure random string for webhook signing
openssl rand -hex 32
# Output: a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890
```

Store this secret securely - it will be used to verify webhook authenticity.

#### Step 3: Select Events

Choose which events you want to receive:

```json
{
  "events": [
    "case.created",
    "case.updated",
    "case.recovered",
    "case.lost",
    "incentive.applied",
    "incentive.expired",
    "customer.risk_changed"
  ]
}
```

### Security Configuration

#### Webhook Signature Verification

All webhooks include an `X-Webhook-Signature` header for verification:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Usage in webhook handler
app.post('/webhooks/churn-saver', (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const payload = JSON.stringify(req.body);

  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
});
```

#### Security Best Practices

- **Always verify signatures** before processing webhooks
- **Use HTTPS** for webhook endpoints
- **Implement rate limiting** to prevent abuse
- **Log webhook attempts** for debugging
- **Handle duplicate events** gracefully

## Event Types

### Recovery Case Events

#### `case.created`

Triggered when a new recovery case is automatically created.

```json
{
  "event": "case.created",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T10:30:00Z",
  "data": {
    "case": {
      "id": "case_12345",
      "user_id": "user_67890",
      "status": "active",
      "risk_level": "high",
      "trigger_event": {
        "type": "payment_failed",
        "timestamp": "2025-10-25T10:25:00Z",
        "amount": 29.99,
        "currency": "USD",
        "reason": "insufficient_funds"
      },
      "recovery_strategy": {
        "priority": 8,
        "channels": ["email", "sms"],
        "estimated_value": 299.99
      },
      "customer": {
        "id": "user_67890",
        "email": "customer@example.com",
        "name": "John Doe",
        "lifetime_value": 1250.00,
        "plan": "Pro",
        "signup_date": "2024-01-15T00:00:00Z"
      }
    }
  }
}
```

#### `case.updated`

Triggered when case status or details change.

```json
{
  "event": "case.updated",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T14:45:00Z",
  "data": {
    "case": { ... },
    "changes": {
      "status": {
        "from": "active",
        "to": "recovered"
      },
      "updated_by": "system",
      "notes": "Customer responded positively to incentive"
    }
  }
}
```

#### `case.recovered`

Triggered when a customer is successfully recovered.

```json
{
  "event": "case.recovered",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T15:30:00Z",
  "data": {
    "case": { ... },
    "recovery_details": {
      "recovered_at": "2025-10-25T15:30:00Z",
      "recovery_method": "incentive_redemption",
      "incentive_used": "inc_12345",
      "time_to_recovery": 300, // minutes
      "revenue_recovered": 29.99
    }
  }
}
```

#### `case.lost`

Triggered when a recovery case is marked as permanently lost.

```json
{
  "event": "case.lost",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T20:00:00Z",
  "data": {
    "case": { ... },
    "loss_details": {
      "lost_at": "2025-10-25T20:00:00Z",
      "reason": "customer_unresponsive",
      "final_attempt": "2025-10-24T18:00:00Z",
      "total_attempts": 5,
      "incentive_cost": 15.00
    }
  }
}
```

### Incentive Events

#### `incentive.applied`

Triggered when an incentive is successfully applied to a customer.

```json
{
  "event": "incentive.applied",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T11:15:00Z",
  "data": {
    "incentive": {
      "id": "inc_12345",
      "case_id": "case_12345",
      "type": "discount",
      "config": {
        "discount_type": "percentage",
        "value": 25,
        "duration": "one_time",
        "applicable_to": "next_billing"
      },
      "applied_at": "2025-10-25T11:15:00Z",
      "expires_at": "2025-11-24T11:15:00Z",
      "value_amount": 7.50,
      "customer": {
        "id": "user_67890",
        "email": "customer@example.com"
      }
    }
  }
}
```

#### `incentive.expired`

Triggered when an incentive expires without being used.

```json
{
  "event": "incentive.expired",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-11-24T11:16:00Z",
  "data": {
    "incentive": { ... },
    "expiration_details": {
      "expired_at": "2025-11-24T11:15:00Z",
      "reason": "unused",
      "days_active": 30,
      "cost_impact": 7.50
    }
  }
}
```

### Customer Events

#### `customer.risk_changed`

Triggered when a customer's risk assessment changes.

```json
{
  "event": "customer.risk_changed",
  "id": "evt_01HXXXXXXXXXXXXXXXXX",
  "timestamp": "2025-10-25T12:00:00Z",
  "data": {
    "customer": {
      "id": "user_67890",
      "email": "customer@example.com"
    },
    "risk_change": {
      "from": "medium",
      "to": "high",
      "trigger": "payment_failed",
      "score": 0.75,
      "factors": [
        "recent_payment_failure",
        "usage_decline",
        "support_tickets_increased"
      ]
    }
  }
}
```

## Implementation Examples

### Node.js/Express Webhook Handler

```typescript
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Webhook secret - store securely (environment variable)
const WEBHOOK_SECRET = process.env.CHURN_SAVER_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

app.post('/webhooks/churn-saver', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const payload = JSON.stringify(req.body);

    if (!verifySignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    // Handle different event types
    switch (event) {
      case 'case.created':
        await handleCaseCreated(data.case);
        break;
      case 'case.recovered':
        await handleCaseRecovered(data.case, data.recovery_details);
        break;
      case 'incentive.applied':
        await handleIncentiveApplied(data.incentive);
        break;
      default:
        console.log(`Unhandled event: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleCaseCreated(caseData: any) {
  // Update CRM system
  await crm.updateContact(caseData.customer.id, {
    churn_risk: caseData.risk_level,
    last_case_created: caseData.created_at
  });

  // Send internal notification
  await slack.notify('#churn-alerts', {
    text: `New ${caseData.risk_level} risk case created for ${caseData.customer.email}`,
    fields: [
      { title: 'Case ID', value: caseData.id },
      { title: 'Risk Level', value: caseData.risk_level },
      { title: 'Trigger', value: caseData.trigger_event.type }
    ]
  });
}

async function handleCaseRecovered(caseData: any, recoveryDetails: any) {
  // Update customer success metrics
  await analytics.track('customer_recovered', {
    customer_id: caseData.user_id,
    time_to_recovery: recoveryDetails.time_to_recovery,
    revenue_recovered: recoveryDetails.revenue_recovered,
    incentive_used: recoveryDetails.incentive_used
  });

  // Trigger celebration workflow
  await workflow.trigger('customer_win_celebration', {
    customer: caseData.customer,
    recovery_details: recoveryDetails
  });
}

async function handleIncentiveApplied(incentive: any) {
  // Log incentive usage for reporting
  await database.logIncentiveUsage({
    incentive_id: incentive.id,
    customer_id: incentive.customer.id,
    type: incentive.type,
    value: incentive.value_amount,
    applied_at: incentive.applied_at
  });
}

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### Python Webhook Handler

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import os

app = Flask(__name__)
WEBHOOK_SECRET = os.environ['CHURN_SAVER_WEBHOOK_SECRET']

def verify_signature(payload: str, signature: str) -> bool:
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)

@app.route('/webhooks/churn-saver', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')

    if not signature:
        return jsonify({'error': 'Missing signature'}), 400

    payload = request.get_data(as_text=True)

    if not verify_signature(payload, signature):
        return jsonify({'error': 'Invalid signature'}), 401

    data = request.get_json()
    event_type = data.get('event')

    # Handle events
    if event_type == 'case.created':
        handle_case_created(data['data']['case'])
    elif event_type == 'case.recovered':
        handle_case_recovered(data['data']['case'], data['data']['recovery_details'])
    elif event_type == 'incentive.applied':
        handle_incentive_applied(data['data']['incentive'])

    return jsonify({'received': True})

def handle_case_created(case_data):
    # Update CRM
    crm_client.update_customer_risk(
        case_data['customer']['id'],
        case_data['risk_level']
    )

    # Send notification
    slack_client.send_message(
        '#churn-cases',
        f"🚨 New {case_data['risk_level']} risk case: {case_data['customer']['email']}"
    )

def handle_case_recovered(case_data, recovery_details):
    # Track in analytics
    analytics_client.track_event('customer_recovered', {
        'customer_id': case_data['user_id'],
        'time_to_recovery': recovery_details['time_to_recovery'],
        'revenue_recovered': recovery_details['revenue_recovered']
    })

def handle_incentive_applied(incentive_data):
    # Log for reporting
    db.log_incentive_redemption({
        'incentive_id': incentive_data['id'],
        'customer_id': incentive_data['customer']['id'],
        'amount': incentive_data['value_amount']
    })

if __name__ == '__main__':
    app.run(port=3000)
```

### Testing Webhooks

#### Using Webhook Testing Tools

**Local Development with ngrok:**

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use the ngrok URL in Churn Saver webhook configuration
# Example: https://abc123.ngrok.io/webhooks/churn-saver
```

**Testing with curl:**

```bash
# Create test payload
cat > test_payload.json << EOF
{
  "event": "case.created",
  "id": "evt_test_123",
  "timestamp": "2025-10-25T10:30:00Z",
  "data": {
    "case": {
      "id": "case_test_123",
      "user_id": "user_test_456",
      "status": "active",
      "risk_level": "high"
    }
  }
}
EOF

# Calculate signature
PAYLOAD=$(cat test_payload.json)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

# Send test webhook
curl -X POST https://your-webhook-url.com/webhooks/churn-saver \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Error Handling

### Common Issues

#### Signature Verification Failures

**Problem**: Webhook signatures don't match
**Solutions**:
- Verify webhook secret is correct
- Ensure payload is raw string before signing
- Check for extra whitespace or encoding issues

#### Duplicate Event Processing

**Problem**: Same event processed multiple times
**Solutions**:
- Implement idempotency using event IDs
- Store processed event IDs in database
- Use Redis for temporary deduplication

#### Rate Limiting

**Problem**: Too many webhooks overwhelming your system
**Solutions**:
- Implement queuing for webhook processing
- Use rate limiting middleware
- Process webhooks asynchronously

### Error Response Codes

- `200 OK`: Webhook processed successfully
- `400 Bad Request`: Invalid payload format
- `401 Unauthorized`: Invalid signature
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error during processing

## Best Practices

### Reliability

- **Implement retries** for failed webhook deliveries
- **Use exponential backoff** for retry logic
- **Monitor webhook health** and alert on failures
- **Handle partial failures** gracefully

### Security

- **Always verify signatures** before processing
- **Use HTTPS** for all webhook endpoints
- **Implement timeouts** for webhook processing
- **Log security events** for audit purposes

### Performance

- **Process asynchronously** to avoid blocking
- **Batch operations** when possible
- **Implement circuit breakers** for external service calls
- **Monitor processing latency** and set up alerts

### Monitoring

- **Track delivery success rates**
- **Monitor processing times**
- **Alert on failures**
- **Log all webhook attempts**

## Troubleshooting

### Debugging Webhooks

1. **Check webhook configuration** in Churn Saver dashboard
2. **Verify endpoint accessibility** with curl
3. **Test signature verification** with known payloads
4. **Check application logs** for processing errors
5. **Use webhook testing tools** for isolated testing

### Common Error Scenarios

**Event not received:**
- Check webhook URL configuration
- Verify network connectivity
- Check Churn Saver system status

**Signature invalid:**
- Confirm webhook secret matches
- Ensure payload formatting is correct
- Check for encoding issues

**Processing timeout:**
- Implement asynchronous processing
- Check for blocking operations
- Monitor resource usage

## Support

- **Webhook Documentation**: [docs.churnsaver.com/webhooks](https://docs.churnsaver.com/webhooks)
- **Developer Community**: [community.churnsaver.com](https://community.churnsaver.com)
- **Support**: support@churnsaver.com