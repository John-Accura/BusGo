import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Drivers share GPS from the booking page; nothing needs camera/mic.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
    ];
  },
  // The embedded PGlite database writes to .data/ on every request; keep the
  // dev file-watcher away from it or each DB write triggers a Fast Refresh.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.data/**", "**/.next/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
