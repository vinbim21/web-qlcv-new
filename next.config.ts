import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Để các package native/nặng chạy ở server runtime, không bundle vào client.
  serverExternalPackages: ["@prisma/client", "exceljs", "bcryptjs"],
};

export default nextConfig;
