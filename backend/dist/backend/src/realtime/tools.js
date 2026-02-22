"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLogRequest = handleLogRequest;
exports.handleGetWifiInfo = handleGetWifiInfo;
exports.handleRequestAmenity = handleRequestAmenity;
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
    return `Logged ${type}: ${description}. The manager has been notified.`;
}
async function handleGetWifiInfo() {
    return `WiFi network: ${WIFI_NAME}, Password: ${WIFI_PASSWORD}.`;
}
async function handleRequestAmenity(ctx, item) {
    return handleLogRequest(ctx, "request", `Request amenity: ${item}`);
}
async function runTool(name, args, ctx) {
    switch (name) {
        case "log_request":
            return handleLogRequest(ctx, args.type, String(args.description ?? ""));
        case "get_wifi_info":
            return handleGetWifiInfo();
        case "request_amenity":
            return handleRequestAmenity(ctx, String(args.item ?? ""));
        default:
            return `Unknown tool: ${name}`;
    }
}
