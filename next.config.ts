import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in $HOME otherwise
  // makes Next infer the wrong root).
  turbopack: { root: __dirname },
  // Keep the headless-Chromium packages out of the bundler so their native
  // binaries are loaded at runtime instead of being traced/bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],
  // Externalizing alone drops the brotli-compressed Chromium binary from the
  // function bundle. Force it back into EVERY function that runs the audit
  // pipeline — audits moved from /api/analyze to /api/audits (+ cron), and
  // production silently fell back to plain fetch for months because only
  // /api/analyze had the binary (confirmed in runtime logs 2026-09-25).
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/audits": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/cron/reaudit": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/jobs/run": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
