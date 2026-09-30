import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

// Prisma 5 resolved relative `file:` URLs against prisma/; Prisma 7 uses this file's directory. Keep the old meaning.
const file = (process.env.DATABASE_URL ?? "file:./dev.sqlite").replace(/^file:/, "");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { seed: "tsx prisma/seed.ts" },
  datasource: { url: "file:" + path.resolve(import.meta.dirname, "prisma", file) },
});
