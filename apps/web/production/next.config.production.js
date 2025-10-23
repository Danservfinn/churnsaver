/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations
  swcMinify: true,

  // Enable experimental features for better performance
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/api/webhooks/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },

  // Environment variables to expose to the browser
  env: {
    NEXT_PUBLIC_APP_ENV: 'production',
  },

  // Build optimization
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    domains: ['avatars.githubusercontent.com', 'whop.com'],
    formats: ['image/webp', 'image/avif'],
  },

  // Output configuration for Vercel
  output: 'standalone',

  // Bundle analyzer (only in development)
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config) => {
      if (process.env.NODE_ENV === 'production') {
        // Add bundle analyzer in production builds when requested
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: './bundle-analyzer-report.html',
          })
        );
      }
      return config;
    },
  }),
};

module.exports = nextConfig;

