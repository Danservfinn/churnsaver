"use strict";
// Encryption utilities
// Provides secure encryption and decryption for sensitive data
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.generateSecureToken = generateSecureToken;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.generateRandomString = generateRandomString;
exports.deriveKey = deriveKey;
exports.isValidBase64Key = isValidBase64Key;
exports.isCorrectKeyLength = isCorrectKeyLength;
exports.generateEncryptionKey = generateEncryptionKey;
const crypto_1 = require("crypto");
const util_1 = require("util");
const bcrypt_1 = require("bcrypt");
const zod_1 = require("zod");
const DEFAULT_CONFIG = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 12, // Standard for GCM
    saltLength: 32,
    iterations: 32767, // OWASP recommended minimum
    authTagLength: 16
};
/**
 * Schema for validating encryption keys
 */
const EncryptionKeySchema = zod_1.z.string().min(1, 'Encryption key cannot be empty');
/**
 * Schema for validating base64 keys
 */
const Base64KeySchema = zod_1.z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Key must be valid base64');
/**
 * Validates and normalizes an encryption key
 * @param key The raw encryption key
 * @returns A Buffer containing normalized 32-byte key
 * @throws Error if key is invalid
 */
async function validateAndNormalizeKey(key) {
    // Validate input
    EncryptionKeySchema.parse(key);
    // If it's base64, decode it
    if (Base64KeySchema.safeParse(key).success) {
        const decoded = Buffer.from(key, 'base64');
        // Check if it's already 32 bytes
        if (decoded.length === DEFAULT_CONFIG.keyLength) {
            return decoded;
        }
        // If not 32 bytes, we'll derive a key from it
        return await deriveKeyFromMaterial(key);
    }
    // For non-base64 keys, derive a proper key
    return await deriveKeyFromMaterial(key);
}
/**
 * Derives a proper 32-byte key from any key material
 * @param keyMaterial The raw key material
 * @returns A 32-byte Buffer suitable for AES-256
 */
async function deriveKeyFromMaterial(keyMaterial) {
    const salt = Buffer.from('churn-saver-encryption-salt-v1', 'utf8');
    return await scryptSync(keyMaterial, salt, DEFAULT_CONFIG.keyLength);
}
/**
 * Encrypt data using AES-256-GCM with standard parameters
 * @param data The data to encrypt
 * @param key Optional encryption key (defaults to environment variable)
 * @returns Base64url-encoded encrypted data with IV and auth tag
 * @throws Error if encryption fails
 */
async function encrypt(data, key) {
    try {
        const rawKey = key || process.env.ENCRYPTION_KEY;
        if (!rawKey) {
            throw new Error('Encryption key is required. Set ENCRYPTION_KEY environment variable or provide key parameter.');
        }
        // Validate and normalize the key
        const encryptionKey = await validateAndNormalizeKey(rawKey);
        // Generate a random 12-byte IV (standard for GCM)
        const iv = (0, crypto_1.randomBytes)(DEFAULT_CONFIG.ivLength);
        // Create cipher with validated key and standard IV
        const cipher = (0, crypto_1.createCipheriv)(DEFAULT_CONFIG.algorithm, encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Combine IV, encrypted data, and auth tag for storage
        // Format: IV (12 bytes) + Auth Tag (16 bytes) + Encrypted Data
        const combined = Buffer.concat([iv, authTag, encrypted]);
        return combined.toString('base64url');
    }
    catch (error) {
        throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Decrypt data using AES-256-GCM with standard parameters
 * @param encryptedData Base64url-encoded encrypted data
 * @param key Optional encryption key (defaults to environment variable)
 * @returns The decrypted string
 * @throws Error if decryption fails
 */
async function decrypt(encryptedData, key) {
    try {
        const rawKey = key || process.env.ENCRYPTION_KEY;
        if (!rawKey) {
            throw new Error('Encryption key is required. Set ENCRYPTION_KEY environment variable or provide key parameter.');
        }
        // Validate and normalize the key
        const encryptionKey = await validateAndNormalizeKey(rawKey);
        const combined = Buffer.from(encryptedData, 'base64url');
        // Extract IV, auth tag, and encrypted data
        // Format: IV (12 bytes) + Auth Tag (16 bytes) + Encrypted Data
        const iv = combined.subarray(0, DEFAULT_CONFIG.ivLength);
        const authTag = combined.subarray(DEFAULT_CONFIG.ivLength, DEFAULT_CONFIG.ivLength + DEFAULT_CONFIG.authTagLength);
        const encrypted = combined.subarray(DEFAULT_CONFIG.ivLength + DEFAULT_CONFIG.authTagLength);
        // Create decipher with validated key and extracted IV
        const decipher = (0, crypto_1.createDecipheriv)(DEFAULT_CONFIG.algorithm, encryptionKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch (error) {
        throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Generate a secure random token
 * @param length The number of random bytes to generate
 * @returns Base64url-encoded random token
 */
function generateSecureToken(length = 32) {
    return (0, crypto_1.randomBytes)(length).toString('base64url');
}
/**
 * Hash a password using bcrypt (production-ready)
 * @param password The password to hash
 * @param saltRounds Optional salt rounds (defaults to 12)
 * @returns The hashed password
 */
async function hashPassword(password, saltRounds = 12) {
    if (!password || password.length === 0) {
        throw new Error('Password cannot be empty');
    }
    return await bcrypt_1.default.hash(password, saltRounds);
}
/**
 * Compare a password with a bcrypt hash
 * @param password The password to check
 * @param hash The bcrypt hash to compare against
 * @returns True if password matches hash
 */
async function comparePassword(password, hash) {
    if (!password || password.length === 0) {
        throw new Error('Password cannot be empty');
    }
    if (!hash || hash.length === 0) {
        throw new Error('Hash cannot be empty');
    }
    return await bcrypt_1.default.compare(password, hash);
}
/**
 * Generate a cryptographically secure random string
 * @param length The desired length of string
 * @returns A random string of alphanumeric characters
 */
function generateRandomString(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = (0, crypto_1.randomBytes)(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}
/**
 * Derive a key from password and salt using scrypt
 * @param password The password to derive from
 * @param salt The salt for key derivation
 * @returns A derived key buffer
 */
async function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        (0, crypto_1.scrypt)(password, salt, DEFAULT_CONFIG.iterations, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(derivedKey);
        });
    });
}
/**
 * Validates if a string is a properly formatted base64 key
 * @param key The key to validate
 * @returns True if key is valid base64
 */
function isValidBase64Key(key) {
    return Base64KeySchema.safeParse(key).success;
}
/**
 * Validates if a base64 key is correct length for AES-256
 * @param key The base64 key to validate
 * @returns True if key is 32 bytes when decoded
 */
function isCorrectKeyLength(key) {
    try {
        const decoded = Buffer.from(key, 'base64');
        return decoded.length === DEFAULT_CONFIG.keyLength;
    }
    catch {
        return false;
    }
}
/**
 * Generate a properly formatted 32-byte base64 encryption key
 * @returns A base64-encoded 32-byte key suitable for AES-256
 */
function generateEncryptionKey() {
    return (0, crypto_1.randomBytes)(DEFAULT_CONFIG.keyLength).toString('base64');
}
// Synchronous version of scrypt for key derivation
const scryptSync = (0, util_1.promisify)(crypto_1.scrypt);
