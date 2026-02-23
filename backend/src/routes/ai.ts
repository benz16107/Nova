import { Router } from "express";
import OpenAI from "openai";
import { prisma } from "../db.js";

export const aiRouter = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_CONFIGURED = Boolean(OPENAI_API_KEY);

const openai = OPENAI_CONFIGURED ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** GET /api/ai/status — whether AI (OpenAI) is configured */
aiRouter.get("/status", (_req, res) => {
  res.json({ configured: OPENAI_CONFIGURED });
});

/** GET /api/ai/alerts — follow-up alerts (stub: empty until implemented) */
aiRouter.get("/alerts", (_req, res) => {
  res.json({ alerts: [] });
});

/** POST /api/ai/ask — natural-language question over activity/requests */
aiRouter.post("/ask", async (req, res) => {
  try {
    const body = (req.body as { question?: string }) || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return res.status(400).json({ error: "question required" });

    if (!openai) {
      return res.json({
        answer: "AI is not configured. Set OPENAI_API_KEY in backend .env.",
      });
    }

    const requests = await prisma.request.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { guest: { include: { room: true } } },
    });
    const contextLines = requests.slice(0, 40).map((r) => {
      const guest = r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—";
      const room = r.guest?.room?.roomId ?? r.roomId ?? "—";
      const status = r.status === "closed" ? "closed" : "open";
      return `[${r.createdAt.toISOString()}] Room ${room} | ${guest} | ${r.type} (${status}): ${r.description}`;
    });
    const context = contextLines.length > 0 ? contextLines.join("\n") : "No requests or complaints on record yet.";

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for hotel managers. Answer briefly based only on the provided activity data (requests and complaints). If the data does not contain enough information, say so. Keep answers to 2-4 sentences unless the user asks for more.",
        },
        {
          role: "user",
          content: `Activity data:\n${context}\n\nQuestion: ${question}`,
        },
      ],
      max_tokens: 400,
    });

    const answer = completion.choices[0]?.message?.content?.trim() ?? "No response.";
    res.json({ answer });
  } catch (e) {
    console.error("[AI ask]", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/ai/digest?period=today|week — activity digest; uses OpenAI for narrative when configured */
aiRouter.get("/digest", async (req, res) => {
  try {
    const period = (req.query.period as string) || "today";
    const now = new Date();
    const start = new Date(now);
    if (period === "today") {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    }
    const requests = await prisma.request.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      include: { guest: { include: { room: true } } },
    });
    const open = requests.filter((r) => r.status !== "closed");
    const byRoom: Record<string, { requests: number; complaints: number }> = {};
    for (const r of requests) {
      const roomId = r.roomId ?? "—";
      if (!byRoom[roomId]) byRoom[roomId] = { requests: 0, complaints: 0 };
      if (r.type === "complaint") byRoom[roomId].complaints += 1;
      else byRoom[roomId].requests += 1;
    }

    const lines: string[] = [
      period === "today" ? "Today's activity" : "Last 7 days",
      `${requests.length} total (${open.length} open).`,
      "",
      ...Object.entries(byRoom)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([room, counts]) => `Room ${room}: ${counts.requests} request(s), ${counts.complaints} complaint(s).`),
    ];
    let summary = lines.join("\n");

    if (openai && requests.length > 0) {
      try {
        const detail = requests
          .slice(0, 30)
          .map((r) => {
            const g = r.guest;
            const name = g ? `${g.firstName} ${g.lastName}` : "—";
            return `Room ${r.roomId} | ${name} | ${r.type}: ${r.description}`;
          })
          .join("\n");
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a hotel manager's assistant. In 2-4 sentences, summarize the activity (requests and complaints) for the given period. Be concise and highlight any complaints or urgent items.",
            },
            {
              role: "user",
              content: `Period: ${period}\n\nActivity:\n${detail}`,
            },
          ],
          max_tokens: 200,
        });
        const narrative = completion.choices[0]?.message?.content?.trim();
        if (narrative) summary = narrative + "\n\n" + summary;
      } catch (e) {
        console.error("[AI digest]", e);
      }
    }

    res.json({ summary, count: requests.length, period });
  } catch (e) {
    console.error("[AI digest]", e);
    res.status(500).json({ error: String(e) });
  }
});

/** POST /api/ai/summarize-guest — guest stay summary; uses OpenAI when configured */
aiRouter.post("/summarize-guest", async (req, res) => {
  try {
    const { guestId } = (req.body as { guestId?: string }) || {};
    if (!guestId) return res.status(400).json({ error: "guestId required" });

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });

    let memories: string[] = [];
    try {
      const { getMemoriesForGuest } = await import("../backboard.js");
      memories = await getMemoriesForGuest(guest.id);
    } catch {
      // Backboard not configured or failed
    }

    const requests = await prisma.request.findMany({
      where: { guestId: guest.id },
      orderBy: { createdAt: "desc" },
    });

    const tags: string[] = [];
    let summary = "";

    if (openai && (memories.length > 0 || requests.length > 0)) {
      try {
        const memoryBlock = memories.length > 0 ? "Stay notes / memories:\n" + memories.slice(0, 10).join("\n") + "\n" : "";
        const requestBlock =
          requests.length > 0
            ? "Requests and complaints this stay:\n" +
              requests
                .slice(0, 15)
                .map((r) => `- [${r.type}] ${r.description} (${r.status ?? "open"})`)
                .join("\n")
            : "";
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a hotel manager's assistant. Based on the guest's stay notes and requests, write a brief 2-3 sentence summary of this stay. Then on a new line write 'TAGS:' followed by 3-5 comma-separated short tags (e.g. early check-in, complaint, housekeeping). Use only the line 'TAGS: tag1, tag2, tag3' with no other text on that line.",
            },
            {
              role: "user",
              content: `Guest: ${guest.firstName} ${guest.lastName}, Room ${guest.room?.roomId ?? "—"}\n\n${memoryBlock}${requestBlock}`.trim(),
            },
          ],
          max_tokens: 300,
        });
        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        const tagsMatch = text.match(/TAGS:\s*(.+)$/m);
        if (tagsMatch) {
          summary = text.replace(/\nTAGS:.*$/m, "").trim();
          tags.push(...tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean));
        } else {
          summary = text;
        }
      } catch (e) {
        console.error("[AI summarize-guest]", e);
      }
    }

    if (!summary) {
      if (memories.length > 0) {
        summary = "Stay notes: " + memories.slice(0, 5).join(" ").slice(0, 300) + (memories.length > 5 || memories.join("").length > 300 ? "…" : "");
        tags.push("memory");
      }
      if (requests.length > 0) {
        const types = [...new Set(requests.map((r) => r.type))];
        types.forEach((t) => tags.push(t));
        const openCount = requests.filter((r) => r.status !== "closed").length;
        summary = (summary ? summary + " " : "") + `${requests.length} request(s) this stay (${openCount} open).`;
      }
      if (!summary) summary = "No notes or requests recorded for this stay.";
    }

    res.json({ summary, tags });
  } catch (e) {
    console.error("[AI summarize-guest]", e);
    res.status(500).json({ error: String(e) });
  }
});
