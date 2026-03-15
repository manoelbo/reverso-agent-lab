import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow long-running API routes for agent tool execution
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
