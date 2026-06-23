import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in $HOME otherwise
  // makes Next infer the wrong root).
  turbopack: { root: __dirname },
  // Keep the headless-Chromium packages out of the bundler so their native
  // binaries are loaded at runtime instead of being traced/bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],
};

export default nextConfig;
