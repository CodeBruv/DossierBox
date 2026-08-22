/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Image optimization is not used in the MVP shell; keep defaults.
  // No remotePatterns configured — only local assets are allowed.
};

module.exports = nextConfig;