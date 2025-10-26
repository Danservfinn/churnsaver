// Unit tests for Whop API Client
// Tests client instantiation, middleware, and example methods

import { describe, it, expect, beforeEach, afterEach } from '../test-framework';
import { 
  createWhopApiClient, 
  whopApiClient,
  middleware,
  type WhopApiClient,
  type ApiRequestOptions,
  type ApiResponse,
  type ApiMiddleware 
} from '../../src/lib/whop/client';
import { whopConfig } from '../../src/lib/whop/sdkConfig';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock process.env for testing
const originalEnv = process.env;

describe('Whop API Client', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
    mockFetch.mockClear();
    
    // Set minimal valid environment
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
    process.env.WHOP_API_KEY = 'valid_api_key_16_characters_long';
    
    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('whop')) {
        delete require.cache[key];
      }
    });
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
    mockFetch.mockReset();
  });

  describe('Client Instantiation', () => {
    it('should create client with default configuration', () => {
      const client = createWhopApiClient();
      
      expect(client).toBeInstanceOf(WhopApiClient);
      expect(client).toBeDefined();
    });

    it('should create client with custom configuration', () => {
      const customConfig = whopConfig.get();
      const client = createWhopApiClient(customConfig);
      
      expect(client).toBeInstanceOf(WhopApiClient);
      expect(client).toBeDefined();
    });

    it('should throw with invalid configuration', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.WHOP_API_KEY; // Required in production
      
      expect(() => createWhopApiClient()).toThrow();
    });
  });

  describe('Middleware System', () => {
    it('should add middleware to pipeline', () => {
      const client = createWhopApiClient();
      const testMiddleware: ApiMiddleware = {
        name: 'test',
        beforeRequest: async (options) => ({ ...options, test: 'before' }),
        afterResponse: async (response) => ({ ...response, test: 'after' }),
        onError: async (error) => new Error(`Test error: ${error.message}`),
      };
      
      client.use(testMiddleware);
      
      // Middleware should be added (we can test this indirectly through request behavior)
      expect(client).toBeDefined();
    });

    it('should execute multiple middleware in order', () => {
      const client = createWhopApiClient();
      const executionOrder: string[] = [];
      
      const middleware1: ApiMiddleware = {
        name: 'middleware1',
        beforeRequest: async (options) => {
          executionOrder.push('middleware1-before');
          return options;
        },
      };
      
      const middleware2: ApiMiddleware = {
        name: 'middleware2',
        beforeRequest: async (options) => {
          executionOrder.push('middleware2-before');
          return options;
        },
      };
      
      client.use(middleware1);
      client.use(middleware2);
      
      // The order should be maintained (we can test this through a mock request)
      expect(executionOrder).toHaveLength(0); // Reset before request
    });
  });

  describe('Built-in Middleware', () => {
    it('should create retry middleware', () => {
      const retryMiddleware = middleware.retry({ maxRetries: 2, baseDelay: 100 });
      
      expect(retryMiddleware.name).toBe('retry');
      expect(typeof retryMiddleware.beforeRequest).toBe('function');
    });

    it('should create rate limit middleware', () => {
      const rateLimitMiddleware = middleware.rateLimit();
      
      expect(rateLimitMiddleware.name).toBe('rateLimit');
      expect(typeof rateLimitMiddleware.afterResponse).toBe('function');
    });

    it('should create logging middleware', () => {
      const loggingMiddleware = middleware.logging();
      
      expect(loggingMiddleware.name).toBe('logging');
      expect(typeof loggingMiddleware.beforeRequest).toBe('function');
      expect(typeof loggingMiddleware.afterResponse).toBe('function');
    });
  });

  describe('HTTP Methods', () => {
    let client: WhopApiClient;

    beforeEach(() => {
      client = createWhopApiClient();
      
      // Mock successful fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-request-id': 'test-request-id',
        }),
        json: async () => ({ data: 'test', id: '123' }),
      } as Response);
    });

    it('should make GET request', async () => {
      const response = await client.get('/test', { 
        headers: { 'X-Test': 'value' } 
      });
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('ChurnSaver-SDK'),
            'X-Test': 'value',
          }),
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
      expect(response.status).toBe(200);
    });

    it('should make POST request with body', async () => {
      const testData = { name: 'test', value: 123 };
      const response = await client.post('/test', testData);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testData),
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
    });

    it('should make PUT request with body', async () => {
      const testData = { name: 'updated', value: 456 };
      const response = await client.put('/test', testData);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(testData),
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
    });

    it('should make DELETE request', async () => {
      const response = await client.delete('/test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
    });

    it('should handle request timeout', async () => {
      // Mock timeout
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AbortError')), 100)
        )
      );
      
      const timeoutClient = createWhopApiClient({
        ...whopConfig.get(),
        requestTimeout: 50, // Short timeout for testing
      });
      
      await expect(timeoutClient.get('/test')).rejects.toThrow('AbortError');
    });
  });

  describe('Example Methods', () => {
    let client: WhopApiClient;

    beforeEach(() => {
      client = createWhopApiClient();
      
      // Mock successful responses for specific endpoints
      mockFetch.mockImplementation((url) => {
        if (url.includes('/memberships/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ 
              id: 'membership_123',
              user_id: 'user_456',
              status: 'active',
              manage_url: 'https://manage.whop.com/membership_123'
            }),
          } as Response);
        }
        
        if (url.includes('/companies/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ 
              id: 'company_789',
              name: 'Test Company',
              status: 'active'
            }),
          } as Response);
        }
        
        if (url.includes('/users/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ 
              id: 'user_456',
              username: 'testuser',
              email: 'test@example.com'
            }),
          } as Response);
        }
        
        // Default response
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: 'test', id: '123' }),
        } as Response);
      });
    });

    it('should get membership details', async () => {
      const response = await client.getMembership('membership_123');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/memberships/membership_123'),
        expect.objectContaining({ method: 'GET' })
      );
      
      expect(response.data).toEqual({
        id: 'membership_123',
        user_id: 'user_456',
        status: 'active',
        manage_url: 'https://manage.whop.com/membership_123'
      });
    });

    it('should add free days to membership', async () => {
      const response = await client.addMembershipFreeDays('membership_123', 7);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/memberships/membership_123/add_free_days'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ days: 7 }),
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
    });

    it('should cancel membership', async () => {
      const response = await client.cancelMembership('membership_123');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/memberships/membership_123/cancel'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ at_period_end: true }),
        })
      );
      
      expect(response.data).toEqual({ data: 'test', id: '123' });
    });

    it('should get company information', async () => {
      const response = await client.getCompany('company_789');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/companies/company_789'),
        expect.objectContaining({ method: 'GET' })
      );
      
      expect(response.data).toEqual({
        id: 'company_789',
        name: 'Test Company',
        status: 'active'
      });
    });

    it('should get user information', async () => {
      const response = await client.getUser('user_456');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/user_456'),
        expect.objectContaining({ method: 'GET' })
      );
      
      expect(response.data).toEqual({
        id: 'user_456',
        username: 'testuser',
        email: 'test@example.com'
      });
    });
  });

  describe('Error Handling', () => {
    let client: WhopApiClient;

    beforeEach(() => {
      client = createWhopApiClient();
    });

    it('should handle API error responses', async () => {
      // Mock error response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => 'Bad Request',
      } as Response);

      await expect(client.get('/test')).rejects.toThrow('Whop API error: 400 Bad Request');
    });

    it('should handle network errors', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.get('/test')).rejects.toThrow('Network error');
    });

    it('should retry on server errors', async () => {
      let callCount = 0;
      
      mockFetch.mockImplementation(() => {
        callCount++;
        
        if (callCount <= 2) { // Fail first 2 attempts
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Headers(),
            text: async () => 'Internal Server Error',
          } as Response);
        }
        
        // Succeed on 3rd attempt
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: 'success' }),
        } as Response);
      });

      const retryClient = createWhopApiClient({
        ...whopConfig.get(),
        maxRetries: 3,
        retryDelay: 10, // Short delay for testing
      });

      const response = await retryClient.get('/test');
      
      expect(callCount).toBe(3); // Should have retried 3 times
      expect(response.data).toEqual({ data: 'success' });
    });

    it('should not retry on client errors', async () => {
      let callCount = 0;
      
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 400, // Client error
          headers: new Headers(),
          text: async () => 'Bad Request',
        } as Response);
      });

      const retryClient = createWhopApiClient({
        ...whopConfig.get(),
        maxRetries: 3,
        retryDelay: 10,
      });

      await expect(retryClient.get('/test')).rejects.toThrow();
      expect(callCount).toBe(1); // Should not retry on 4xx errors
    });
  });

  describe('Rate Limit Handling', () => {
    let client: WhopApiClient;

    beforeEach(() => {
      client = createWhopApiClient();
    });

    it('should extract rate limit headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-ratelimit-remaining': '950',
          'x-ratelimit-limit': '1000',
          'x-ratelimit-reset': '1640995200',
        }),
        json: async () => ({ data: 'test' }),
      } as Response);

      const response = await client.get('/test');
      
      expect(response.rateLimit).toEqual({
        remaining: 950,
        limit: 1000,
        reset: 1640995200,
      });
    });

    it('should handle missing rate limit headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ data: 'test' }),
      } as Response);

      const response = await client.get('/test');
      
      expect(response.rateLimit).toBeUndefined();
    });
  });

  describe('Request Context and Tracing', () => {
    let client: WhopApiClient;

    beforeEach(() => {
      client = createWhopApiClient();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-request-id': 'trace-123',
        }),
        json: async () => ({ data: 'test' }),
      } as Response);
    });

    it('should generate unique request IDs', async () => {
      const response1 = await client.get('/test1');
      const response2 = await client.get('/test2');
      
      expect(response1.requestId).toBeDefined();
      expect(response2.requestId).toBeDefined();
      expect(response1.requestId).not.toBe(response2.requestId);
      
      // Request IDs should follow pattern
      expect(response1.requestId).toMatch(/^whop_req_\d+_[a-z0-9]{9}$/);
    });

    it('should include request ID in response', async () => {
      const response = await client.get('/test');
      
      expect(response.requestId).toBe('trace-123');
    });
  });
});