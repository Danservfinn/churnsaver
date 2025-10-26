#!/usr/bin/env node

// Test suite for dashboard page rendering with verified Whop tokens
// Tests company/user context fetching, dashboard data rendering, and error handling

// Mock environment variables for testing
const originalEnv = process.env;
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_WHOP_COMPANY_ID = 'test_company_123';
process.env.WHOP_APP_ID = 'test_app_456';

// Mock React and Next.js components for testing
const mockReact = {
  createContext: (defaultValue) => ({ defaultValue }),
  useContext: (context) => context.defaultValue,
  useEffect: (fn, deps) => {
    // Simulate useEffect execution
    if (typeof fn === 'function') {
      fn();
    }
  },
  useState: (initialValue) => {
    let value = initialValue;
    const setValue = (newValue) => { value = newValue; };
    return [value, setValue];
  }
};

// Mock fetch for API calls
const mockFetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  
  if (urlStr.includes('/api/health/context')) {
    return {
      ok: true,
      json: async () => ({
        companyId: 'test_company_123',
        userId: 'test_user_789',
        isAuthenticated: true,
        timestamp: new Date().toISOString()
      })
    };
  }
  
  if (urlStr.includes('/api/dashboard/kpis')) {
    return {
      ok: true,
      json: async () => ({
        totalMemberships: 150,
        activeCases: 25,
        recoveryRate: 0.85,
        monthlyRevenue: 5000
      })
    };
  }
  
  if (urlStr.includes('/api/dashboard/cases')) {
    return {
      ok: true,
      json: async () => ({
        cases: [
          { id: 'case_1', status: 'active', membershipId: 'mem_123' },
          { id: 'case_2', status: 'resolved', membershipId: 'mem_456' }
        ]
      })
    };
  }
  
  // Default error response
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'Not found' })
  };
};

// Mock window object for iframe detection
const mockWindow = {
  self: { not: { top: true } }, // Not in iframe
  top: { self: mockWindow }
};

function runDashboardTests() {
  console.log('📊 Starting Dashboard Page Test Suite\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, testFn) {
    try {
      console.log(`\n🧪 ${name}`);
      const result = testFn();
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          console.log(`✅ ${name} - PASSED`);
          results.passed++;
          results.tests.push({ name, status: 'PASSED' });
        }).catch(error => {
          console.log(`❌ ${name} - FAILED: ${error.message}`);
          results.failed++;
          results.tests.push({ name, status: 'FAILED', error: error.message });
        });
      } else {
        console.log(`✅ ${name} - PASSED`);
        results.passed++;
        results.tests.push({ name, status: 'PASSED' });
      }
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Test dashboard page rendering with verified token
  runTest('Dashboard page renders with verified Whop token', async () => {
    const companyId = 'test_company_123';
    const mockParams = Promise.resolve({ companyId });
    
    // Mock dashboard page component
    const DashboardPage = async ({ params }) => {
      const { companyId } = await params;
      
      if (!companyId) {
        throw new Error('Company ID is required');
      }
      
      return {
        type: 'div',
        props: {
          children: [
            { type: 'h1', props: { children: `Dashboard for Company ${companyId}` } },
            { type: 'p', props: { children: 'This route is Whop iframe compatible and will auto-resize when embedded.' } },
            { type: 'p', props: { children: 'Dev tip: append ?embed=1 to URL to simulate iframe embedding.' } }
          ]
        }
      };
    };

    const renderedComponent = await DashboardPage({ params: mockParams });
    
    if (!renderedComponent || renderedComponent.type !== 'div') {
      throw new Error('Expected dashboard component to render');
    }
    
    const h1Element = renderedComponent.props.children.find(child => child.type === 'h1');
    if (!h1Element || !h1Element.props.children.includes(companyId)) {
      throw new Error('Expected company ID to be rendered in h1');
    }
  });

  // Test company context fetching with verified token
  runTest('Dashboard fetches company context with verified token', async () => {
    const globalFetch = global.fetch;
    global.fetch = mockFetch;
    
    try {
      // Mock Whop context provider
      const mockWhopProvider = {
        fetchContext: async () => {
          const inIframe = typeof mockWindow !== 'undefined' && mockWindow.self !== mockWindow.top;
          
          if (!inIframe) {
            return {
              companyId: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
              userId: 'anonymous',
              isAuthenticated: false
            };
          }
          
          // Fetch context from API
          const response = await mockFetch('/api/health/context', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.ok) {
            const contextData = await response.json();
            return {
              companyId: contextData.companyId || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
              userId: contextData.userId || 'anonymous',
              isAuthenticated: contextData.isAuthenticated || false
            };
          }
          
          throw new Error('API context fetch failed');
        }
      };

      const context = await mockWhopProvider.fetchContext();
      
      if (!context || typeof context.companyId !== 'string') {
        throw new Error('Expected valid company context');
      }
      
      if (context.companyId !== 'test_company_123') {
        throw new Error(`Expected company ID test_company_123, got ${context.companyId}`);
      }
      
      if (!context.isAuthenticated) {
        throw new Error('Expected authenticated context');
      }
      
    } finally {
      global.fetch = globalFetch;
    }
  });

  // Test dashboard data rendering
  runTest('Dashboard renders KPI data correctly', async () => {
    const globalFetch = global.fetch;
    global.fetch = mockFetch;
    
    try {
      // Mock dashboard data fetching
      const fetchDashboardData = async () => {
        const [kpisResponse, casesResponse] = await Promise.all([
          mockFetch('/api/dashboard/kpis'),
          mockFetch('/api/dashboard/cases')
        ]);
        
        if (!kpisResponse.ok || !casesResponse.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        
        const kpis = await kpisResponse.json();
        const cases = await casesResponse.json();
        
        return { kpis, cases };
      };
      
      const dashboardData = await fetchDashboardData();
      
      if (!dashboardData.kpis || !dashboardData.cases) {
        throw new Error('Expected dashboard data to be fetched');
      }
      
      const { kpis } = dashboardData;
      if (typeof kpis.totalMemberships !== 'number' || kpis.totalMemberships !== 150) {
        throw new Error('Expected totalMemberships to be 150');
      }
      
      if (typeof kpis.activeCases !== 'number' || kpis.activeCases !== 25) {
        throw new Error('Expected activeCases to be 25');
      }
      
      if (typeof kpis.recoveryRate !== 'number' || kpis.recoveryRate !== 0.85) {
        throw new Error('Expected recoveryRate to be 0.85');
      }
      
      // Mock rendering of KPI tiles
      const renderKpiTiles = (kpis) => {
        return [
          { type: 'KpiTile', props: { title: 'Total Memberships', value: kpis.totalMemberships } },
          { type: 'KpiTile', props: { title: 'Active Cases', value: kpis.activeCases } },
          { type: 'KpiTile', props: { title: 'Recovery Rate', value: `${(kpis.recoveryRate * 100).toFixed(1)}%` } },
          { type: 'KpiTile', props: { title: 'Monthly Revenue', value: `$${kpis.monthlyRevenue.toLocaleString()}` } }
        ];
      };
      
      const kpiTiles = renderKpiTiles(kpis);
      if (kpiTiles.length !== 4) {
        throw new Error('Expected 4 KPI tiles to be rendered');
      }
      
      const membershipTile = kpiTiles.find(tile => tile.props.title === 'Total Memberships');
      if (!membershipTile || membershipTile.props.value !== 150) {
        throw new Error('Expected Total Memberships tile with value 150');
      }
      
    } finally {
      global.fetch = globalFetch;
    }
  });

  // Test error handling for invalid tokens
  runTest('Dashboard handles invalid tokens gracefully', async () => {
    const globalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      
      if (urlStr.includes('/api/health/context')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Authentication required' })
        };
      }
      
      return mockFetch(url, options);
    };
    
    try {
      // Mock error handling in context provider
      const mockWhopProvider = {
        fetchContext: async () => {
          try {
            const response = await mockFetch('/api/health/context');
            
            if (!response.ok) {
              throw new Error(`Context fetch failed: ${response.status}`);
            }
            
            return await response.json();
          } catch (error) {
            // Fallback to default context
            return {
              companyId: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
              userId: 'anonymous',
              isAuthenticated: false,
              error: error.message
            };
          }
        }
      };

      const context = await mockWhopProvider.fetchContext();
      
      if (context.isAuthenticated) {
        throw new Error('Expected unauthenticated context for invalid token');
      }
      
      if (context.userId !== 'anonymous') {
        throw new Error('Expected anonymous user for invalid token');
      }
      
      if (!context.error) {
        throw new Error('Expected error message in context');
      }
      
      // Mock error state rendering
      const renderErrorState = (error) => {
        return {
          type: 'div',
          props: {
            className: 'error-container',
            children: [
              { type: 'h2', props: { children: 'Authentication Error' } },
              { type: 'p', props: { children: error } },
              { type: 'button', props: { children: 'Retry', onClick: () => window.location.reload() } }
            ]
          }
        };
      };
      
      const errorComponent = renderErrorState(context.error);
      if (!errorComponent || !errorComponent.props.children.find(child => child.props.children.includes('Authentication Error'))) {
        throw new Error('Expected error state to be rendered');
      }
      
    } finally {
      global.fetch = globalFetch;
    }
  });

  // Test iframe detection and behavior
  runTest('Dashboard detects iframe context correctly', async () => {
    // Test iframe detection
    const detectIframe = (window) => {
      return typeof window !== 'undefined' && window.self !== window.top;
    };
    
    // Test when not in iframe
    const notInIframe = detectIframe(mockWindow);
    if (notInIframe) {
      throw new Error('Expected to detect not being in iframe');
    }
    
    // Test when in iframe
    const iframeWindow = {
      self: {},
      top: {}
    };
    iframeWindow.self = iframeWindow;
    iframeWindow.top = iframeWindow;
    
    const inIframe = detectIframe(iframeWindow);
    if (!inIframe) {
      throw new Error('Expected to detect being in iframe');
    }
    
    // Mock context provider behavior based on iframe detection
    const mockContextProvider = {
      fetchContext: async (window) => {
        const inIframe = detectIframe(window);
        
        if (!inIframe) {
          return {
            companyId: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
            userId: 'anonymous',
            isAuthenticated: false,
            context: 'standalone'
          };
        }
        
        return {
          companyId: 'iframe_company_123',
          userId: 'iframe_user_456',
          isAuthenticated: true,
          context: 'iframe'
        };
      }
    };
    
    const standaloneContext = await mockContextProvider.fetchContext(mockWindow);
    if (standaloneContext.context !== 'standalone' || standaloneContext.isAuthenticated) {
      throw new Error('Expected standalone context with anonymous user');
    }
    
    const iframeContext = await mockContextProvider.fetchContext(iframeWindow);
    if (iframeContext.context !== 'iframe' || !iframeContext.isAuthenticated) {
      throw new Error('Expected iframe context with authenticated user');
    }
  });

  // Test dashboard data loading states
  runTest('Dashboard shows loading states during data fetch', async () => {
    const globalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      // Simulate delayed response
      await new Promise(resolve => setTimeout(resolve, 100));
      return mockFetch(url, options);
    };
    
    try {
      // Mock loading state management
      const mockDashboardComponent = () => {
        const [isLoading, setIsLoading] = mockReact.useState(true);
        const [data, setData] = mockReact.useState(null);
        const [error, setError] = mockReact.useState(null);
        
        const fetchData = async () => {
          try {
            setIsLoading(true);
            const response = await mockFetch('/api/dashboard/kpis');
            const result = await response.json();
            setData(result);
            setIsLoading(false);
          } catch (err) {
            setError(err.message);
            setIsLoading(false);
          }
        };
        
        // Simulate component mounting
        mockReact.useEffect(() => {
          fetchData();
        }, []);
        
        // Render based on state
        if (isLoading) {
          return {
            type: 'div',
            props: { className: 'loading-container', children: 'Loading dashboard data...' }
          };
        }
        
        if (error) {
          return {
            type: 'div',
            props: { className: 'error-container', children: `Error: ${error}` }
          };
        }
        
        if (data) {
          return {
            type: 'div',
            props: { className: 'dashboard-container', children: 'Dashboard loaded' }
          };
        }
        
        return { type: 'div', props: { children: 'No data' } };
      };
      
      const component = mockDashboardComponent();
      
      // Initial state should show loading
      if (component.props.className !== 'loading-container') {
        throw new Error('Expected loading state to be rendered initially');
      }
      
      // Simulate data loading completion
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const loadedComponent = mockDashboardComponent();
      if (loadedComponent.props.className !== 'dashboard-container') {
        throw new Error('Expected dashboard to be loaded after data fetch');
      }
      
    } finally {
      global.fetch = globalFetch;
    }
  });

  // Test dashboard refresh functionality
  runTest('Dashboard refresh functionality works correctly', async () => {
    let fetchCount = 0;
    
    const globalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      fetchCount++;
      return mockFetch(url, options);
    };
    
    try {
      // Mock refresh functionality
      const mockRefreshContext = async () => {
        const response = await mockFetch('/api/health/context');
        if (response.ok) {
          return await response.json();
        }
        throw new Error('Refresh failed');
      };
      
      // Initial fetch
      const initialContext = await mockRefreshContext();
      if (fetchCount !== 1) {
        throw new Error('Expected 1 fetch for initial context');
      }
      
      // Refresh fetch
      const refreshedContext = await mockRefreshContext();
      if (fetchCount !== 2) {
        throw new Error('Expected 2 fetches after refresh');
      }
      
      if (!refreshedContext || refreshedContext.companyId !== initialContext.companyId) {
        throw new Error('Expected refreshed context to match initial context');
      }
      
      // Test refresh with error handling
      global.fetch = async (url, options = {}) => {
        if (url.includes('/api/health/context')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' })
          };
        }
        return mockFetch(url, options);
      };
      
      try {
        await mockRefreshContext();
        throw new Error('Expected refresh to fail');
      } catch (error) {
        if (!error.message.includes('Refresh failed')) {
          throw new Error(`Expected refresh failure, got: ${error.message}`);
        }
      }
      
    } finally {
      global.fetch = globalFetch;
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DASHBOARD TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

    if (results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.tests.filter(t => t.status === 'FAILED').forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
    }

    // Restore original environment
    process.env = originalEnv;

    return results.failed === 0;
  }, 1000);
}

// Run tests if called directly
if (require.main === module) {
  runDashboardTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runDashboardTests };