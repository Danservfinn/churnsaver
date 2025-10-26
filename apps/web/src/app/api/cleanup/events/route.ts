import { NextRequest, NextResponse } from 'next/server';
import { initDb, closeDb } from '../../../../lib/db';
import { logger } from '../../../../lib/logger';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Initialize database connection
    await initDb();

    logger.info('Starting scheduled event cleanup via API');

    // Execute the cleanup script
    const scriptPath = path.join(process.cwd(), 'scripts', 'cleanup-events.ts');

    return new Promise<NextResponse>((resolve) => {
      const cleanupProcess = spawn('npx', ['tsx', scriptPath], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
      });

      let stdout = '';
      let stderr = '';

      cleanupProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      cleanupProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      cleanupProcess.on('close', (code) => {
        logger.info('Event cleanup process completed', {
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });

        if (code === 0) {
          resolve(NextResponse.json({
            success: true,
            message: 'Event cleanup completed successfully',
            details: stdout.trim()
          }));
        } else {
          logger.error('Event cleanup process failed', {
            exitCode: code,
            stderr: stderr.trim()
          });
          resolve(NextResponse.json({
            success: false,
            error: 'Cleanup process failed',
            details: stderr.trim()
          }, { status: 500 }));
        }
      });

      cleanupProcess.on('error', (error) => {
        logger.error('Failed to start cleanup process', {
          error: error.message
        });
        resolve(NextResponse.json({
          success: false,
          error: 'Failed to start cleanup process',
          details: error.message
        }, { status: 500 }));
      });
    });

  } catch (error) {
    logger.error('Event cleanup API failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await closeDb();
  }
}

// Health check endpoint for monitoring
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'event-cleanup',
    schedule: 'Daily at 2:00 UTC',
    retention: {
      plaintext: '30 days',
      encrypted: '60 days'
    }
  });
}