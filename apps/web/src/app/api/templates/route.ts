/**
 * Templates API
 * GET /api/templates - List templates (Max tier only)
 * POST /api/templates - Create template (Max tier only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import {
  getTemplatesForCompany,
  createTemplate,
  CreateTemplateInput,
} from '@/server/services/templates';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  channel: z.enum(['push', 'dm']),
  trigger_type: z.enum(['immediate', 'day_2', 'day_4', 'manual']),
  push_title: z.string().max(100).optional(),
  push_body: z.string().max(500).optional(),
  dm_message: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
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

    const result = await getTemplatesForCompany(companyId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 403 }
      );
    }

    return NextResponse.json({
      templates: result.templates,
      count: result.templates?.length || 0,
    });
  } catch (error) {
    logger.error('GET /api/templates failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const validation = createTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const input: CreateTemplateInput = {
      name: validation.data.name,
      channel: validation.data.channel,
      trigger_type: validation.data.trigger_type,
      push_title: validation.data.push_title,
      push_body: validation.data.push_body,
      dm_message: validation.data.dm_message,
      is_active: validation.data.is_active,
    };

    const result = await createTemplate(companyId, input);

    if (!result.success) {
      const status = result.error?.includes('require Max tier') ? 403 : 400;
      return NextResponse.json(
        { error: result.error },
        { status }
      );
    }

    logger.info('Template created via API', {
      companyId,
      templateId: result.template?.id,
    });

    return NextResponse.json(
      { template: result.template },
      { status: 201 }
    );
  } catch (error) {
    logger.error('POST /api/templates failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
