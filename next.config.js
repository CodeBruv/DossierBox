/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Image optimization is not used in the MVP shell; keep defaults.
  // No remotePatterns configured — only local assets are allowed.
  experimental: {
    serverActions: {
      // Document import posts a file through a server action. The default cap is 1 MB, which
      // would reject a normal PDF CV long before MAX_UPLOAD_BYTES (4 MB) applies. This sits a
      // little above that limit for multipart overhead and stays under the ~4.5 MB Vercel
      // serverless request-body ceiling — see the note beside MAX_UPLOAD_BYTES in
      // src/import/detect.ts. The two limits are one decision and must move together.
      bodySizeLimit: "4.5mb",
    },
  },
  // Avoid the known Next.js 16 + Turbopack hang on "Running TypeScript ..." on Vercel.
  // Run type-checking separately with: npm run typecheck
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;