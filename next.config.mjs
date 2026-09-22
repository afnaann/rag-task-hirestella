/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure server-only SDKs (ESM-only or native Node dependencies) are never
  // bundled for the browser. They are only used in API routes and scripts.
  serverExternalPackages: ["@google/genai", "groq-sdk", "pdf-parse"],
};

export default nextConfig;
