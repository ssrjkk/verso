import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["superjson"],
  // Защита загруженных файлов: никакого сниффинга типов + песочница
  // (второй рубеж после строгой валидации mime/расширения в upload-validation.ts).
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "sandbox" },
        ],
      },
    ];
  },
};

export default nextConfig;
