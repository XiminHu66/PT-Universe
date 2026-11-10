/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.DEAL_RADAR_BASE_PATH || "",
  trailingSlash: true,
  output: "standalone",
  experimental: { cpus: 2 },
  env: { NEXT_PUBLIC_DEAL_RADAR_BASE_PATH: process.env.DEAL_RADAR_BASE_PATH || "" },
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
