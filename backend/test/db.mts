import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/** Point Prisma at a fresh throwaway SQLite file. Call before importing anything that loads src/db.ts. */
export function useFreshDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-test-"));
  const file = path.join(dir, "test.sqlite");
  process.env.DATABASE_URL = `file:${file}`;
  execFileSync(path.resolve(import.meta.dirname, "../node_modules/.bin/prisma"), ["db", "push"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: process.env,
    stdio: "pipe",
  });
  return file;
}
