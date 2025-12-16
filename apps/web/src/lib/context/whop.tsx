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
  getAuthHeaders: (overrides?: { companyId?: string }) => Record<string, string>;
}

const WhopContext = createContext<WhopContextType | undefined>(undefined);

export interface WhopProviderProps {
  children: React.ReactNode;
}

/**
 * Extract company ID from URL (path or query params)
 * Whop passes company_id when loading apps in iframe
 */
function extractCompanyId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // 1. Try URL path (for routes like /dashboard/[companyId])
  const pathParts = window.location.pathname.split('/');
  const dashboardIndex = pathParts.indexOf('dashboard');
  if (dashboardIndex >= 0 && pathParts[dashboardIndex + 1]) {
    const pathCompanyId = pathParts[dashboardIndex + 1];
    if (pathCompanyId.startsWith('biz_')) {
      return pathCompanyId;
    }
  }

  // 2. Try URL query parameter (Whop iframe context)
  const urlParams = new URLSearchParams(window.location.search);
  const queryCompanyId = urlParams.get('company_id') || urlParams.get('companyId');
  if (queryCompanyId) {
    return queryCompanyId;
  }

  // 3. Try localStorage (persisted from previous navigation)
  try {
    const storedCompanyId = localStorage.getItem('whop_company_id');
    if (storedCompanyId) {
      return storedCompanyId;
    }
  } catch {
    // localStorage may not be available
  }

  return null;
}

/**
 * Store company ID for persistence across pages
 */
function storeCompanyId(companyId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (companyId && companyId !== 'unknown') {
      localStorage.setItem('whop_company_id', companyId);
    }
  } catch {
    // localStorage may not be available
  }
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
   * @param overrides - Optional overrides for headers
   * @param overrides.companyId - Company ID to include in request (for when token doesn't contain it)
   */
  const getAuthHeaders = (overrides?: { companyId?: string }): Record<string, string> => {
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

    // Pass company ID from URL when token doesn't contain it
    // This is validated server-side against the user's Whop membership
    if (overrides?.companyId) {
      headers['x-company-id'] = overrides.companyId;
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
        storeCompanyId(qaBypass.companyId);
        logger.info?.('QA demo bypass enabled in client context', {
          companyId: qaBypass.companyId,
          userId: qaBypass.userId,
        });
        return;
      }

      // Extract token and company ID from various sources
      const token = extractWhopToken();
      const urlCompanyId = extractCompanyId();

      if (token) {
        setAuthToken(token);
        storeWhopToken(token);
      }

      // Check if we're in an iframe (Whop app context)
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (!inIframe && !token) {
        // Not in iframe and no token, use default context
        // In development mode, allow bypassing authentication for local testing
        // BUT: Never use APP_ID as companyId - use extracted companyId or 'unknown'
        const devMode = env.DEBUG_MODE && env.NODE_ENV === 'development';

        // Use company ID from URL/localStorage if available
        const fallbackCompanyId = urlCompanyId || 'unknown';
        setCompanyId(fallbackCompanyId);
        setUserId(devMode ? 'dev-user' : 'anonymous');
        setIsAuthenticated(false); // Not authenticated without proper token

        if (urlCompanyId) {
          storeCompanyId(urlCompanyId);
        }

        logger.info('Whop context initialized for standalone app', {
          companyId: fallbackCompanyId,
          userId: devMode ? 'dev-user' : 'anonymous',
          isAuthenticated: false,
          devMode,
          hasUrlCompanyId: !!urlCompanyId
        });
        return;
      }

      // Try to get context from API with token
      try {
        // Include company ID from URL in headers for API call
        const headers = getAuthHeaders({ companyId: urlCompanyId || undefined });
        const response = await fetch('/api/health/context', {
          method: 'GET',
          headers,
          credentials: 'include', // Include cookies if needed
        });

        if (response.ok) {
          const contextData = await response.json();
          const data = contextData.data || contextData;

          // Use company ID from URL/localStorage as fallback if API doesn't provide one
          const finalCompanyId = data.companyId || urlCompanyId || 'unknown';
          setCompanyId(finalCompanyId);
          setUserId(data.userId || 'anonymous');
          setIsAuthenticated(data.isAuthenticated || false);

          // Store company ID for persistence
          if (finalCompanyId && finalCompanyId !== 'unknown') {
            storeCompanyId(finalCompanyId);
          }

          // Store token if we got authenticated context
          if (data.isAuthenticated && token) {
            setAuthToken(token);
            storeWhopToken(token);
          }

          logger.info('Whop context loaded from API', {
            companyId: finalCompanyId,
            userId: data.userId,
            isAuthenticated: data.isAuthenticated,
            hasToken: !!token,
            hasUrlCompanyId: !!urlCompanyId
          });
        } else {
          // If API fails but we have a token, log error but use URL companyId if available
          if (env.NODE_ENV === 'development' && token) {
            logger.warn('API context fetch failed - using URL companyId if available', {
              status: response.status,
              hasToken: !!token,
              hasUrlCompanyId: !!urlCompanyId
            });

            const fallbackCompanyId = urlCompanyId || 'unknown';
            setCompanyId(fallbackCompanyId);
            setUserId('dev-user');
            setIsAuthenticated(false); // Not authenticated if API fails
            if (urlCompanyId) {
              storeCompanyId(urlCompanyId);
            }
            return;
          }

          throw new Error(`API context fetch failed: ${response.status}`);
        }
      } catch (apiError) {
        // Fallback to default context if API fails
        logger.warn('Failed to fetch context from API, using defaults', {
          error: apiError instanceof Error ? apiError.message : String(apiError),
          hasUrlCompanyId: !!urlCompanyId
        });

        // Use URL companyId as fallback if available
        const fallbackCompanyId = urlCompanyId || 'unknown';

        if (env.NODE_ENV === 'development' && token) {
          // Token exists but API failed - use URL companyId if available
          setCompanyId(fallbackCompanyId);
          setUserId('dev-user');
          setIsAuthenticated(false); // Not authenticated if API fails
        } else {
          setCompanyId(fallbackCompanyId);
          setUserId('anonymous');
          setIsAuthenticated(false);
        }

        if (urlCompanyId) {
          storeCompanyId(urlCompanyId);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      logger.error('Whop context initialization failed', {
        error: errorMessage
      });

      // Set fallback values - try URL companyId before falling back to 'unknown'
      const fallbackCompanyId = extractCompanyId() || 'unknown';
      setCompanyId(fallbackCompanyId);
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