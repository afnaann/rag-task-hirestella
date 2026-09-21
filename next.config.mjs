/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure @google/genai (ESM-only) is never bundled for the browser.
  // It is only used in server-side code (API routes, scripts).
  serverExternalPackages: ["@google/genai"],
};

export default nextConfig;

