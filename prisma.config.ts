import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Дефолт как в src/lib/prisma.ts и .env.example: команды работают
    // и без .env (чистый раннер CI, свежий клон).
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
