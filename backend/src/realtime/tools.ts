import { prisma } from "../db.js";
import { addMemory } from "../backboard.js";

const WIFI_NAME = process.env.HOTEL_WIFI_NAME ?? "Hotel-Guest";
const WIFI_PASSWORD = process.env.HOTEL_WIFI_PASSWORD ?? "welcome123";

export type ToolContext = { guestId: string; roomId: string };

export async function handleLogRequest(
  ctx: ToolContext,
  type: "request" | "complaint",
  description: string,
): Promise<string> {
  await prisma.request.create({
    data: {
      guestId: ctx.guestId,
      roomId: ctx.roomId,
      type,
      description,
    },
  });
  const content = type === "complaint" ? `Complaint: ${description}` : `Request: ${description}`;
  await addMemory(ctx.guestId, ctx.roomId, content);
  return `Done. Tell the guest: I've logged that and the team has been notified.`;
}

export async function handleGetWifiInfo(): Promise<string> {
  return `Tell the guest: The WiFi network is ${WIFI_NAME} and the password is ${WIFI_PASSWORD}.`;
}

export async function handleRequestAmenity(ctx: ToolContext, item: string): Promise<string> {
  return handleLogRequest(ctx, "request", `Request amenity: ${item}`);
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case "log_request":
      return handleLogRequest(
        ctx,
        args.type as "request" | "complaint",
        String(args.description ?? ""),
      );
    case "get_wifi_info":
      return handleGetWifiInfo();
    case "request_amenity":
      return handleRequestAmenity(ctx, String(args.item ?? ""));
    default:
      return `Unknown tool: ${name}`;
  }
}
