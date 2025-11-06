import { z } from 'zod';

// Common validation schemas for API requests

// Settings API validation
export const SettingsUpdateSchema = z.object({
  enable_push: z.boolean().default(true),
  enable_dm: z.boolean().default(true),
  incentive_days: z.number().int().min(0).max(365).default(3),
  reminder_offsets_days: z.array(z.number().int().min(0).max(365)).min(1).max(10).default([0, 1, 7])
}).strict(); // No additional properties allowed

// Additional validation for string fields (if any are added later)
export const StringFieldSchema = z.string().min(1).max(255); // Reasonable default for text fields

export type SettingsUpdateInput = z.infer<typeof SettingsUpdateSchema>;

// KPI query validation
export const KpiQuerySchema = z.object({
  window: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)).refine(val => val >= 1 && val <= 365, {
    message: "Window must be between 1 and 365 days"
  }).optional().default(14)
}).strict();

export type KpiQueryInput = z.infer<typeof KpiQuerySchema>;

// Case API query validation (pagination, filters)
export const CaseQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)).refine(val => val >= 1, {
    message: "Page must be >= 1"
  }).optional().default(1),
  limit: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)).refine(val => val >= 1 && val <= 100, {
    message: "Limit must be between 1 and 100"
  }).optional().default(50),
  status: z.enum(['open', 'recovered']).optional()
}).strict();

export type CaseQueryInput = z.infer<typeof CaseQuerySchema>;

// Case actions (nudge, cancel, terminate) path params validation
export const CaseIdParamSchema = z.object({
  caseId: z.string().max(36).regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: "Invalid case ID format"
  })
});

export type CaseIdParamInput = z.infer<typeof CaseIdParamSchema>;

// Membership ID param validation
export const MembershipIdParamSchema = z.object({
  membershipId: z.string().max(36).regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: "Invalid membership ID format"
  })
});

export type MembershipIdParamInput = z.infer<typeof MembershipIdParamSchema>;

// Utility functions for handling validation errors
export function formatValidationErrors(error: z.ZodError): string {
  return error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`).join('; ');
}

export function validateAndTransform<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: formatValidationErrors(result.error) };
  }
}

//
// Case actions validation
export const CaseActionSchema = z.object({
  caseId: z.string()
    .min(1, 'caseId cannot be empty')
    .max(36, 'caseId cannot exceed 36 characters')
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
      message: 'caseId must be a valid UUID format'
    })
    .refine(val => typeof val === 'string', 'caseId must be a string')
}).strict();

export type CaseActionInput = z.infer<typeof CaseActionSchema>;

// Webhook payload validation
export const WebhookPayloadSchema = z.object({
  id: z.string()
    .min(1, 'Event ID cannot be empty')
    .max(255, 'Event ID cannot exceed 255 characters')
    .optional(),
  whop_event_id: z.string()
    .min(1, 'Whop event ID cannot be empty')
    .max(255, 'Whop event ID cannot exceed 255 characters')
    .optional(),
  type: z.string()
    .min(1, 'Event type cannot be empty')
    .max(100, 'Event type cannot exceed 100 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, 'Event type must contain only alphanumeric characters, dots, underscores, and hyphens')
    .refine(val => typeof val === 'string', 'Event type must be a string'),
  data: z.union([
    z.record(z.string(), z.unknown()), // Allow flexible data object
    z.any() // Allow any data type for backward compatibility
  ]).optional(),
  created_at: z.string()
    .refine(val => {
      if (val) {
        const date = new Date(val);
        return !isNaN(date.getTime());
      }
      return true;
    }, 'created_at must be a valid ISO date string')
    .optional()
}).strict() // No additional properties allowed
.refine(payload => payload.id || payload.whop_event_id, {
  message: 'Either id or whop_event_id must be provided'
});

export type WebhookPayloadInput = z.infer<typeof WebhookPayloadSchema>;
