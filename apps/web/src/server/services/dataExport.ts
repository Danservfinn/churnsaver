// Data Export Service
// Handles GDPR data export functionality with security, encryption, and audit trails

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { gzip } from 'zlib';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt, generateSecureToken } from '@/lib/encryption';
import { 
  DataExportRequest, 
  DataExportFile, 
  DataExportAuditLog,
  CreateExportRequestRequest,
  CreateExportRequestResponse,
  ExportRequestListResponse,
  ExportFileDownloadResponse,
  ExportedData,
  ExportProcessingOptions,
  ExportProcessingResult,
  ExportValidationResult,
  ExportRateLimitInfo,
  ExportCleanupResult,
  DataExportError,
  ExportFormat,
  ExportStatus,
  ExportDataType,
  ExportAuditAction,
  ExportActorType,
  CompressionType,
  ExportLimits,
  ExportUserData,
  ExportCaseData,
  ExportEventData,
  ExportRecoveryActionData,
  ExportMembershipData,
  ExportSettingsData,
  ExportConsentRecordData
} from '@/types/dataExport';

// Constants for file storage
const EXPORT_DIR = process.env.EXPORT_DIR || '/tmp/exports';
const MAX_FILE_SIZE_BYTES = ExportLimits.MAX_FILE_SIZE_MB * 1024 * 1024;

// Ensure export directory exists
if (!existsSync(EXPORT_DIR)) {
  mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * Validate export request parameters
 */
export function validateExportRequest(request: CreateExportRequestRequest): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate export format
  if (!Object.values(ExportFormat).includes(request.export_format)) {
    errors.push(`Invalid export format: ${request.export_format}`);
  }

  // Validate data types
  if (!request.data_types || request.data_types.length === 0) {
    errors.push('At least one data type must be specified');
  } else {
    const invalidTypes = request.data_types.filter(type => !Object.values(ExportDataType).includes(type));
    if (invalidTypes.length > 0) {
      errors.push(`Invalid data types: ${invalidTypes.join(', ')}`);
    }
  }

  // Validate date range
  if (request.date_range_start && request.date_range_end) {
    if (request.date_range_start >= request.date_range_end) {
      errors.push('Date range start must be before end date');
    }

    const daysDiff = (request.date_range_end.getTime() - request.date_range_start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > ExportLimits.MAX_DATE_RANGE_DAYS) {
      errors.push(`Date range cannot exceed ${ExportLimits.MAX_DATE_RANGE_DAYS} days`);
    }
  }

  // Check for potential large data exports
  if (request.data_types.includes(ExportDataType.EVENTS)) {
    warnings.push('Events export may contain large amounts of data');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check if user can request data export (rate limiting)
 */
export async function checkExportRateLimit(userId: string, companyId: string): Promise<ExportRateLimitInfo> {
  try {
    const result = await sql.select<{ can_request: boolean }>(
      'SELECT can_request_data_export($1, $2) as can_request',
      [userId, companyId]
    );

    const canRequest = result[0]?.can_request || false;

    // Get additional rate limit info
    const recentRequests = await sql.select<{ count: number; last_requested_at: Date }>(
      `SELECT 
         COUNT(*) as count,
         MAX(requested_at) as last_requested_at
       FROM data_export_requests
       WHERE user_id = $1 AND company_id = $2
         AND requested_at > NOW() - INTERVAL '24 hours'`,
      [userId, companyId]
    );

    const count = recentRequests[0]?.count || 0;
    const lastRequestedAt = recentRequests[0]?.last_requested_at;

    // Calculate next allowed time if rate limited
    let nextAllowedAt: Date | undefined;
    if (!canRequest && lastRequestedAt) {
      nextAllowedAt = new Date(lastRequestedAt.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      can_request: canRequest,
      next_allowed_at: nextAllowedAt,
      existing_request_count: count,
      max_requests_per_day: ExportLimits.RATE_LIMIT_REQUESTS_PER_DAY
    };
  } catch (error) {
    logger.error('Failed to check export rate limit', {
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to check rate limit',
      'RATE_LIMIT_CHECK_FAILED',
      'system',
      true
    );
  }
}

/**
 * Create a new data export request
 */
export async function createExportRequest(
  userId: string,
  companyId: string,
  request: CreateExportRequestRequest,
  requestIp?: string,
  userAgent?: string
): Promise<CreateExportRequestResponse> {
  try {
    // Validate request
    const validation = validateExportRequest(request);
    if (!validation.valid) {
      throw new DataExportError(
        `Invalid export request: ${validation.errors.join(', ')}`,
        'INVALID_REQUEST',
        'validation',
        false,
        { errors: validation.errors }
      );
    }

    // Check rate limit
    const rateLimitInfo = await checkExportRateLimit(userId, companyId);
    if (!rateLimitInfo.can_request) {
      throw new DataExportError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT_EXCEEDED',
        'rate_limit',
        false,
        { next_allowed_at: rateLimitInfo.next_allowed_at }
      );
    }

    // Create export request in database
    const requestId = await sql.insert<{ id: string }>(
      `SELECT create_data_export_request(
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       ) as id`,
      [
        userId,
        companyId,
        request.export_format,
        request.data_types,
        request.date_range_start || null,
        request.date_range_end || null,
        requestIp || null,
        userAgent || null,
        request.metadata || {}
      ]
    );

    if (!requestId) {
      throw new DataExportError(
        'Failed to create export request',
        'CREATION_FAILED',
        'system',
        true
      );
    }

    logger.info('Data export request created', {
      requestId: requestId.id,
      userId,
      companyId,
      exportFormat: request.export_format,
      dataTypes: request.data_types,
      dateRange: {
        start: request.date_range_start,
        end: request.date_range_end
      }
    });

    // Start processing in background (don't await)
    processExportRequest(requestId.id).catch(error => {
      logger.error('Background export processing failed', {
        requestId: requestId.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return {
      request_id: requestId.id,
      status: ExportStatus.PENDING,
      message: 'Export request created successfully. Processing will begin shortly.'
    };

  } catch (error) {
    if (error instanceof DataExportError) {
      throw error;
    }

    logger.error('Failed to create export request', {
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new DataExportError(
      'Failed to create export request',
      'CREATION_FAILED',
      'system',
      true
    );
  }
}

/**
 * Process export request in background
 */
async function processExportRequest(requestId: string): Promise<void> {
  try {
    // Get request details
    const requests = await sql.select<DataExportRequest>(
      `SELECT * FROM data_export_requests WHERE id = $1`,
      [requestId]
    );

    if (requests.length === 0) {
      logger.error('Export request not found for processing', { requestId });
      return;
    }

    const request = requests[0];

    // Update status to processing
    await sql.execute(
      'SELECT update_data_export_request_status($1, $2)',
      [requestId, ExportStatus.PROCESSING]
    );

    logger.info('Starting export processing', {
      requestId,
      exportFormat: request.export_format,
      dataTypes: request.data_types
    });

    // Process the export
    const result = await generateExportFile({
      request_id: requestId,
      user_id: request.user_id,
      company_id: request.company_id,
      export_format: request.export_format,
      data_types: request.data_types,
      date_range_start: request.date_range_start,
      date_range_end: request.date_range_end,
      include_sensitive_data: true,
      compress_output: true,
      encrypt_output: true
    });

    if (result.success) {
      // Update status to completed
      await sql.execute(
        'SELECT update_data_export_request_status($1, $2, $3, $4, $5)',
        [
          requestId,
          ExportStatus.COMPLETED,
          null,
          result.file_size_bytes,
          result.record_count
        ]
      );

      logger.info('Export processing completed successfully', {
        requestId,
        filePath: result.file_path,
        fileSizeBytes: result.file_size_bytes,
        recordCount: result.record_count
      });
    } else {
      // Update status to failed
      await sql.execute(
        'SELECT update_data_export_request_status($1, $2, $3)',
        [requestId, ExportStatus.FAILED, result.error_message]
      );

      logger.error('Export processing failed', {
        requestId,
        error: result.error_message
      });
    }

  } catch (error) {
    logger.error('Export processing encountered error', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    // Update status to failed
    await sql.execute(
      'SELECT update_data_export_request_status($1, $2, $3)',
      [requestId, ExportStatus.FAILED, error instanceof Error ? error.message : String(error)]
    );
  }
}

/**
 * Generate export file based on request parameters
 */
async function generateExportFile(options: ExportProcessingOptions): Promise<ExportProcessingResult> {
  try {
    // Collect data based on requested types
    const exportedData: ExportedData = {
      metadata: {
        export_request_id: options.request_id,
        exported_at: new Date(),
        data_types: options.data_types,
        record_counts: {} as Record<ExportDataType, number>,
        file_size_bytes: 0,
        checksum: ''
      }
    };

    let totalRecords = 0;

    // Export each requested data type
    for (const dataType of options.data_types) {
      const data = await exportDataType(dataType, options);
      (exportedData as any)[dataType] = data;
      exportedData.metadata.record_counts[dataType] = Array.isArray(data) ? data.length : 0;
      totalRecords += exportedData.metadata.record_counts[dataType];
    }

    // Generate file based on format
    const fileName = `${options.request_id}_${Date.now()}.${options.export_format}`;
    const filePath = join(EXPORT_DIR, fileName);

    let fileSizeBytes = 0;
    let checksum = '';

    if (options.export_format === ExportFormat.JSON) {
      const jsonData = JSON.stringify(exportedData, null, 2);
      const encryptedData = options.encrypt_output ? await encrypt(jsonData) : jsonData;
      const compressedData = options.compress_output ? await compressData(encryptedData) : Buffer.from(encryptedData);
      
      await writeFile(filePath, compressedData);
      fileSizeBytes = compressedData.length;
      checksum = createHash('sha256').update(compressedData).digest('hex');
    } else if (options.export_format === ExportFormat.CSV) {
      const csvData = await convertToCSV(exportedData);
      const encryptedData = options.encrypt_output ? await encrypt(csvData) : csvData;
      const compressedData = options.compress_output ? await compressData(encryptedData) : Buffer.from(encryptedData);
      
      await writeFile(filePath, compressedData);
      fileSizeBytes = compressedData.length;
      checksum = createHash('sha256').update(compressedData).digest('hex');
    } else if (options.export_format === ExportFormat.PDF) {
      // PDF generation would require additional dependencies
      throw new DataExportError(
        'PDF export format not yet implemented',
        'FORMAT_NOT_SUPPORTED',
        'validation',
        false
      );
    }

    // Check file size limits
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      await cleanupFile(filePath);
      throw new DataExportError(
        `Export file size (${fileSizeBytes} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE_BYTES} bytes)`,
        'FILE_TOO_LARGE',
        'validation',
        false
      );
    }

    // Create file record in database
    const fileId = await sql.insert<{ id: string }>(
      `SELECT create_data_export_file(
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       ) as id`,
      [
        options.request_id,
        fileName,
        filePath,
        fileSizeBytes,
        getMimeType(options.export_format, options.compress_output),
        checksum,
        options.encrypt_output ? generateSecureToken() : null,
        options.encrypt_output,
        options.compress_output ? CompressionType.GZIP : CompressionType.NONE
      ]
    );

    if (!fileId) {
      await cleanupFile(filePath);
      throw new DataExportError(
        'Failed to create file record',
        'FILE_RECORD_FAILED',
        'system',
        true
      );
    }

    return {
      success: true,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      record_count: totalRecords,
      checksum
    };

  } catch (error) {
    if (error instanceof DataExportError) {
      throw error;
    }

    return {
      success: false,
      error_message: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Export specific data type
 */
async function exportDataType(dataType: ExportDataType, options: ExportProcessingOptions): Promise<any[]> {
  try {
    switch (dataType) {
      case ExportDataType.USERS:
        return await exportUserData(options);
      case ExportDataType.CASES:
        return await exportCaseData(options);
      case ExportDataType.EVENTS:
        return await exportEventData(options);
      case ExportDataType.RECOVERY_ACTIONS:
        return await exportRecoveryActionData(options);
      case ExportDataType.MEMBERSHIPS:
        return await exportMembershipData(options);
      case ExportDataType.SETTINGS:
        return await exportSettingsData(options);
      case ExportDataType.CONSENT_RECORDS:
        return await exportConsentRecordData(options);
      default:
        throw new DataExportError(
          `Unsupported data type: ${dataType}`,
          'UNSUPPORTED_DATA_TYPE',
          'validation',
          false
        );
    }
  } catch (error) {
    logger.error(`Failed to export data type: ${dataType}`, {
      dataType,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Export user data
 */
async function exportUserData(options: ExportProcessingOptions): Promise<ExportUserData[]> {
  // This would query user data from the database
  // For now, return empty array as user data structure would depend on the actual schema
  return [];
}

/**
 * Export case data
 */
async function exportCaseData(options: ExportProcessingOptions): Promise<ExportCaseData[]> {
  try {
    let query = `SELECT * FROM recovery_cases WHERE company_id = $1`;
    const params: any[] = [options.company_id];

    if (options.date_range_start) {
      query += ` AND first_failure_at >= $${params.length + 1}`;
      params.push(options.date_range_start);
    }

    if (options.date_range_end) {
      query += ` AND first_failure_at <= $${params.length + 1}`;
      params.push(options.date_range_end);
    }

    query += ` ORDER BY first_failure_at DESC`;

    // Limit records for performance
    if (options.include_sensitive_data) {
      query += ` LIMIT ${ExportLimits.MAX_RECORDS_PER_EXPORT}`;
    }

    return await sql.select<ExportCaseData>(query, params, options.company_id);
  } catch (error) {
    logger.error('Failed to export case data', {
      companyId: options.company_id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to export case data',
      'DATA_EXPORT_FAILED',
      'system',
      true
    );
  }
}

/**
 * Export event data
 */
async function exportEventData(options: ExportProcessingOptions): Promise<ExportEventData[]> {
  try {
    let query = `SELECT * FROM events WHERE company_id = $1`;
    const params: any[] = [options.company_id];

    if (options.date_range_start) {
      query += ` AND created_at >= $${params.length + 1}`;
      params.push(options.date_range_start);
    }

    if (options.date_range_end) {
      query += ` AND created_at <= $${params.length + 1}`;
      params.push(options.date_range_end);
    }

    query += ` ORDER BY created_at DESC`;

    // Limit records for performance
    if (options.include_sensitive_data) {
      query += ` LIMIT ${ExportLimits.MAX_RECORDS_PER_EXPORT}`;
    }

    const events = await sql.select<ExportEventData>(query, params, options.company_id);

    // Redact sensitive payload data if not including sensitive data
    if (!options.include_sensitive_data) {
      return events.map(event => ({
        ...event,
        payload: '[REDACTED]'
      }));
    }

    return events;
  } catch (error) {
    logger.error('Failed to export event data', {
      companyId: options.company_id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to export event data',
      'DATA_EXPORT_FAILED',
      'system',
      true
    );
  }
}

/**
 * Export recovery action data
 */
async function exportRecoveryActionData(options: ExportProcessingOptions): Promise<ExportRecoveryActionData[]> {
  try {
    let query = `SELECT * FROM recovery_actions WHERE company_id = $1`;
    const params: any[] = [options.company_id];

    if (options.date_range_start) {
      query += ` AND created_at >= $${params.length + 1}`;
      params.push(options.date_range_start);
    }

    if (options.date_range_end) {
      query += ` AND created_at <= $${params.length + 1}`;
      params.push(options.date_range_end);
    }

    query += ` ORDER BY created_at DESC`;

    // Limit records for performance
    if (options.include_sensitive_data) {
      query += ` LIMIT ${ExportLimits.MAX_RECORDS_PER_EXPORT}`;
    }

    return await sql.select<ExportRecoveryActionData>(query, params, options.company_id);
  } catch (error) {
    logger.error('Failed to export recovery action data', {
      companyId: options.company_id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to export recovery action data',
      'DATA_EXPORT_FAILED',
      'system',
      true
    );
  }
}

/**
 * Export membership data
 */
async function exportMembershipData(options: ExportProcessingOptions): Promise<ExportMembershipData[]> {
  // This would query membership data from the database
  // For now, return empty array as membership data structure would depend on the actual schema
  return [];
}

/**
 * Export settings data
 */
async function exportSettingsData(options: ExportProcessingOptions): Promise<ExportSettingsData[]> {
  try {
    const settings = await sql.select<ExportSettingsData>(
      `SELECT * FROM creator_settings WHERE company_id = $1`,
      [options.company_id],
      options.company_id
    );

    return settings;
  } catch (error) {
    logger.error('Failed to export settings data', {
      companyId: options.company_id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to export settings data',
      'DATA_EXPORT_FAILED',
      'system',
      true
    );
  }
}

/**
 * Export consent record data
 */
async function exportConsentRecordData(options: ExportProcessingOptions): Promise<ExportConsentRecordData[]> {
  // This would query consent data from the database
  // For now, return empty array as consent data structure would depend on the actual schema
  return [];
}

/**
 * Convert exported data to CSV format
 */
async function convertToCSV(data: ExportedData): Promise<string> {
  // This would implement CSV conversion logic
  // For now, return a simple CSV representation
  const headers = ['data_type', 'record_count', 'exported_at'];
  const rows = [
    headers.join(','),
    `metadata,${Object.keys(data.metadata.record_counts).reduce((sum, key) => sum + data.metadata.record_counts[key as ExportDataType], 0)},${data.metadata.exported_at.toISOString()}`
  ];

  return rows.join('\n');
}

/**
 * Compress data using gzip
 */
async function compressData(data: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gzip(data, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Get MIME type based on format and compression
 */
function getMimeType(format: ExportFormat, compressed: boolean): string {
  if (compressed) {
    return 'application/gzip';
  }

  switch (format) {
    case ExportFormat.JSON:
      return 'application/json';
    case ExportFormat.CSV:
      return 'text/csv';
    case ExportFormat.PDF:
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Write file to disk
 */
async function writeFile(filePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    writeStream.write(data);
    writeStream.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

/**
 * Clean up file
 */
async function cleanupFile(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch (error) {
    logger.error('Failed to cleanup file', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * List export requests for a user
 */
export async function listExportRequests(
  userId: string,
  companyId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ExportRequestListResponse> {
  try {
    const requests = await sql.select<DataExportRequest>(
      `SELECT * FROM data_export_requests
       WHERE user_id = $1 AND company_id = $2
       ORDER BY requested_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, companyId, limit, offset]
    );

    const totalResult = await sql.select<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM data_export_requests
       WHERE user_id = $1 AND company_id = $2`,
      [userId, companyId]
    );

    const total = totalResult[0]?.count || 0;

    return {
      requests,
      total,
      page: Math.floor(offset / limit) + 1,
      limit
    };
  } catch (error) {
    logger.error('Failed to list export requests', {
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to list export requests',
      'LIST_FAILED',
      'system',
      true
    );
  }
}

/**
 * Get export request by ID
 */
export async function getExportRequest(
  requestId: string,
  userId: string,
  companyId: string
): Promise<DataExportRequest | null> {
  try {
    const requests = await sql.select<DataExportRequest>(
      `SELECT * FROM data_export_requests
       WHERE id = $1 AND user_id = $2 AND company_id = $3`,
      [requestId, userId, companyId]
    );

    return requests[0] || null;
  } catch (error) {
    logger.error('Failed to get export request', {
      requestId,
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to get export request',
      'GET_FAILED',
      'system',
      true
    );
  }
}

/**
 * Get export file for download
 */
export async function getExportFile(
  requestId: string,
  userId: string,
  companyId: string,
  requestIp?: string
): Promise<ExportFileDownloadResponse | null> {
  try {
    // Get export request and validate ownership
    const exportRequest = await getExportRequest(requestId, userId, companyId);
    if (!exportRequest) {
      throw new DataExportError(
        'Export request not found',
        'NOT_FOUND',
        'validation',
        false
      );
    }

    if (exportRequest.status !== ExportStatus.COMPLETED) {
      throw new DataExportError(
        'Export request is not completed',
        'NOT_COMPLETED',
        'validation',
        false
      );
    }

    if (exportRequest.expires_at < new Date()) {
      throw new DataExportError(
        'Export request has expired',
        'EXPIRED',
        'validation',
        false
      );
    }

    // Get export file
    const files = await sql.select<DataExportFile>(
      `SELECT * FROM data_export_files
       WHERE export_request_id = $1`,
      [requestId]
    );

    if (files.length === 0) {
      throw new DataExportError(
        'Export file not found',
        'FILE_NOT_FOUND',
        'validation',
        false
      );
    }

    const file = files[0];

    // Check download limits
    if (file.download_count >= file.max_downloads) {
      throw new DataExportError(
        'Download limit exceeded for this file',
        'DOWNLOAD_LIMIT_EXCEEDED',
        'validation',
        false
      );
    }

    // Record download
    const downloadRecorded = await sql.select<{ record_download: boolean }>(
      `SELECT record_export_file_download($1, $2, $3) as record_download`,
      [file.id, userId, requestIp || null]
    );

    if (!downloadRecorded[0]?.record_download) {
      throw new DataExportError(
        'Failed to record download',
        'DOWNLOAD_RECORD_FAILED',
        'system',
        true
      );
    }

    // Read file data
    const fileData = await readFile(file.file_path);

    return {
      file_id: file.id,
      filename: file.filename,
      file_size_bytes: file.file_size_bytes,
      mime_type: file.mime_type,
      file_data: fileData,
      checksum: file.checksum,
      download_count: file.download_count + 1,
      max_downloads: file.max_downloads,
      expires_at: exportRequest.expires_at
    };

  } catch (error) {
    if (error instanceof DataExportError) {
      throw error;
    }

    logger.error('Failed to get export file', {
      requestId,
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to get export file',
      'DOWNLOAD_FAILED',
      'system',
      true
    );
  }
}

/**
 * Read file from disk
 */
async function readFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(filePath);
    const chunks: Buffer[] = [];

    readStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    readStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    readStream.on('error', reject);
  });
}

/**
 * Delete export request and associated files
 */
export async function deleteExportRequest(
  requestId: string,
  userId: string,
  companyId: string
): Promise<boolean> {
  try {
    // Get export request and validate ownership
    const exportRequest = await getExportRequest(requestId, userId, companyId);
    if (!exportRequest) {
      return false;
    }

    // Get associated files for cleanup
    const files = await sql.select<DataExportFile>(
      `SELECT * FROM data_export_files
       WHERE export_request_id = $1`,
      [requestId]
    );

    // Delete files from disk
    for (const file of files) {
      await cleanupFile(file.file_path);
    }

    // Delete from database (cascade will handle related records)
    const result = await sql.execute(
      `DELETE FROM data_export_requests
       WHERE id = $1 AND user_id = $2 AND company_id = $3`,
      [requestId, userId, companyId]
    );

    return result > 0;

  } catch (error) {
    logger.error('Failed to delete export request', {
      requestId,
      userId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new DataExportError(
      'Failed to delete export request',
      'DELETE_FAILED',
      'system',
      true
    );
  }
}

/**
 * Clean up expired exports
 */
export async function cleanupExpiredExports(): Promise<ExportCleanupResult> {
  try {
    const deletedCount = await sql.select<{ cleanup_expired_exports: number }>(
      'SELECT cleanup_expired_exports()'
    );

    const deletedRequests = deletedCount[0]?.cleanup_expired_exports || 0;

    // Get expired files for disk cleanup
    const expiredFiles = await sql.select<DataExportFile>(
      `SELECT f.* FROM data_export_files f
       INNER JOIN data_export_requests r ON f.export_request_id = r.id
       WHERE r.status = 'expired'`
    );

    // Delete expired files from disk
    let deletedFiles = 0;
    let freedSpace = 0;

    for (const file of expiredFiles) {
      try {
        await cleanupFile(file.file_path);
        deletedFiles++;
        freedSpace += file.file_size_bytes;
      } catch (error) {
        logger.error('Failed to cleanup expired file', {
          fileId: file.id,
          filePath: file.file_path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      deleted_requests: deletedRequests,
      deleted_files: deletedFiles,
      freed_space_bytes: freedSpace,
      errors: []
    };

  } catch (error) {
    logger.error('Failed to cleanup expired exports', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      deleted_requests: 0,
      deleted_files: 0,
      freed_space_bytes: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}