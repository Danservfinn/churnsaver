// Shared types for job queue processing and metrics

export interface JobData {
  eventId: string;
  eventType: string;
  membershipId: string;
  payload: string;
  companyId?: string;
  eventCreatedAt: string;
  priority?: number;
}

export interface WebhookJobResult {
  success: boolean;
  eventId: string;
  skipped?: boolean;
  error?: string;
}

export interface ReminderJobResult {
  success: boolean;
  companyId: string;
  processed: number;
  successful: number;
  failed: number;
  results?: any[];
  error?: string;
}

export interface JobProcessingMetrics {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  skippedJobs: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
}

export interface QueueStats {
  queues: Record<string, {
    created: number;
    retry: number;
    active: number;
    completed: number;
    cancelled: number;
    failed: number;
    total: number;
  }>;
  dlq: {
    failed: number;
    cancelled: number;
    total: number;
  };
  healthy: boolean;
  initialized: boolean;
}

// Company context validation helper
export interface CompanyContext {
  companyId: string;
  isValid: boolean;
  error?: string;
}