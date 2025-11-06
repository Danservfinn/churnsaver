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
}

const WhopContext = createContext<WhopContextType | undefined>(undefined);

export interface WhopProviderProps {
  children: React.ReactNode;
}

export function WhopProvider({ children }: WhopProviderProps) {
  const [companyId, setCompanyId] = useState<string>(env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
  const [userId, setUserId] = useState<string>('anonymous');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if we're in an iframe (Whop app context)
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (!inIframe) {
        // Not in iframe, use default context
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

      // In iframe, try to get context from parent or API
      try {
        // First, try to get context from a health check API call
        const response = await fetch('/api/health/context', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const contextData = await response.json();
          setCompanyId(contextData.companyId || env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
          setUserId(contextData.userId || 'anonymous');
          setIsAuthenticated(contextData.isAuthenticated || false);

          logger.info('Whop context loaded from API', {
            companyId: contextData.companyId,
            userId: contextData.userId,
            isAuthenticated: contextData.isAuthenticated
          });
        } else {
          throw new Error('API context fetch failed');
        }
      } catch (apiError) {
        // Fallback to default context if API fails
        logger.warn('Failed to fetch context from API, using defaults', {
          error: apiError instanceof Error ? apiError.message : String(apiError)
        });

        setCompanyId(env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown');
        setUserId('anonymous');
        setIsAuthenticated(false);
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