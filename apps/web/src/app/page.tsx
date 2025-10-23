import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Churn Saver
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Recover lost customers with smart nudges and incentives
          </p>
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Dashboard
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                View recovery cases, KPIs, and manage at-risk memberships
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Settings
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Configure nudge channels, incentives, and reminder timing
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Configure Settings
              </Link>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Getting Started
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Configure your Whop app credentials in environment variables
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Set up Supabase database and run migrations
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Configure webhook URLs in Whop dashboard
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  4
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Start processing events and recovering customers!
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
