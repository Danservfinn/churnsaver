// Centralized request context storage using AsyncLocalStorage to avoid
// cross-request leakage in serverless/concurrent environments.
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  companyId?: string;
  userId?: string;
  isAuthenticated: boolean;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

/**
 * Run a function with a specific request context bound for the entire call stack.
 */
export function runWithRequestContext<T>(context: RequestContextData, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Set the current request context for the active execution flow.
 * Useful when you need to establish context after async work has begun.
 */
export function setRequestContext(context: RequestContextData): void {
  requestContextStorage.enterWith(context);
}

/**
 * Get the current request context if one is set.
 */
export function getRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}

/**
 * Clear the current request context for the active execution flow.
 */
export function clearRequestContext(): void {
  requestContextStorage.enterWith(undefined as unknown as RequestContextData);
}

