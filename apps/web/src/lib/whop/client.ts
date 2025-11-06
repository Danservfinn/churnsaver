// Whop API Client Wrapper
// Provides a reusable client with middleware hooks and standardized request handling

import { Whop } from '@whop/sdk';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { logger } from '@/lib/logger';

/**
 * API request options with middleware support
 */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

/**
 * API response with metadata
 */
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId?: string;
  rateLimit?: {
    remaining: number;
    reset: number;
    limit: number;
  };
}

/**
 * Middleware function interface
 */
export interface ApiMiddleware {
  name: string;
  beforeRequest?: (options: ApiRequestOptions) => ApiRequestOptions | Promise<ApiRequestOptions>;
  afterResponse?: (response: ApiResponse, options: ApiRequestOptions) => ApiResponse | Promise<ApiResponse>;
  onError?: (error: Error, options: ApiRequestOptions) => Error | Promise<Error>;
}

/**
 * Request context for logging and tracing
 */
export interface RequestContext {
  requestId: string;
  method: string;
  endpoint: string;
  startTime: number;
  attempt: number;
}

/**
 * Whop API Client with middleware support
 */
export class WhopApiClient {
  private config: WhopSdkConfig;
  private sdk: Whop;
  private middleware: ApiMiddleware[] = [];

  constructor(config?: WhopSdkConfig) {
    this.config = config || whopConfig.get();
    this.sdk = new Whop({
      appID: this.config.appId,
      apiKey: this.config.apiKey,
      webhookKey: this.config.webhookSecret 
        ? Buffer.from(this.config.webhookSecret, 'utf8').toString('base64') 
        : undefined,
    });
    
    if (this.config.debugMode) {
      logger.info('Whop API Client initialized', {
        appId: this.config.appId,
        hasApiKey: !!this.config.apiKey,
        apiBaseUrl: this.config.apiBaseUrl,
        environment: this.config.environment,
        middlewareCount: this.middleware.length
      });
    }
  }

  /**
   * Add middleware to the request pipeline
   */
  use(middleware: ApiMiddleware): void {
    this.middleware.push(middleware);
    
    if (this.config.debugMode) {
      logger.debug('Middleware added to Whop API client', {
        middlewareName: middleware.name,
        totalMiddleware: this.middleware.length
      });
    }
  }

  /**
   * Generate request ID for tracing
   */
  private generateRequestId(): string {
    return `whop_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract rate limit information from headers
   */
  private extractRateLimit(headers: Record<string, string>) {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const limit = headers['x-ratelimit-limit'];
    
    if (remaining || reset || limit) {
      return {
        remaining: remaining ? parseInt(remaining, 10) : 0,
        reset: reset ? parseInt(reset, 10) : 0,
        limit: limit ? parseInt(limit, 10) : 0,
      };
    }
    
    return undefined;
  }

  /**
   * Execute middleware before request
   */
  private async executeBeforeRequestMiddleware(
    options: ApiRequestOptions,
    context: RequestContext
  ): Promise<ApiRequestOptions> {
    let processedOptions = { ...options };
    
    for (const middleware of this.middleware) {
      if (middleware.beforeRequest) {
        try {
          const result = await middleware.beforeRequest(processedOptions);
          processedOptions = { ...processedOptions, ...result };
          
          if (this.config.debugMode) {
            logger.debug('Before request middleware executed', {
              middleware: middleware.name,
              requestId: context.requestId
            });
          }
        } catch (error) {
          logger.error('Before request middleware failed', {
            middleware: middleware.name,
            error: error instanceof Error ? error.message : String(error),
            requestId: context.requestId
          });
          throw error;
        }
      }
    }
    
    return processedOptions;
  }

  /**
   * Execute middleware after response
   */
  private async executeAfterResponseMiddleware(
    response: ApiResponse,
    options: ApiRequestOptions,
    context: RequestContext
  ): Promise<ApiResponse> {
    let processedResponse = { ...response };
    
    for (const middleware of this.middleware) {
      if (middleware.afterResponse) {
        try {
          const result = await middleware.afterResponse(processedResponse, options);
          processedResponse = { ...processedResponse, ...result };
          
          if (this.config.debugMode) {
            logger.debug('After response middleware executed', {
              middleware: middleware.name,
              requestId: context.requestId
            });
          }
        } catch (error) {
          logger.error('After response middleware failed', {
            middleware: middleware.name,
            error: error instanceof Error ? error.message : String(error),
            requestId: context.requestId
          });
          // Don't throw here, log and continue
        }
      }
    }
    
    return processedResponse;
  }

  /**
   * Execute middleware error handlers
   */
  private async executeErrorMiddleware(
    error: Error,
    options: ApiRequestOptions,
    context: RequestContext
  ): Promise<Error> {
    let processedError = error;
    
    for (const middleware of this.middleware) {
      if (middleware.onError) {
        try {
          const result = await middleware.onError(processedError, options);
          if (result instanceof Error) {
            processedError = result;
          }
          
          if (this.config.debugMode) {
            logger.debug('Error middleware executed', {
              middleware: middleware.name,
              requestId: context.requestId
            });
          }
        } catch (middlewareError) {
          logger.error('Error middleware failed', {
            middleware: middleware.name,
            error: middlewareError instanceof Error ? middlewareError.message : String(middlewareError),
            requestId: context.requestId
          });
          // Don't throw, continue with original error
        }
      }
    }
    
    return processedError;
  }

  /**
   * Make HTTP request with retry logic and middleware
   */
  private async makeRequest<T = any>(
    endpoint: string,
    options: ApiRequestOptions,
    context: RequestContext
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const timeout = options.timeout || this.config.requestTimeout;
    const maxRetries = options.retries !== undefined ? options.retries : this.config.maxRetries;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      context.attempt = attempt;
      
      try {
        if (this.config.debugMode) {
          logger.debug('Making API request', {
            requestId: context.requestId,
            method: options.method || 'GET',
            url,
            attempt,
            maxRetries: maxRetries + 1
          });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        // Apply signal if provided
        const requestSignal = options.signal || controller.signal;
        
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `ChurnSaver-SDK/1.0.0`,
            ...options.headers,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: requestSignal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Whop API error: ${response.status} ${errorText}`);
          (error as any).status = response.status;
          (error as any).responseText = errorText;
          throw error;
        }

        const data = await response.json();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const apiResponse: ApiResponse<T> = {
          data,
          status: response.status,
          headers,
          requestId: context.requestId,
          rateLimit: this.extractRateLimit(headers),
        };

        // Log success
        logger.api('called', {
          endpoint,
          method: options.method || 'GET',
          status_code: response.status,
          duration_ms: Date.now() - context.startTime,
          company_id: headers['x-whop-company-id'],
        });

        return apiResponse;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on client errors (4xx) or abort errors
        if (lastError && ('status' in lastError && typeof lastError.status === 'number' && lastError.status >= 400 && lastError.status < 500)) {
          break;
        }
        
        if (lastError && lastError.name === 'AbortError') {
          break;
        }
        
        if (attempt <= maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          
          logger.warn('API request failed, retrying', {
            requestId: context.requestId,
            attempt,
            maxRetries,
            delay,
            error: lastError.message,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Execute error middleware
    const finalError = await this.executeErrorMiddleware(lastError!, options, context);
    
    logger.api('error', {
      endpoint,
      method: options.method || 'GET',
      status_code: lastError && 'status' in lastError ? (lastError as any).status : undefined,
      duration_ms: Date.now() - context.startTime,
      error: finalError.message,
    });

    throw finalError;
  }

  /**
   * Generic API request method with middleware support
   */
  async request<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const context: RequestContext = {
      requestId: this.generateRequestId(),
      method: options.method || 'GET',
      endpoint,
      startTime: Date.now(),
      attempt: 1,
    };

    try {
      // Execute before request middleware
      const processedOptions = await this.executeBeforeRequestMiddleware(options, context);
      
      // Make the request
      let response = await this.makeRequest<T>(endpoint, processedOptions, context);
      
      // Execute after response middleware
      response = await this.executeAfterResponseMiddleware(response, processedOptions, context);
      
      return response;
    } catch (error) {
      // Execute error middleware
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const finalError = await this.executeErrorMiddleware(errorObj, options, context);
      throw finalError;
    }
  }

  /**
   * Convenience method for GET requests
   */
  async get<T = any>(endpoint: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Convenience method for POST requests
   */
  async post<T = any>(endpoint: string, data?: any, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body: data });
  }

  /**
   * Convenience method for PUT requests
   */
  async put<T = any>(endpoint: string, data?: any, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body: data });
  }

  /**
   * Convenience method for DELETE requests
   */
  async delete<T = any>(endpoint: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Get membership details - example concrete method
   */
  async getMembership(membershipId: string): Promise<ApiResponse> {
    logger.info('Fetching membership details', { membershipId });
    
    return this.get(`/memberships/${membershipId}`);
  }

  /**
   * Add free days to membership - example concrete method
   */
  async addMembershipFreeDays(membershipId: string, days: number): Promise<ApiResponse> {
    logger.info('Adding free days to membership', { membershipId, days });
    
    return this.post(`/memberships/${membershipId}/add_free_days`, { days });
  }

  /**
   * Cancel membership at period end - example concrete method
   */
  async cancelMembership(membershipId: string): Promise<ApiResponse> {
    logger.info('Cancelling membership at period end', { membershipId });
    
    return this.post(`/memberships/${membershipId}/cancel`, { at_period_end: true });
  }

  /**
   * Get company information - example concrete method
   */
  async getCompany(companyId: string): Promise<ApiResponse> {
    logger.info('Fetching company information', { companyId });
    
    return this.get(`/companies/${companyId}`);
  }

  /**
   * Get user information - example concrete method
   */
  async getUser(userId: string): Promise<ApiResponse> {
    logger.info('Fetching user information', { userId });
    
    return this.get(`/users/${userId}`);
  }
}

/**
 * Built-in middleware factories
 */
export const middleware = {
  /**
   * Retry middleware with exponential backoff
   */
  retry: (options: { maxRetries?: number; baseDelay?: number } = {}): ApiMiddleware => ({
    name: 'retry',
    beforeRequest: async (requestOptions) => {
      // Add retry configuration to request options
      return {
        ...requestOptions,
        retries: options.maxRetries,
      };
    },
  }),

  /**
   * Rate limit monitoring middleware
   */
  rateLimit: (): ApiMiddleware => ({
    name: 'rateLimit',
    afterResponse: async (response) => {
      if (response.rateLimit) {
        const { remaining, reset, limit } = response.rateLimit;
        
        if (remaining < limit * 0.1) { // Less than 10% remaining
          logger.warn('API rate limit running low', {
            remaining,
            limit,
            reset: new Date(reset * 1000).toISOString(),
          });
        }
        
        if (remaining === 0) {
          logger.metric('api.rate_limit.exhausted', 1, {
            limit,
            reset: new Date(reset * 1000).toISOString(),
          });
        }
      }
      
      return response;
    },
  }),

  /**
   * Request logging middleware
   */
  logging: (): ApiMiddleware => ({
    name: 'logging',
    beforeRequest: async (requestOptions) => {
      logger.debug('API request starting', {
        method: requestOptions.method,
        headers: Object.keys(requestOptions.headers || {}),
        hasBody: !!requestOptions.body,
      });
      
      return requestOptions;
    },
    afterResponse: async (response, requestOptions) => {
      logger.debug('API request completed', {
        status: response.status,
        requestId: response.requestId,
        hasRateLimit: !!response.rateLimit,
      });
      
      return response;
    },
  }),
};

/**
 * Create a new Whop API client instance
 */
export function createWhopApiClient(config?: WhopSdkConfig): WhopApiClient {
  return new WhopApiClient(config);
}

/**
 * Default client instance for general use
 */
export const whopApiClient = (() => {
  try {
    return new WhopApiClient();
  } catch (error) {
    // Return a mock client in case of configuration error
    logger.error('Failed to initialize Whop API client', { error: error instanceof Error ? error.message : String(error) });
    
    // Return a minimal mock implementation
    return {
      request: async () => {
        throw new Error('Whop API client not initialized due to configuration error');
      },
      get: async () => {
        throw new Error('Whop API client not initialized due to configuration error');
      },
      post: async () => {
        throw new Error('Whop API client not initialized due to configuration error');
      },
      put: async () => {
        throw new Error('Whop API client not initialized due to configuration error');
      },
      delete: async () => {
        throw new Error('Whop API client not initialized due to configuration error');
      }
    } as any;
  }
})();

// Export types for external use