"use strict";
/**
 * Nova config — concierge (voice/text agent) and Backboard memory.
 * Edit this file to change prompts, voice, model, and memory behavior.
 * Restart the backend after changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKBOARD_MEMORY_CONTEXT_LIMIT = exports.BACKBOARD_ASSISTANT_SYSTEM_PROMPT = exports.BACKBOARD_ASSISTANT_NAME = exports.BACKBOARD_MEMORY_ENABLED = exports.TURN_PREFIX_MS = exports.TURN_SILENCE_MS = exports.TURN_THRESHOLD = exports.INPUT_LANGUAGE = exports.VOICE = exports.MODEL = exports.WELCOME_MESSAGE = exports.INSTRUCTIONS = void 0;
// ─── Concierge (Nova) ───────────────────────────────────────────────────────
/** System prompt / instructions for the agent. */
exports.INSTRUCTIONS = `You are Nova, the hotel room concierge. You help guests with: WiFi password, extra towels, room service, requests, feedback, and complaints. When introducing yourself or when guests ask, you are called Nova. Greet the guest by their first name. Stay on topic; do not discuss unrelated matters. Use the provided tools to log requests or complaints and to get WiFi info. Be brief and friendly.

Important: After every tool use (logging a request, complaint, or giving WiFi info), you must always respond to the guest out loud in a short, clear sentence confirming what you did. For example: "I've logged that for you—housekeeping will be notified," or "Here's the WiFi: network X, password Y." Never stay silent after using a tool; the guest must hear or see a confirmation.`;
/** Welcome message spoken as soon as the guest starts the agent. Leave empty for no automatic greeting. */
exports.WELCOME_MESSAGE = `Hi, (Guest's first name) I'm Nova, your room concierge. How can I help you today?`;
/** Realtime model (e.g. gpt-4o-realtime-preview-2024-12-17). */
exports.MODEL = "gpt-4o-mini-realtime-preview-2024-12-17";
/** Voice: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar. */
exports.VOICE = "ash";
/** Input language for transcription (e.g. "en", "es"). Leave empty for auto-detect. */
exports.INPUT_LANGUAGE = "";
/** Turn detection: 0–1. Higher = less sensitive, better in noise. */
exports.TURN_THRESHOLD = 0.7;
/** Ms of silence before considering the user done speaking. Lower = faster response. */
exports.TURN_SILENCE_MS = 500;
/** Ms of audio to include before detected speech. */
exports.TURN_PREFIX_MS = 300;
// ─── Backboard memory ───────────────────────────────────────────────────────
/** Set to false to disable storing and recalling guest memory (no Backboard API calls, no per-guest context). */
exports.BACKBOARD_MEMORY_ENABLED = true;
/** Display name for the Backboard assistant (used when creating the assistant on first use). */
exports.BACKBOARD_ASSISTANT_NAME = "Nova Memory";
/** System prompt for the Backboard assistant — describes how memories are used (e.g. for the concierge to recall guest preferences). */
exports.BACKBOARD_ASSISTANT_SYSTEM_PROMPT = "Stores guest requests and preferences for Nova, the hotel room concierge.";
/** Max number of recent memories to include in the context line for the agent. */
exports.BACKBOARD_MEMORY_CONTEXT_LIMIT = 10;
