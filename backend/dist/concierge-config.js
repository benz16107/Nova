"use strict";
/**
 * Concierge agent config — edit this file to change the prompt and behavior.
 * Restart the backend after changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TURN_PREFIX_MS = exports.TURN_SILENCE_MS = exports.TURN_THRESHOLD = exports.INPUT_LANGUAGE = exports.VOICE = exports.MODEL = exports.WELCOME_MESSAGE = exports.INSTRUCTIONS = void 0;
/** System prompt / instructions for the agent. */
exports.INSTRUCTIONS = `You are the hotel room concierge. You help guests with: WiFi password, extra towels, room service, requests, feedback, and complaints. Greet the guest by their first name. Stay on topic; do not discuss unrelated matters. Use the provided tools to log requests or complaints and to get WiFi info. Be brief and friendly.`;
/** Welcome message spoken as soon as the guest starts the agent. Leave empty for no automatic greeting. */
exports.WELCOME_MESSAGE = `Hi, (Guest's first name) I'm your room concierge. How can I help you today?`;
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
