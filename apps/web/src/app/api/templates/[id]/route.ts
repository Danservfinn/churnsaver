/**
 * Individual Template API
 * PUT /api/templates/[id] - Update template (Max tier only)
 * DELETE /api/templates/[id] - Delete template (Max tier only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import {
  updateTemplate,
  deleteTemplate,
  UpdateTemplateInput,
} from '@/server/services/templates';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  push_title: z.string().max(100).optional(),
  push_body: z.string().max(500).optional(),
  dm_message: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, context: RouteParams) {
  try {
    await initDb();

    const auth = await requireAuthContext(req);
    if (!auth.success || !auth.context?.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const companyId = auth.context.companyId;

    const { id: templateId } = await context.params;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validation = updateTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const input: UpdateTemplateInput = {
      name: validation.data.name,
      push_title: validation.data.push_title,
      push_body: validation.data.push_body,
      dm_message: validation.data.dm_message,
      is_active: validation.data.is_active,
    };

    const result = await updateTemplate(companyId, templateId, input);

    if (!result.success) {
      const status = result.error?.includes('require Max tier') ? 403
        : result.error?.includes('not found') ? 404
        : 400;
      return NextResponse.json(
        { error: result.error },
        { status }
      );
    }

    logger.info('Template updated via API', {
      companyId,
      templateId,
    });

    return NextResponse.json({ template: result.template });
  } catch (error) {
    logger.error('PUT /api/templates/[id] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteParams) {
  try {
    await initDb();

    const auth = await requireAuthContext(req);
    if (!auth.success || !auth.context?.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const companyId = auth.context.companyId;

    const { id: templateId } = await context.params;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID required' },
        { status: 400 }
      );
    }

    const result = await deleteTemplate(companyId, templateId);

    if (!result.success) {
      const status = result.error?.includes('require Max tier') ? 403
        : result.error?.includes('not found') ? 404
        : 400;
      return NextResponse.json(
        { error: result.error },
        { status }
      );
    }

    logger.info('Template deleted via API', {
      companyId,
      templateId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/templates/[id] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
