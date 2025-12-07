'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

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
  const [companyId, setCompanyId] = useState<string>(env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
  const [userId, setUserId] = useState<string>('anonymous');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  /**
   * Get authentication headers for API calls
   */
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

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
        const devMode = env.DEBUG_MODE && env.NODE_ENV === 'development';
        const devCompanyId = env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'dev-company';
        
        setCompanyId(devCompanyId);
        setUserId(devMode ? 'dev-user' : 'anonymous');
        setIsAuthenticated(devMode); // Allow authenticated state in dev mode
        
        logger.info('Whop context initialized for standalone app', {
          companyId: devCompanyId,
          userId: devMode ? 'dev-user' : 'anonymous',
          isAuthenticated: devMode,
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
          
          setCompanyId(data.companyId || env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
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
          // If API fails but we have a token, try dev mode fallback
          if (env.NODE_ENV === 'development' && token) {
            logger.warn('API context fetch failed, using dev mode fallback', {
              status: response.status,
              hasToken: !!token
            });
            
            const devCompanyId = env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'dev-company';
            setCompanyId(devCompanyId);
            setUserId('dev-user');
            setIsAuthenticated(true);
            return;
          }
          
          throw new Error(`API context fetch failed: ${response.status}`);
        }
      } catch (apiError) {
        // Fallback to default context if API fails
        logger.warn('Failed to fetch context from API, using defaults', {
          error: apiError instanceof Error ? apiError.message : String(apiError)
        });

        // In development, allow authenticated state if we have a token
        if (env.NODE_ENV === 'development' && token) {
          const devCompanyId = env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'dev-company';
          setCompanyId(devCompanyId);
          setUserId('dev-user');
          setIsAuthenticated(true);
        } else {
          setCompanyId(env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
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

      // Set fallback values
      setCompanyId(env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
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