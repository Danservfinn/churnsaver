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
