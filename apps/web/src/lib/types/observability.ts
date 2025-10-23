import { RequestContext } from '@/lib/apiResponse';

// Context for monitoring operations
export interface MonitoringContext {
  endpoint?: string;
  method?: string;
  responseTime?: number;
  userId?: string;
  companyId?: string;
  requestId?: string;
  startTime?: number;
  url?: string;
  ip?: string;
  userAgent?: string;
}

// Context for recovery operations
export interface RecoveryContext {
  service?: string;
  cacheKey?: string;
  endpoint?: string;
  method?: string;
  responseTime?: number;
  userId?: string;
  companyId?: string;
  requestId?: string;
  startTime?: number;
  url?: string;
  ip?: string;
  userAgent?: string;
  operation?: string;
  jobId?: string;
  [key: string]: any; // Allow additional properties
}