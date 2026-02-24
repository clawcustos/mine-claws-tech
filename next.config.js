/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // All pages are client-side only (wagmi/RainbowKit) — disable static export
  output: undefined,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

module.exports = nextConfig;
