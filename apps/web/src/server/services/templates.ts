/**
 * Template service for custom message templates
 * Max tier only feature per churn-saver-monetization-spec-final.md
 */

import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { TIER_LIMITS, TierName } from '@/lib/tiers';
import { getSubscriptionStatus } from './subscriptions';

export type TemplateChannel = 'push' | 'dm';
export type TriggerType = 'immediate' | 'day_2' | 'day_4' | 'manual';

export interface MessageTemplate {
  id: string;
  company_id: string;
  name: string;
  channel: TemplateChannel;
  trigger_type: TriggerType;
  push_title: string | null;
  push_body: string | null;
  dm_message: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateInput {
  name: string;
  channel: TemplateChannel;
  trigger_type: TriggerType;
  push_title?: string;
  push_body?: string;
  dm_message?: string;
  is_active?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  push_title?: string;
  push_body?: string;
  dm_message?: string;
  is_active?: boolean;
}

export interface TemplateContext {
  membership_name?: string;
  billing_url?: string;
  incentive_days?: number;
  creator_name?: string;
  first_name?: string;
  days_remaining?: number;
}

interface TemplateResult {
  success: boolean;
  template?: MessageTemplate;
  error?: string;
}

interface TemplateListResult {
  success: boolean;
  templates?: MessageTemplate[];
  error?: string;
}

// Default templates used when no custom templates are configured
const DEFAULT_TEMPLATES = {
  push: {
    immediate: {
      title: 'Payment Issue',
      body: 'We had trouble processing your payment. Update your card to keep your access.',
    },
    day_2: {
      title: 'Payment Reminder',
      body: 'Your payment is still pending. Update your payment method to continue your membership.',
    },
    day_4: {
      title: 'Last Chance',
      body: 'Final reminder: Your access will expire soon. Update your payment now.',
    },
    manual: {
      title: 'Payment Update Needed',
      body: 'Please update your payment method to maintain access.',
    },
  },
  dm: {
    immediate: {
      message: 'Hi! We noticed there was an issue with your payment. Please update your payment method to keep your access: {{billing_url}}',
    },
    day_2: {
      message: 'Hey there! Just a reminder that your payment is still pending. Update your payment method here: {{billing_url}}',
    },
    day_4: {
      message: 'This is your last reminder! Your access will expire soon if you don\'t update your payment: {{billing_url}}',
    },
    manual: {
      message: 'Please update your payment method to continue your membership: {{billing_url}}',
    },
  },
};

/**
 * Check if a company has access to custom templates (Max tier)
 */
export async function canUseCustomTemplates(companyId: string): Promise<boolean> {
  const subscription = await getSubscriptionStatus(companyId);
  return subscription.features.customTemplates;
}

/**
 * Get the number of templates a company has for a channel
 */
async function getTemplateCountForChannel(
  companyId: string,
  channel: TemplateChannel
): Promise<number> {
  const result = await sqlWithRLS.select<{ count: string }>(
    `SELECT COUNT(*)::TEXT as count
     FROM message_templates
     WHERE company_id = $1 AND channel = $2`,
    [companyId, channel],
    { companyId }
  );

  return parseInt(result[0]?.count || '0', 10);
}

/**
 * Get all templates for a company
 */
export async function getTemplatesForCompany(
  companyId: string
): Promise<TemplateListResult> {
  try {
    const hasAccess = await canUseCustomTemplates(companyId);

    if (!hasAccess) {
      return {
        success: false,
        error: 'Custom templates require Max tier subscription',
      };
    }

    const templates = await sqlWithRLS.select<MessageTemplate>(
      `SELECT id, company_id, name, channel, trigger_type,
              push_title, push_body, dm_message, is_active,
              created_at, updated_at
       FROM message_templates
       WHERE company_id = $1
       ORDER BY channel, trigger_type, name`,
      [companyId],
      { companyId }
    );

    return { success: true, templates };
  } catch (error) {
    logger.error('Failed to get templates', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Failed to retrieve templates' };
  }
}

/**
 * Get active template for a specific channel and trigger type
 */
export async function getActiveTemplate(
  companyId: string,
  channel: TemplateChannel,
  triggerType: TriggerType
): Promise<MessageTemplate | null> {
  try {
    const templates = await sqlWithRLS.select<MessageTemplate>(
      `SELECT id, company_id, name, channel, trigger_type,
              push_title, push_body, dm_message, is_active,
              created_at, updated_at
       FROM message_templates
       WHERE company_id = $1
         AND channel = $2
         AND trigger_type = $3
         AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [companyId, channel, triggerType],
      { companyId }
    );

    return templates[0] || null;
  } catch (error) {
    logger.error('Failed to get active template', {
      companyId,
      channel,
      triggerType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Create a new template
 */
export async function createTemplate(
  companyId: string,
  input: CreateTemplateInput
): Promise<TemplateResult> {
  try {
    const hasAccess = await canUseCustomTemplates(companyId);

    if (!hasAccess) {
      return {
        success: false,
        error: 'Custom templates require Max tier subscription',
      };
    }

    // Check template limit per channel (10)
    const currentCount = await getTemplateCountForChannel(companyId, input.channel);
    const subscription = await getSubscriptionStatus(companyId);
    const limit = subscription.features.maxTemplatesPerChannel;

    if (currentCount >= limit) {
      return {
        success: false,
        error: `Template limit reached for ${input.channel} channel (max ${limit})`,
      };
    }

    // Validate content lengths
    if (input.push_title && input.push_title.length > 100) {
      return { success: false, error: 'Push title must be 100 characters or less' };
    }
    if (input.push_body && input.push_body.length > 500) {
      return { success: false, error: 'Push body must be 500 characters or less' };
    }
    if (input.dm_message && input.dm_message.length > 2000) {
      return { success: false, error: 'DM message must be 2000 characters or less' };
    }

    const template = await sqlWithRLS.insert<MessageTemplate>(
      `INSERT INTO message_templates (
         company_id, name, channel, trigger_type,
         push_title, push_body, dm_message, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        companyId,
        input.name,
        input.channel,
        input.trigger_type,
        input.push_title || null,
        input.push_body || null,
        input.dm_message || null,
        input.is_active ?? true,
      ],
      { companyId }
    );

    if (!template) {
      return { success: false, error: 'Failed to create template' };
    }

    logger.info('Template created', {
      companyId,
      templateId: template.id,
      channel: input.channel,
      triggerType: input.trigger_type,
    });

    return { success: true, template };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return { success: false, error: 'A template with this name already exists' };
    }

    logger.error('Failed to create template', {
      companyId,
      error: message,
    });

    return { success: false, error: 'Failed to create template' };
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  companyId: string,
  templateId: string,
  input: UpdateTemplateInput
): Promise<TemplateResult> {
  try {
    const hasAccess = await canUseCustomTemplates(companyId);

    if (!hasAccess) {
      return {
        success: false,
        error: 'Custom templates require Max tier subscription',
      };
    }

    // Validate content lengths
    if (input.push_title && input.push_title.length > 100) {
      return { success: false, error: 'Push title must be 100 characters or less' };
    }
    if (input.push_body && input.push_body.length > 500) {
      return { success: false, error: 'Push body must be 500 characters or less' };
    }
    if (input.dm_message && input.dm_message.length > 2000) {
      return { success: false, error: 'DM message must be 2000 characters or less' };
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.push_title !== undefined) {
      setClauses.push(`push_title = $${paramIndex++}`);
      values.push(input.push_title);
    }
    if (input.push_body !== undefined) {
      setClauses.push(`push_body = $${paramIndex++}`);
      values.push(input.push_body);
    }
    if (input.dm_message !== undefined) {
      setClauses.push(`dm_message = $${paramIndex++}`);
      values.push(input.dm_message);
    }
    if (input.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      values.push(input.is_active);
    }

    if (setClauses.length === 0) {
      return { success: false, error: 'No fields to update' };
    }

    setClauses.push('updated_at = now()');
    values.push(templateId, companyId);

    const template = await sqlWithRLS.insert<MessageTemplate>(
      `UPDATE message_templates
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex++} AND company_id = $${paramIndex}
       RETURNING *`,
      values,
      { companyId }
    );

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    logger.info('Template updated', {
      companyId,
      templateId,
    });

    return { success: true, template };
  } catch (error) {
    logger.error('Failed to update template', {
      companyId,
      templateId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Failed to update template' };
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(
  companyId: string,
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const hasAccess = await canUseCustomTemplates(companyId);

    if (!hasAccess) {
      return {
        success: false,
        error: 'Custom templates require Max tier subscription',
      };
    }

    const result = await sqlWithRLS.execute(
      `DELETE FROM message_templates
       WHERE id = $1 AND company_id = $2`,
      [templateId, companyId],
      { companyId }
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Template not found' };
    }

    logger.info('Template deleted', {
      companyId,
      templateId,
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete template', {
      companyId,
      templateId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Failed to delete template' };
  }
}

/**
 * Render a template with context (placeholder replacement)
 * Supports: {{membership_name}}, {{billing_url}}, {{incentive_days}},
 *           {{creator_name}}, {{first_name}}, {{days_remaining}}
 * Supports conditionals: {{#if incentive_days}}...{{/if}}
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  let result = template;

  // Process conditionals first
  const conditionalRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (match, key, content) => {
    const value = context[key as keyof TemplateContext];
    if (value !== undefined && value !== null && value !== 0 && value !== '') {
      return content;
    }
    return '';
  });

  // Process placeholders
  const placeholderRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(placeholderRegex, (match, key) => {
    const value = context[key as keyof TemplateContext];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match; // Keep placeholder if no value
  });

  return result.trim();
}

/**
 * Get rendered content for a nudge message
 * Uses custom template if available (Max tier), otherwise defaults
 */
export async function getNudgeContent(
  companyId: string,
  channel: TemplateChannel,
  triggerType: TriggerType,
  context: TemplateContext
): Promise<{
  title?: string;
  body?: string;
  message?: string;
}> {
  // Try to get custom template first
  const customTemplate = await getActiveTemplate(companyId, channel, triggerType);

  if (customTemplate) {
    if (channel === 'push') {
      return {
        title: customTemplate.push_title
          ? renderTemplate(customTemplate.push_title, context)
          : undefined,
        body: customTemplate.push_body
          ? renderTemplate(customTemplate.push_body, context)
          : undefined,
      };
    } else {
      return {
        message: customTemplate.dm_message
          ? renderTemplate(customTemplate.dm_message, context)
          : undefined,
      };
    }
  }

  // Fall back to defaults
  const defaults = DEFAULT_TEMPLATES[channel][triggerType];

  if (channel === 'push') {
    const pushDefaults = defaults as { title: string; body: string };
    return {
      title: renderTemplate(pushDefaults.title, context),
      body: renderTemplate(pushDefaults.body, context),
    };
  } else {
    const dmDefaults = defaults as { message: string };
    return {
      message: renderTemplate(dmDefaults.message, context),
    };
  }
}
