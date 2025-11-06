'use server';

import { revalidatePath } from 'next/cache';
import { nudgeCaseAgain, cancelRecoveryCase, terminateMembership } from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { createActionResponse } from '@/lib/common/formatters';
import { validateAndTransform, CaseActionSchema } from '@/lib/validation';

// Server actions for case management

export async function nudgeCase(formData: FormData) {
  const rawCaseId = formData.get('caseId');
  const validation = validateAndTransform(CaseActionSchema, { caseId: typeof rawCaseId === 'string' ? rawCaseId : '' });
  if (!validation.success) {
    logger.warn('Nudge case action: validation failed', { error: validation.error });
    return createActionResponse(false, `Invalid input: ${validation.error}`);
  }
  const { caseId } = validation.data;

  return handleCaseAction('nudge', caseId, () => nudgeCaseAgain(caseId, 'unknown'),
    'Nudge sent successfully', 'Failed to send nudge');
}

export async function cancelCase(formData: FormData) {
  const rawCaseId = formData.get('caseId');
  const validation = validateAndTransform(CaseActionSchema, { caseId: typeof rawCaseId === 'string' ? rawCaseId : '' });
  if (!validation.success) {
    logger.warn('Cancel case action: validation failed', { error: validation.error });
    return createActionResponse(false, `Invalid input: ${validation.error}`);
  }
  const { caseId } = validation.data;

  return handleCaseAction('cancel', caseId, () => cancelRecoveryCase(caseId, 'unknown'),
    'Case cancelled successfully', 'Failed to cancel case (may already be closed)');
}

export async function terminateCaseMembership(formData: FormData) {
  const rawCaseId = formData.get('caseId');
  const validation = validateAndTransform(CaseActionSchema, { caseId: typeof rawCaseId === 'string' ? rawCaseId : '' });
  if (!validation.success) {
    logger.warn('Terminate membership action: validation failed', { error: validation.error });
    return createActionResponse(false, `Invalid input: ${validation.error}`);
  }
  const { caseId } = validation.data;

  return handleCaseAction('terminate', caseId, () => terminateMembership(caseId, 'unknown'),
    'Membership terminated successfully', 'Failed to terminate membership');
}

// Helper function to reduce duplication in case action handlers
async function handleCaseAction(
  action: string,
  caseId: string,
  operation: () => Promise<boolean>,
  successMessage: string,
  failureMessage: string
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info(`${action} case requested`, { caseId });

    const success = await operation();

    if (success) {
      revalidatePath('/dashboard');
      return createActionResponse(true, successMessage);
    } else {
      return createActionResponse(false, failureMessage);
    }
  } catch (error) {
    logger.error(`${action} case action failed`, {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return createActionResponse(false, `An error occurred while ${action}ing case`);
  }
}











