import { defineConfig } from 'vitest/config'
import * as path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Temporarily disable coverage to isolate Napi::Error issue
    exclude: [
      // Non-source files and build artifacts only
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.turbo/**',
      '.git/**',
      
      // Configuration files
      '**/*.config.js',
      '**/*.config.ts',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/tailwind.config.ts',
      '**/next.config.*',
      
      // Database and migrations (handled separately)
      'infra/migrations/**',
      '**/*.sql',
      
      // Documentation and examples
      'docs/**',
      '**/*.md',
      '**/*.mdx',
      
      // Types and generated files
      '**/*.d.ts',
      'src/types/**',
      
      // Third-party libraries and wrappers
      '**/whop/**',
      '**/node_modules/**',
      '**/.next/**'
      ,
      // Server-dependent suites run separately
      'test/e2e-server/**',
      // Legacy security suite requiring Jest-style mocks
      'test/security/sql-injection.test.ts',

      // DB-dependent suites (CI unit job has no Postgres service)
      'test/unit/rls-policy-enforcement.test.ts',
      'test/security/rls-security.test.ts',

      // Invalid/non-actionable security test (does not exercise app code)
      'test/security/path-traversal.test.ts'
    ],
    
    // Test file patterns
    include: [
      'test/unit/**/*.test.{js,ts,tsx}',
      'test/unit/**/*.spec.{js,ts,tsx}',
      'test/security/**/*.test.{js,ts,tsx}',
      'test/security/**/*.spec.{js,ts,tsx}',
      'test/components/**/*.test.{js,ts,tsx}',
      'test/components/**/*.spec.{js,ts,tsx}',
      'test/webhooks/**/*.test.{js,ts,tsx}'
    ],
    
    // Test environment and setup
    testTimeout: 30000,
    hookTimeout: 10000,
    
    // Reporters for different outputs
    reporters: ['default'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      // Component-specific thresholds (if needed, can be expanded)
      // These would require more granular coverage configuration
    },
      
    // Pool configuration for parallel testing
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4
      }
    }
  },
  
  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  
  // TypeScript configuration
  esbuild: {
    target: 'node18'
  }
})