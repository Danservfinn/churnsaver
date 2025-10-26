import Link from 'next/link';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Initialize accessibility features
    if (typeof window !== 'undefined') {
      import('@/lib/accessibility').then(({ AccessibilityUtils }) => {
        AccessibilityUtils.initialize({
          announcePageChanges: true,
          announceFormErrors: true,
          focusManagement: true,
          keyboardNavigation: true,
          screenReaderSupport: true,
          colorContrast: true,
          reducedMotion: true
        });
      });

      // Initialize Web Vitals monitoring
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        import('@/lib/metrics').then(({ metrics }) => {
          getCLS((metric) => metrics.recordWebVitals('cls', metric.value));
          getFID((metric) => metrics.recordWebVitals('fid', metric.value));
          getFCP((metric) => metrics.recordWebVitals('fcp', metric.value));
          getLCP((metric) => metrics.recordWebVitals('lcp', metric.value));
          getTTFB((metric) => metrics.recordWebVitals('ttfb', metric.value));
        });
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" role="main" aria-labelledby="main-heading">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12" role="banner">
          <h1 id="main-heading" className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Churn Saver
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Recover lost customers with smart nudges and incentives
          </p>
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow" role="region" aria-labelledby="dashboard-card">
              <h2 id="dashboard-card" className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Dashboard
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                View recovery cases, KPIs, and manage at-risk memberships
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Navigate to Dashboard"
              >
                Go to Dashboard
              </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow" role="region" aria-labelledby="settings-card">
              <h2 id="settings-card" className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Settings
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Configure nudge channels, incentives, and reminder timing
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                aria-label="Navigate to Settings"
              >
                Configure Settings
              </Link>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow" role="region" aria-labelledby="getting-started">
            <h2 id="getting-started" className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Getting Started
            </h2>
            <ol className="space-y-4" role="list">
              <li className="flex items-start space-x-3" role="listitem">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium" aria-hidden="true">
                  1
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Configure your Whop app credentials in environment variables
                </p>
              </li>
              <li className="flex items-start space-x-3" role="listitem">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium" aria-hidden="true">
                  2
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Set up Supabase database and run migrations
                </p>
              </li>
              <li className="flex items-start space-x-3" role="listitem">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium" aria-hidden="true">
                  3
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Configure webhook URLs in Whop dashboard
                </p>
              </li>
              <li className="flex items-start space-x-3" role="listitem">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium" aria-hidden="true">
                  4
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Start processing events and recovering customers!
                </p>
              </li>
            </ol>
          </div>
        </main>
      </div>
    </div>
  );
}