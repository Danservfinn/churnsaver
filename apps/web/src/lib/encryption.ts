// AES-GCM encryption utilities for webhook payload privacy
// Uses ENCRYPTION_KEY environment variable for optional encryption

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Encrypts data using AES-GCM with a random IV
 * @param data - Data to encrypt (string or Buffer)
 * @param key - 32-byte encryption key
 * @returns EncryptionResult with encrypted data, IV, and auth tag
 */
export function encryptAESGCM(data: string | Buffer, key: string): EncryptionResult {
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (256 bits)');
  }

  const iv = randomBytes(16); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), iv);

  let encrypted: Buffer;
  if (typeof data === 'string') {
    encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);
  } else {
    encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
  }

  const tag = cipher.getAuthTag();

  return { encrypted, iv, tag };
}

/**
 * Decrypts data encrypted with encryptAESGCM
 * @param encrypted - Encrypted data buffer
 * @param iv - Initialization vector used for encryption
 * @param tag - Authentication tag from encryption
 * @param key - 32-byte encryption key
 * @returns Decrypted data as string
 */
export function decryptAESGCM(encrypted: Buffer, iv: Buffer, tag: Buffer, key: string): string {
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (256 bits)');
  }

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypts a webhook payload if ENCRYPTION_KEY is available
 * @param payload - JSON payload to encrypt
 * @param encryptionKey - Optional encryption key from environment
 * @returns Buffer containing encrypted payload or null if no key
 */
export function encryptWebhookPayload(payload: Record<string, unknown>, encryptionKey?: string): Buffer | null {
  if (!encryptionKey) {
    return null;
  }

  try {
    const payloadStr = JSON.stringify(payload);
    const result = encryptAESGCM(payloadStr, encryptionKey);

    // Combine IV, tag, and encrypted data into a single buffer
    // Format: IV (16 bytes) + Tag (16 bytes) + Encrypted data
    const combined = Buffer.concat([result.iv, result.tag, result.encrypted]);
    return combined;
  } catch (error) {
    throw new Error(`Failed to encrypt webhook payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decrypts a webhook payload encrypted with encryptWebhookPayload
 * @param encryptedData - Buffer containing encrypted payload
 * @param encryptionKey - Encryption key used for decryption
 * @returns Decrypted payload object
 */
export function decryptWebhookPayload(encryptedData: Buffer, encryptionKey: string): Record<string, unknown> {
  try {
    // Extract IV (first 16 bytes), tag (next 16 bytes), and encrypted data (rest)
    const iv = encryptedData.subarray(0, 16);
    const tag = encryptedData.subarray(16, 32);
    const encrypted = encryptedData.subarray(32);

    const decryptedStr = decryptAESGCM(encrypted, iv, tag, encryptionKey);
    return JSON.parse(decryptedStr);
  } catch (error) {
    throw new Error(`Failed to decrypt webhook payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Derives minimal payload from webhook payload for privacy
 * @param payload - Full webhook payload
 * @returns Minimal payload with only essential fields
 */
export function deriveMinimalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const minimal: Record<string, unknown> = {
    whop_event_id: payload.id || payload.whop_event_id,
    type: payload.type,
    membership_id: extractMembershipId(payload)
  };

  // Add failure_reason if present
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as Record<string, unknown>;
    if (data.failure_reason && typeof data.failure_reason === 'string') {
      minimal.failure_reason = data.failure_reason;
    }
    // Add user_id if present (for user-related events)
    if (data.user_id && typeof data.user_id === 'string') {
      minimal.user_id = data.user_id;
    }
  }

  return minimal;
}

/**
 * Extracts membership ID from webhook payload data
 * @param payload - Webhook payload
 * @returns Membership ID string or 'unknown'
 */
function extractMembershipId(payload: Record<string, unknown>): string {
  if (!payload.data || typeof payload.data !== 'object') {
    return 'unknown';
  }

  const data = payload.data as Record<string, unknown>;

  if (typeof data.membership_id === 'string') return data.membership_id;
  if (data.membership && typeof (data.membership as { id: string }).id === 'string') {
    return (data.membership as { id: string }).id;
  }
  if (typeof data.id === 'string' && payload.type && typeof payload.type === 'string' && payload.type.includes('membership')) {
    return data.id;
  }

  return 'unknown';
}