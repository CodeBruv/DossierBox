/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Image optimization is not used in the MVP shell; keep defaults.
  // No remotePatterns configured — only local assets are allowed.
};

module.exports = nextConfig;