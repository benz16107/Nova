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
    let summary = "";

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
        if (narrative) summary = narrative;
      } catch (e) {
        console.error("[AI digest]", e);
      }
    }

    if (!summary && requests.length > 0) {
      summary = "No AI summary available for this period.";
    } else if (!summary) {
      summary = "No activity in this period.";
    }

    res.json({ summary, count: requests.length, period });
  } catch (e) {
    console.error("[AI digest]", e);
    res.status(500).json({ error: String(e) });
  }
});

/** POST /api/ai/summarize-guest — guest or room stay summary. Body: guestId (single) or guestIds (array for all guests in room). */
aiRouter.post("/summarize-guest", async (req, res) => {
  try {
    const body = (req.body as { guestId?: string; guestIds?: string[] }) || {};
    const guestIds = Array.isArray(body.guestIds) && body.guestIds.length > 0
      ? body.guestIds
      : typeof body.guestId === "string" && body.guestId
        ? [body.guestId]
        : null;
    if (!guestIds || guestIds.length === 0) return res.status(400).json({ error: "guestId or guestIds required" });

    const guests = await prisma.guest.findMany({
      where: { id: { in: guestIds } },
      include: { room: true },
      orderBy: { createdAt: "asc" },
    });
    if (guests.length === 0) return res.status(404).json({ error: "Guest(s) not found" });

    const backboard = await import("../backboard.js").catch(() => null);
    const roomId = guests[0]?.room?.roomId ?? "—";
    const guestLines: string[] = [];
    let allMemories: string[] = [];
    let allRequests: { type: string; description: string; status: string }[] = [];
    let allFeedback: string[] = [];

    const now = new Date();
    for (const guest of guests) {
      let memories: string[] = [];
      if (backboard) {
        try {
          memories = await backboard.getMemoriesForGuest(guest.id);
        } catch {
          // ignore
        }
      }
      const requests = await prisma.request.findMany({
        where: { guestId: guest.id },
        orderBy: { createdAt: "desc" },
      });
      const feedbackList = await prisma.feedback.findMany({
        where: { guestId: guest.id },
        orderBy: { createdAt: "desc" },
      });
      guestLines.push(`Guest: ${guest.firstName} ${guest.lastName}`);
      const checkedInAt = guest.checkedInAt ? new Date(guest.checkedInAt) : null;
      const endAt = guest.checkedOutAt ? new Date(guest.checkedOutAt) : now;
      if (checkedInAt) {
        const stayMs = endAt.getTime() - checkedInAt.getTime();
        const stayDays = Math.floor(stayMs / (24 * 60 * 60 * 1000));
        const stayHours = Math.floor((stayMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const stayStr = stayDays > 0 ? `${stayDays} day(s) ${stayHours} hour(s)` : `${stayHours} hour(s)`;
        guestLines.push(`Checked in: ${checkedInAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}. Length of stay: ${stayStr}.`);
      }
      if (memories.length > 0) guestLines.push("Stay notes: " + memories.slice(0, 8).join("; "));
      requests.forEach((r) => {
        allRequests.push({ type: r.type, description: r.description, status: r.status ?? "open" });
        guestLines.push(`- [${r.type}] ${r.description} (${r.status === "closed" ? "fulfilled" : "open"})`);
      });
      feedbackList.forEach((f) => {
        allFeedback.push(f.content);
        guestLines.push(`Feedback: ${f.content}`);
      });
      allMemories = allMemories.concat(memories);
    }

    const tags: string[] = [];
    let summary = "";
    const hasData = allMemories.length > 0 || allRequests.length > 0 || allFeedback.length > 0;

    if (openai && hasData) {
      try {
        const systemPrompt =
          guests.length > 1
            ? "You are a hotel manager's assistant. Summarize the overall stay for ALL guests in this room in 2-4 sentences. Include the length of stay (from check-in to check-out/now). Use each guest's stay notes, requests/complaints (note which were fulfilled), and checkout feedback. Mention who had which requests or feedback when relevant. Then on a new line write 'TAGS:' followed by 3-5 comma-separated short tags. Use only the line 'TAGS: tag1, tag2, tag3' with no other text on that line."
            : "You are a hotel manager's assistant. Summarize this guest's overall stay in 2-4 sentences. Include the length of stay (from check-in to check-out/now). Use their stay notes, requests/complaints (note which were fulfilled), and checkout feedback. Then on a new line write 'TAGS:' followed by 3-5 comma-separated short tags. Use only the line 'TAGS: tag1, tag2, tag3' with no other text on that line.";
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Room ${roomId}\n\n${guestLines.join("\n")}`.trim(),
            },
          ],
          max_tokens: 400,
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
      if (allMemories.length > 0) {
        summary = "Stay notes: " + allMemories.slice(0, 5).join(" ").slice(0, 300) + (allMemories.length > 5 ? "…" : "");
        tags.push("memory");
      }
      if (allRequests.length > 0) {
        const fulfilled = allRequests.filter((r) => r.status === "closed").length;
        summary = (summary ? summary + " " : "") + `${allRequests.length} request(s) (${fulfilled} fulfilled).`;
        allRequests.forEach((r) => tags.push(r.type));
      }
      if (allFeedback.length > 0) tags.push("feedback");
      if (!summary) summary = "No notes, requests, or feedback recorded for this stay.";
    }

    res.json({ summary, tags });
  } catch (e) {
    console.error("[AI summarize-guest]", e);
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/ai/feedback-dashboard — Generate an AI summary of all collected feedback and memory threads */
aiRouter.get("/feedback-dashboard", async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ error: "AI is not configured. Set OPENAI_API_KEY." });
    }

    // 1. Fetch formal feedback
    const feedbackList = await prisma.feedback.findMany({
      include: { guest: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch Backboard memory threads
    let allMemories: { guest_id: string; room_id: string; content: string }[] = [];
    const backboard = await import("../backboard.js").catch(() => null);
    if (backboard) {
      try {
        allMemories = await backboard.getAllMemoriesRaw();
      } catch (err) {
        console.error("[AI feedback-dashboard] failed to fetch memories:", err);
      }
    }

    if (feedbackList.length === 0 && allMemories.length === 0) {
      return res.json({
        overall_vibe: "No feedback or memory data collected yet.",
        top_praise: [],
        improvements: [],
        insights: "Start collecting feedback from guests to generate insights.",
      });
    }

    // Build context payload
    const dataLines: string[] = [];
    feedbackList.slice(0, 100).forEach((f) => {
      const g = f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : "Unknown";
      dataLines.push(`[Formal Feedback | Room ${f.roomId} | ${g}]: ${f.content}`);
    });

    allMemories.forEach((m) => {
      dataLines.push(`[Backboard Memory Thread | Room ${m.room_id}]: ${m.content}`);
    });

    // Construct JSON shape constraint
    const prompt = `You are an AI assistant for a hotel manager. You are analyzing all formal guest checkout feedback and real-time stay-memory threads (Backboard memories). 
Provide a structured JSON response summarizing the guest sentiment and feedback.
Respond EXACTLY in this JSON format (no markdown code blocks, just raw JSON):
{
  "overall_vibe": "A 2-3 sentence summary of the general sentiment and experience.",
  "top_praise": ["Praise point 1", "Praise point 2", "Praise point 3"],
  "improvements": ["Area for improvement 1", "Area for improvement 2"],
  "insights": "One interesting or actionable overarching insight from the data."
}`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Here is the recent hotel feedback data:\n\n${dataLines.join("\n")}`,
        },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const answerStr = completion.choices[0]?.message?.content?.trim() || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(answerStr);
    } catch {
      parsed = { error: "Failed to parse AI response" };
    }

    res.json(parsed);
  } catch (e) {
    console.error("[AI feedback-dashboard]", e);
    res.status(500).json({ error: String(e) });
  }
});
