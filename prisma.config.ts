// prisma.config.ts
import "dotenv/config"; // ✅ Load .env before Prisma reads schema/config
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
});
