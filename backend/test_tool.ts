import { PrismaClient } from "@prisma/client";
import { runTool } from "./src/realtime/tools";

const prisma = new PrismaClient();

async function test() {
    const g = await prisma.guest.findFirst();
    if (!g) {
        console.log("No guest");
        return;
    }
    console.log("Using guest", g.id, "room", g.roomId);
    const out = await runTool("log_request", { type: "request", description: "Test from script" }, { guestId: g.id, roomId: g.roomId });
    console.log("Tool output:", out);

    const reqs = await prisma.request.findMany({ orderBy: { createdAt: "desc" }, take: 2 });
    console.log("Latest requests:", reqs);
}

test().catch(console.error).finally(() => prisma.$disconnect());
