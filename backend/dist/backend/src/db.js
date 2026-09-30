"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.resolveSqliteUrl = resolveSqliteUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
/** Prisma 5 resolved relative `file:` URLs against prisma/; keep that so `file:./dev.sqlite` still means prisma/dev.sqlite. */
function resolveSqliteUrl(url, prismaDir) {
    const file = url.replace(/^file:/, "");
    return file === ":memory:" || path_1.default.isAbsolute(file) ? file : path_1.default.resolve(prismaDir, file);
}
function findPrismaDir() {
    for (let dir = __dirname;; dir = path_1.default.dirname(dir)) {
        if (fs_1.default.existsSync(path_1.default.join(dir, "prisma", "schema.prisma")))
            return path_1.default.join(dir, "prisma");
        if (dir === path_1.default.dirname(dir))
            throw new Error("prisma/schema.prisma not found above " + __dirname);
    }
}
const url = resolveSqliteUrl(process.env.DATABASE_URL ?? "file:./dev.sqlite", findPrismaDir());
exports.prisma = new client_1.PrismaClient({ adapter: new adapter_better_sqlite3_1.PrismaBetterSqlite3({ url }) });
