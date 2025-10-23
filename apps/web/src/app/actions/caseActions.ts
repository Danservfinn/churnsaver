'use server';

import { revalidatePath } from 'next/cache';
import { nudgeCaseAgain, cancelRecoveryCase, terminateMembership } from '@/server/services/cases';
import { logger } from '@/lib/logger';

// Server actions for case management

export async function nudgeCase(formData: FormData) {
  const caseId = formData.get('caseId') as string;

  if (!caseId) {
    logger.error('Nudge case action: missing caseId');
    return { success: false, message: 'Case ID is required' };
  }

  try {
    logger.info('Manual nudge requested', { caseId });

    const success = await nudgeCaseAgain(caseId, 'unknown');

    if (success) {
      revalidatePath('/dashboard');
      return { success: true, message: 'Nudge sent successfully' };
    } else {
      return { success: false, message: 'Failed to send nudge' };
    }
  } catch (error) {
    logger.error('Nudge case action failed', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { success: false, message: 'An error occurred while sending nudge' };
  }
}

export async function cancelCase(formData: FormData) {
  const caseId = formData.get('caseId') as string;

  if (!caseId) {
    logger.error('Cancel case action: missing caseId');
    return { success: false, message: 'Case ID is required' };
  }

  try {
    logger.info('Cancel case requested', { caseId });

    const success = await cancelRecoveryCase(caseId, 'unknown');

    if (success) {
      revalidatePath('/dashboard');
      return { success: true, message: 'Case cancelled successfully' };
    } else {
      return { success: false, message: 'Failed to cancel case (may already be closed)' };
    }
  } catch (error) {
    logger.error('Cancel case action failed', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { success: false, message: 'An error occurred while cancelling case' };
  }
}

export async function terminateCaseMembership(formData: FormData) {
  const caseId = formData.get('caseId') as string;

  if (!caseId) {
    logger.error('Terminate membership action: missing caseId');
    return { success: false, message: 'Case ID is required' };
  }

  try {
    logger.info('Terminate membership requested', { caseId });

    const success = await terminateMembership(caseId, 'unknown');

    if (success) {
      revalidatePath('/dashboard');
      return { success: true, message: 'Membership terminated successfully' };
    } else {
      return { success: false, message: 'Failed to terminate membership' };
    }
  } catch (error) {
    logger.error('Terminate membership action failed', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { success: false, message: 'An error occurred while terminating membership' };
  }
}

