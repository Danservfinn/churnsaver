'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { isQaDemoBypassEnabled } from '@/lib/qaDemo';

export interface WhopContextType {
  companyId: string;
  userId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  refreshContext: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
}

const WhopContext = createContext<WhopContextType | undefined>(undefined);

export interface WhopProviderProps {
  children: React.ReactNode;
}

/**
 * Extract Whop authentication token from various sources
 */
function extractWhopToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // 1. Try URL query parameter (for development/testing)
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token') || urlParams.get('whop_token');
  if (tokenFromUrl) {
    return tokenFromUrl;
  }

  // 2. Try localStorage (for persistence across page reloads)
  try {
    const tokenFromStorage = localStorage.getItem('whop_user_token');
    if (tokenFromStorage) {
      return tokenFromStorage;
    }
  } catch (e) {
    // localStorage may not be available in some contexts
  }

  // 3. Try to get from parent window (if in iframe)
  try {
    const inIframe = window.self !== window.top;
    if (inIframe && window.parent) {
      // Try to access parent window's token (if same origin)
      // Note: This only works if parent is same origin
      const parentToken = (window.parent as any)?.whopUserToken;
      if (parentToken) {
        return parentToken;
      }
    }
  } catch (e) {
    // Cross-origin iframe, can't access parent
  }

  // 4. Try to get from window object (set by Whop SDK or parent)
  const windowToken = (window as any).whopUserToken;
  if (windowToken) {
    return windowToken;
  }

  return null;
}

/**
 * Store token for future use
 */
function storeWhopToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (token) {
      localStorage.setItem('whop_user_token', token);
    } else {
      // Remove token from localStorage when token is null/cleared
      localStorage.removeItem('whop_user_token');
    }
  } catch (e) {
    // localStorage may not be available
  }
}

export function WhopProvider({ children }: WhopProviderProps) {
  // NEVER use APP_ID as companyId fallback - use 'unknown' until proper context is loaded
  const [companyId, setCompanyId] = useState<string>('unknown');
  const [userId, setUserId] = useState<string>('anonymous');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [qaBypassEnabled, setQaBypassEnabled] = useState<boolean>(false);

  const resolveQaDemoBypass = () => {
    // NEVER use WHOP_APP_ID as companyId fallback - use explicit demo company ID or fallback to 'demo-company'
    const companyFallback = env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID || env.QA_DEMO_COMPANY_ID || 'demo-company';
    const userFallback = env.NEXT_PUBLIC_QA_DEMO_USER_ID || env.QA_DEMO_USER_ID || 'demo-user';

    let queryEnabled = false;
    let storedEnabled = false;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('qa_demo') || params.get('demo');
      const normalized = raw?.toLowerCase();
      if (normalized && ['1', 'true', 'yes', 'on'].includes(normalized)) {
        queryEnabled = true;
        try {
          localStorage.setItem('qa_demo_bypass', 'true');
        } catch {
          // ignore storage errors
        }
      }

      try {
        storedEnabled = localStorage.getItem('qa_demo_bypass') === 'true';
      } catch {
        storedEnabled = false;
      }
    }

    const envEnabled = env.NEXT_PUBLIC_QA_DEMO_BYPASS || env.QA_DEMO_BYPASS || false;
    const enabled = (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV !== 'production') && (envEnabled || queryEnabled || storedEnabled);

    return {
      enabled,
      companyId: companyFallback,
      userId: userFallback,
    };
  };

  /**
   * Get authentication headers for API calls
   */
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (qaBypassEnabled || isQaDemoBypassEnabled()) {
      headers['x-qa-demo-bypass'] = '1';
    }

    const token = authToken || extractWhopToken();
    if (token) {
      headers['x-whop-user-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  };

  const fetchContext = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const qaBypass = resolveQaDemoBypass();
      if (qaBypass.enabled) {
        setCompanyId(qaBypass.companyId);
        setUserId(qaBypass.userId);
        setIsAuthenticated(true);
        setQaBypassEnabled(true);
        setIsLoading(false);
        setError(null);
        logger.info?.('QA demo bypass enabled in client context', {
          companyId: qaBypass.companyId,
          userId: qaBypass.userId,
        });
        return;
      }

      // Extract token from various sources
      const token = extractWhopToken();
      if (token) {
        setAuthToken(token);
        storeWhopToken(token);
      }

      // Check if we're in an iframe (Whop app context)
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (!inIframe && !token) {
        // Not in iframe and no token, use default context
        // In development mode, allow bypassing authentication for local testing
        // BUT: Never use APP_ID as companyId - use 'unknown' or require QA demo bypass
        const devMode = env.DEBUG_MODE && env.NODE_ENV === 'development';
        
        setCompanyId('unknown'); // Explicitly unknown - no APP_ID fallback
        setUserId(devMode ? 'dev-user' : 'anonymous');
        setIsAuthenticated(false); // Not authenticated without proper token
        
        logger.info('Whop context initialized for standalone app', {
          companyId: 'unknown',
          userId: devMode ? 'dev-user' : 'anonymous',
          isAuthenticated: false,
          devMode
        });
        return;
      }

      // Try to get context from API with token
      try {
        const headers = getAuthHeaders();
        const response = await fetch('/api/health/context', {
          method: 'GET',
          headers,
          credentials: 'include', // Include cookies if needed
        });

        if (response.ok) {
          const contextData = await response.json();
          const data = contextData.data || contextData;
          
          // Never use APP_ID as fallback - use 'unknown' if API doesn't provide companyId
          setCompanyId(data.companyId || 'unknown');
          setUserId(data.userId || 'anonymous');
          setIsAuthenticated(data.isAuthenticated || false);

          // Store token if we got authenticated context
          if (data.isAuthenticated && token) {
            setAuthToken(token);
            storeWhopToken(token);
          }

          logger.info('Whop context loaded from API', {
            companyId: data.companyId,
            userId: data.userId,
            isAuthenticated: data.isAuthenticated,
            hasToken: !!token
          });
        } else {
          // If API fails but we have a token, log error but don't use APP_ID fallback
          if (env.NODE_ENV === 'development' && token) {
            logger.warn('API context fetch failed - cannot determine companyId without API response', {
              status: response.status,
              hasToken: !!token
            });
            
            // Don't use APP_ID - set to unknown and require proper API response
            setCompanyId('unknown');
            setUserId('dev-user');
            setIsAuthenticated(false); // Not authenticated if API fails
            return;
          }
          
          throw new Error(`API context fetch failed: ${response.status}`);
        }
      } catch (apiError) {
        // Fallback to default context if API fails
        logger.warn('Failed to fetch context from API, using defaults', {
          error: apiError instanceof Error ? apiError.message : String(apiError)
        });

        // In development, log but don't use APP_ID fallback
        if (env.NODE_ENV === 'development' && token) {
          // Token exists but API failed - cannot determine companyId
          setCompanyId('unknown');
          setUserId('dev-user');
          setIsAuthenticated(false); // Not authenticated if API fails
        } else {
          setCompanyId('unknown'); // Never use APP_ID as fallback
          setUserId('anonymous');
          setIsAuthenticated(false);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      logger.error('Whop context initialization failed', {
        error: errorMessage
      });

      // Set fallback values - never use APP_ID as companyId
      setCompanyId('unknown');
      setUserId('anonymous');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshContext = async () => {
    await fetchContext();
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const value: WhopContextType = {
    companyId,
    userId,
    isAuthenticated,
    isLoading,
    error,
    refreshContext,
    getAuthHeaders,
  };

  return (
    <WhopContext.Provider value={value}>
      {children}
    </WhopContext.Provider>
  );
}

export function useWhop(): WhopContextType {
  const context = useContext(WhopContext);
  if (context === undefined) {
    throw new Error('useWhop must be used within a WhopProvider');
  }
  return context;
}

// Hook for checking authentication status
export function useWhopAuth(): {
  isAuthenticated: boolean;
  userId: string;
  companyId: string;
  isLoading: boolean;
} {
  const { isAuthenticated, userId, companyId, isLoading } = useWhop();
  return { isAuthenticated, userId, companyId, isLoading };
}

// Hook for company context
export function useWhopCompany(): {
  companyId: string;
  isLoading: boolean;
} {
  const { companyId, isLoading } = useWhop();
  return { companyId, isLoading };
}

// Hook for user context
export function useWhopUser(): {
  userId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  const { userId, isAuthenticated, isLoading } = useWhop();
  return { userId, isAuthenticated, isLoading };
}