"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLogRequest = handleLogRequest;
exports.handleGetWifiInfo = handleGetWifiInfo;
exports.handleRequestAmenity = handleRequestAmenity;
exports.handleSubmitFeedback = handleSubmitFeedback;
exports.runTool = runTool;
const db_js_1 = require("../db.js");
const backboard_js_1 = require("../backboard.js");
const WIFI_NAME = process.env.HOTEL_WIFI_NAME ?? "Hotel-Guest";
const WIFI_PASSWORD = process.env.HOTEL_WIFI_PASSWORD ?? "welcome123";
async function handleLogRequest(ctx, type, description) {
    await db_js_1.prisma.request.create({
        data: {
            guestId: ctx.guestId,
            roomId: ctx.roomId,
            type,
            description,
        },
    });
    const content = type === "complaint" ? `Complaint: ${description}` : `Request: ${description}`;
    await (0, backboard_js_1.addMemory)(ctx.guestId, ctx.roomId, content);
    const typeLabel = type === "complaint" ? "complaint" : "request";
    return `Done. Tell the guest: I've logged your ${typeLabel} and the team has been notified. If the manager replies, you'll see their reply the next time you open Nova.`;
}
async function handleGetWifiInfo() {
    return `Tell the guest: The WiFi network is ${WIFI_NAME} and the password is ${WIFI_PASSWORD}.`;
}
async function handleRequestAmenity(ctx, item) {
    return handleLogRequest(ctx, "request", `Request amenity: ${item}`);
}
async function handleSubmitFeedback(ctx, content, source) {
    await db_js_1.prisma.feedback.create({
        data: {
            guestId: ctx.guestId,
            roomId: ctx.roomId,
            content: content.trim(),
            source,
        },
    });
    return "Done. Tell the guest: Thank you, your feedback has been recorded and will be shared with the team.";
}
async function runTool(name, args, ctx) {
    switch (name) {
        case "log_request":
            return handleLogRequest(ctx, args.type, String(args.description ?? ""));
        case "get_wifi_info":
            return handleGetWifiInfo();
        case "request_amenity":
            return handleRequestAmenity(ctx, String(args.item ?? ""));
        case "submit_feedback":
            return handleSubmitFeedback(ctx, String(args.content ?? ""), args.source === "voice" ? "voice" : "text");
        default:
            return `Unknown tool: ${name}`;
    }
}
