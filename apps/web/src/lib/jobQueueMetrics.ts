// Job Queue Metrics Service
// Tracks performance metrics and execution details for job queue operations

import { logger } from './logger';
import { sql } from './db';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from './apiResponse';

// Job execution metrics interface
export interface JobExecutionMetrics {
  jobId: string;
  jobType: string;
  companyId?: string;
  status: string;
  duration: number;
  attempts: number;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  recoveryStrategy?: string;
  circuitBreakerState?: string;
  memoryUsage?: number;
  queueDepth?: number;
  metadata?: Record<string, any>;
}

// Job queue statistics interface
export interface JobQueueStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  deadLetterJobs: number;
  averageProcessingTime: number;
  successRate: number;
  jobsByType: Record<string, number>;
  jobsByStatus: Record<string, number>;
  errorsByCategory: Record<string, number>;
  memoryUsage: number;
  queueDepth: number;
  lastHourThroughput: number;
  lastDayThroughput: number;
}

// Memory pressure metrics interface
export interface MemoryPressureMetrics {
  timestamp: string;
  memoryUsageMb: number;
  activeJobs: number;
  thresholdMb: number;
  pressureLevel: 'normal' | 'warning' | 'critical';
}

// Job queue metrics configuration
export interface JobQueueMetricsConfig {
  enabled: boolean;
  retentionDays: number;
  batchSize: number;
  enableRealTimeMetrics: boolean;
  enableHistoricalMetrics: boolean;
  enablePerformanceAlerts: boolean;
  alertThresholds: {
    errorRate: number;
    averageProcessingTime: number;
    memoryUsage: number;
    queueDepth: number;
  };
}

// Default configuration
const DEFAULT_CONFIG: JobQueueMetricsConfig = {
  enabled: true,
  retentionDays: 90,
  batchSize: 100,
  enableRealTimeMetrics: true,
  enableHistoricalMetrics: true,
  enablePerformanceAlerts: true,
  alertThresholds: {
    errorRate: 5, // 5%
    averageProcessingTime: 30000, // 30 seconds
    memoryUsage: 512, // 512MB
    queueDepth: 100 // 100 jobs
  }
};

export class JobQueueMetricsService {
  private config: JobQueueMetricsConfig;
  private realTimeMetrics: Map<string, JobExecutionMetrics[]> = new Map();
  private metricsBuffer: JobExecutionMetrics[] = [];
  private lastCleanup = Date.now();
  private cleanupInterval = 3600000; // 1 hour

  constructor(config: Partial<JobQueueMetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record job execution metrics
   */
  async recordJobExecution(metrics: JobExecutionMetrics): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Add timestamp
      const metricsWithTimestamp = {
        ...metrics,
        timestamp: new Date().toISOString()
      };

      // Store in real-time metrics
      if (this.config.enableRealTimeMetrics) {
        this.storeRealTimeMetrics(metricsWithTimestamp);
      }

      // Buffer for batch insertion
      this.metricsBuffer.push(metricsWithTimestamp);

      // Flush buffer if needed
      if (this.metricsBuffer.length >= this.config.batchSize) {
        await this.flushMetricsBuffer();
      }

      // Check for performance alerts
      if (this.config.enablePerformanceAlerts) {
        await this.checkPerformanceAlerts(metricsWithTimestamp);
      }

    } catch (error) {
      logger.error('Failed to record job execution metrics', {
        jobId: metrics.jobId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Record job enqueue event
   */
  async recordJobEnqueued(
    jobId: string,
    jobType: string,
    companyId?: string
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await sql.query(`
        INSERT INTO job_queue_metrics (
          job_id, job_type, company_id, status, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [jobId, jobType, companyId, 'enqueued']);

    } catch (error) {
      logger.error('Failed to record job enqueue metrics', {
        jobId,
        jobType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Record job error
   */
  async recordJobError(
    jobType: string,
    error: AppError,
    context: Record<string, any> = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await sql.query(`
        INSERT INTO job_queue_metrics (
          job_type, company_id, status, error_category, error_code,
          error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        jobType,
        context.companyId || null,
        'error',
        error.category,
        error.code,
        error.message
      ]);

    } catch (dbError) {
      logger.error('Failed to record job error metrics', {
        jobType,
        error: error.message,
        dbError: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
  }

  /**
   * Record dead letter job event
   */
  async recordDeadLetterJob(
    jobType: string,
    companyId?: string
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await sql.query(`
        INSERT INTO job_queue_metrics (
          job_type, company_id, status, created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [jobType, companyId, 'dead_letter']);

    } catch (error) {
      logger.error('Failed to record dead letter job metrics', {
        jobType,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Record memory pressure event
   */
  async recordMemoryPressure(
    memoryUsageMb: number,
    activeJobs: number
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const pressureLevel = this.calculatePressureLevel(memoryUsageMb);
      
      await sql.query(`
        INSERT INTO job_queue_metrics (
          job_type, status, memory_usage_mb, created_at
        ) VALUES ($1, $2, $3, NOW())
      `, ['memory_pressure', pressureLevel, memoryUsageMb]);

      logger.warn('Memory pressure recorded', {
        memoryUsageMb,
        activeJobs,
        pressureLevel,
        thresholdMb: this.config.alertThresholds.memoryUsage
      });

    } catch (error) {
      logger.error('Failed to record memory pressure metrics', {
        memoryUsageMb,
        activeJobs,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get job queue statistics
   */
  async getStats(options?: {
    companyId?: string;
    jobType?: string;
    timeRange?: '1h' | '24h' | '7d' | '30d';
  }): Promise<JobQueueStats> {
    if (!this.config.enabled) {
      return this.getEmptyStats();
    }

    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (options?.companyId) {
        whereClause += ` AND company_id = $${params.length + 1}`;
        params.push(options.companyId);
      }

      if (options?.jobType) {
        whereClause += ` AND job_type = $${params.length + 1}`;
        params.push(options.jobType);
      }

      // Add time range filter
      if (options?.timeRange) {
        const timeFilter = this.getTimeFilter(options.timeRange);
        whereClause += ` AND created_at >= ${timeFilter}`;
      }

      const result = await sql.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
          COUNT(*) FILTER (WHERE status = 'dead_letter') as dead_letter_jobs,
          AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as average_processing_time,
          COUNT(DISTINCT job_type) as job_type_count
        FROM job_queue_metrics
        ${whereClause}
      `, params);

      const jobsByTypeResult = await sql.query(`
        SELECT job_type, COUNT(*) as count
        FROM job_queue_metrics
        ${whereClause}
        GROUP BY job_type
      `, params);

      const jobsByStatusResult = await sql.query(`
        SELECT status, COUNT(*) as count
        FROM job_queue_metrics
        ${whereClause}
        GROUP BY status
      `, params);

      const errorsByCategoryResult = await sql.query(`
        SELECT error_category, COUNT(*) as count
        FROM job_queue_metrics
        ${whereClause}
        WHERE error_category IS NOT NULL
        GROUP BY error_category
      `, params);

      const row = result.rows[0] as any;
      const totalJobs = parseInt(row.total_jobs);
      const completedJobs = parseInt(row.completed_jobs);
      const failedJobs = parseInt(row.failed_jobs);
      const deadLetterJobs = parseInt(row.dead_letter_jobs);
      const averageProcessingTime = parseFloat(row.average_processing_time) || 0;

      const jobsByType: Record<string, number> = {};
      jobsByTypeResult.rows.forEach((r: any) => {
        jobsByType[r.job_type] = parseInt(r.count);
      });

      const jobsByStatus: Record<string, number> = {};
      jobsByStatusResult.rows.forEach((r: any) => {
        jobsByStatus[r.status] = parseInt(r.count);
      });

      const errorsByCategory: Record<string, number> = {};
      errorsByCategoryResult.rows.forEach((r: any) => {
        errorsByCategory[r.error_category] = parseInt(r.count);
      });

      const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

      return {
        totalJobs,
        completedJobs,
        failedJobs,
        deadLetterJobs,
        averageProcessingTime,
        successRate,
        jobsByType,
        jobsByStatus,
        errorsByCategory,
        memoryUsage: this.getCurrentMemoryUsage(),
        queueDepth: await this.getCurrentQueueDepth(),
        lastHourThroughput: await this.getThroughput('1h'),
        lastDayThroughput: await this.getThroughput('24h')
      };
    } catch (error) {
      logger.error('Failed to get job queue stats', {
        error: error instanceof Error ? error.message : String(error),
        options
      });
      
      return this.getEmptyStats();
    }
  }

  /**
   * Get real-time metrics for specific job type
   */
  getRealTimeMetrics(jobType: string): JobExecutionMetrics[] {
    return this.realTimeMetrics.get(jobType) || [];
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    timestamp: string;
    throughput: number;
    averageProcessingTime: number;
    errorRate: number;
    memoryUsage: number;
  }[]> {
    if (!this.config.enabled) return [];

    try {
      const timeFilter = this.getTimeFilter(timeRange);
      
      const result = await sql.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as timestamp,
          COUNT(*) as throughput,
          AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as average_processing_time,
          COUNT(*) FILTER (WHERE status = 'failed')::float / COUNT(*) as error_rate,
          AVG(memory_usage_mb) FILTER (WHERE memory_usage_mb IS NOT NULL) as memory_usage
        FROM job_queue_metrics
        WHERE created_at >= ${timeFilter}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY timestamp ASC
      `);

      return result.rows.map((row: any) => ({
        timestamp: row.timestamp,
        throughput: parseInt(row.throughput),
        averageProcessingTime: parseFloat(row.average_processing_time) || 0,
        errorRate: parseFloat(row.error_rate) || 0,
        memoryUsage: parseFloat(row.memory_usage) || 0
      }));
    } catch (error) {
      logger.error('Failed to get performance trends', {
        error: error instanceof Error ? error.message : String(error),
        timeRange
      });
      return [];
    }
  }

  /**
   * Clean up old metrics
   */
  async cleanup(retentionDays?: number): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      const retention = retentionDays || this.config.retentionDays;
      
      const result = await sql.query(`
        DELETE FROM job_queue_metrics 
        WHERE created_at < NOW() - INTERVAL '${retention} days'
        RETURNING id
      `);

      cleaned = result.rows.length;
      
      logger.info('Job queue metrics cleanup completed', {
        cleaned,
        retentionDays: retention
      });
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('Job queue metrics cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        retentionDays
      });
    }

    return { cleaned, errors };
  }

  /**
   * Store real-time metrics
   */
  private storeRealTimeMetrics(metrics: JobExecutionMetrics & { timestamp: string }): void {
    const jobType = metrics.jobType;
    
    if (!this.realTimeMetrics.has(jobType)) {
      this.realTimeMetrics.set(jobType, []);
    }
    
    const typeMetrics = this.realTimeMetrics.get(jobType)!;
    typeMetrics.push(metrics);
    
    // Keep only last 1000 metrics per job type
    if (typeMetrics.length > 1000) {
      typeMetrics.splice(0, typeMetrics.length - 1000);
    }
  }

  /**
   * Flush metrics buffer to database
   */
  private async flushMetricsBuffer(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    try {
      const values = this.metricsBuffer.map(m => [
        m.jobId,
        m.jobType,
        m.companyId || null,
        m.status,
        m.duration || null,
        m.attempts,
        m.errorCategory || null,
        m.errorCode || null,
        m.errorMessage || null,
        m.recoveryStrategy || null,
        m.circuitBreakerState || null,
        m.memoryUsage || null,
        m.queueDepth || null,
        JSON.stringify(m.metadata || {})
      ]);

      await sql.query(`
        INSERT INTO job_queue_metrics (
          job_id, job_type, company_id, status, duration_ms,
          attempts, error_category, error_code, error_message,
          recovery_strategy, circuit_breaker_state, memory_usage_mb,
          queue_depth, created_at
        ) VALUES ${values.map((_, index) => 
          `($${index * 11 + 1}, $${index * 11 + 2}, $${index * 11 + 3}, $${index * 11 + 4}, $${index * 11 + 5}, $${index * 11 + 6}, $${index * 11 + 7}, $${index * 11 + 8}, $${index * 11 + 9}, $${index * 11 + 10}, $${index * 11 + 11}, NOW())`
        ).join(', ')}
      `, values.flat());

      this.metricsBuffer = [];
      
      logger.debug('Job queue metrics buffer flushed', {
        recordsFlushed: values.length
      });
    } catch (error) {
      logger.error('Failed to flush metrics buffer', {
        error: error instanceof Error ? error.message : String(error),
        bufferSize: this.metricsBuffer.length
      });
    }
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(metrics: JobExecutionMetrics & { timestamp: string }): Promise<void> {
    const alerts: string[] = [];

    // Check processing time
    if (metrics.duration && metrics.duration > this.config.alertThresholds.averageProcessingTime) {
      alerts.push(`High processing time: ${metrics.duration}ms`);
    }

    // Check memory usage
    if (metrics.memoryUsage && metrics.memoryUsage > this.config.alertThresholds.memoryUsage) {
      alerts.push(`High memory usage: ${metrics.memoryUsage}MB`);
    }

    // Check queue depth
    if (metrics.queueDepth && metrics.queueDepth > this.config.alertThresholds.queueDepth) {
      alerts.push(`High queue depth: ${metrics.queueDepth} jobs`);
    }

    if (alerts.length > 0) {
      logger.warn('Performance alerts triggered', {
        jobId: metrics.jobId,
        jobType: metrics.jobType,
        alerts
      });
    }
  }

  /**
   * Calculate pressure level based on memory usage
   */
  private calculatePressureLevel(memoryUsageMb: number): 'normal' | 'warning' | 'critical' {
    const threshold = this.config.alertThresholds.memoryUsage;
    
    if (memoryUsageMb >= threshold * 0.9) return 'critical';
    if (memoryUsageMb >= threshold * 0.7) return 'warning';
    return 'normal';
  }

  /**
   * Get time filter for queries
   */
  private getTimeFilter(timeRange: string): string {
    const intervals: Record<string, string> = {
      '1h': "NOW() - INTERVAL '1 hour'",
      '24h': "NOW() - INTERVAL '24 hours'",
      '7d': "NOW() - INTERVAL '7 days'",
      '30d': "NOW() - INTERVAL '30 days'"
    };
    
    return intervals[timeRange] || intervals['24h'];
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024);
    }
    return 0;
  }

  /**
   * Get current queue depth
   */
  private async getCurrentQueueDepth(): Promise<number> {
    try {
      const result = await sql.query(`
        SELECT COUNT(*) as count
        FROM job_queue_metrics
        WHERE status = 'processing'
        AND created_at >= NOW() - INTERVAL '1 hour'
      `);
      
      return parseInt((result.rows[0] as any)?.count || '0');
    } catch (error) {
      logger.error('Failed to get current queue depth', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Get throughput for time range
   */
  private async getThroughput(timeRange: string): Promise<number> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);
      
      const result = await sql.query(`
        SELECT COUNT(*) as count
        FROM job_queue_metrics
        WHERE created_at >= ${timeFilter}
        AND status IN ('completed', 'failed')
      `);
      
      return parseInt((result.rows[0] as any)?.count || '0');
    } catch (error) {
      logger.error('Failed to get throughput', {
        error: error instanceof Error ? error.message : String(error),
        timeRange
      });
      return 0;
    }
  }

  /**
   * Get empty stats object
   */
  private getEmptyStats(): JobQueueStats {
    return {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      deadLetterJobs: 0,
      averageProcessingTime: 0,
      successRate: 0,
      jobsByType: {},
      jobsByStatus: {},
      errorsByCategory: {},
      memoryUsage: 0,
      queueDepth: 0,
      lastHourThroughput: 0,
      lastDayThroughput: 0
    };
  }

  /**
   * Periodic cleanup
   */
  async periodicCleanup(): Promise<void> {
    const now = Date.now();
    
    if (now - this.lastCleanup >= this.cleanupInterval) {
      await this.cleanup();
      this.lastCleanup = now;
    }
  }
}

// Export singleton instance
export const jobQueueMetrics = new JobQueueMetricsService();

// Export convenience functions
export async function recordJobExecution(metrics: JobExecutionMetrics): Promise<void> {
  return jobQueueMetrics.recordJobExecution(metrics);
}

export async function getJobQueueStats(options?: {
  companyId?: string;
  jobType?: string;
  timeRange?: '1h' | '24h' | '7d' | '30d';
}): Promise<JobQueueStats> {
  return jobQueueMetrics.getStats(options);
}

export async function getJobQueuePerformanceTrends(
  timeRange?: '1h' | '24h' | '7d' | '30d'
): Promise<{
  timestamp: string;
  throughput: number;
  averageProcessingTime: number;
  errorRate: number;
  memoryUsage: number;
}[]> {
  return jobQueueMetrics.getPerformanceTrends(timeRange);
}