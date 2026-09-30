import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/** Prisma 5 resolved relative `file:` URLs against prisma/; keep that so `file:./dev.sqlite` still means prisma/dev.sqlite. */
export function resolveSqliteUrl(url: string, prismaDir: string): string {
  const file = url.replace(/^file:/, "");
  return file === ":memory:" || path.isAbsolute(file) ? file : path.resolve(prismaDir, file);
}

function findPrismaDir(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return path.join(dir, "prisma");
    if (dir === path.dirname(dir)) throw new Error("prisma/schema.prisma not found above " + __dirname);
  }
}

const url = resolveSqliteUrl(process.env.DATABASE_URL ?? "file:./dev.sqlite", findPrismaDir());
export const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
