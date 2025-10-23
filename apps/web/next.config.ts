import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default nextConfig;
