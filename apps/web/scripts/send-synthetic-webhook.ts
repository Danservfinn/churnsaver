/**
 * Simple helper to send a synthetic Whop webhook to the lean endpoint.
 * Usage:
 *   ts-node scripts/send-synthetic-webhook.ts
 */
import crypto from 'crypto';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/lean/webhooks/whop';
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'dev_secret';

function sign(body: string) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

async function send(payload: any) {
  const body = JSON.stringify(payload);
  const signature = sign(body);

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-whop-signature': signature,
    },
    body,
  });

  const text = await res.text();
  console.log(res.status, text);
}

async function main() {
  const payload = {
    id: `evt_${Date.now()}`,
    type: 'membership_went_invalid',
    created_at: new Date().toISOString(),
    data: {
      membership_id: 'mem_123',
      membership: {
        id: 'mem_123',
        user_id: 'user_123',
        company_id: 'company_dev',
      },
      user_id: 'user_123',
    },
  };

  await send(payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


