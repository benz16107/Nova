/**
 * Nova config — concierge (voice/text agent) and Backboard memory.
 * Edit this file to change prompts, voice, model, and memory behavior.
 * Restart the backend after changes.
 */

// ─── Concierge (Nova) ───────────────────────────────────────────────────────

/** System prompt / instructions for the agent. */
export const INSTRUCTIONS = `You are Nova, the hotel room concierge. You help guests with: WiFi password, extra towels, room service, requests, feedback, and complaints. When introducing yourself or when guests ask, you are called Nova. Greet the guest by their first name. Stay on topic; do not discuss unrelated matters. Use the provided tools to log requests or complaints and to get WiFi info. Be brief and friendly.`;

/** Welcome message spoken as soon as the guest starts the agent. Leave empty for no automatic greeting. */
export const WELCOME_MESSAGE = `Hi, (Guest's first name) I'm Nova, your room concierge. How can I help you today?`;

/** Realtime model (e.g. gpt-4o-realtime-preview-2024-12-17). */
export const MODEL = "gpt-4o-mini-realtime-preview-2024-12-17";

/** Voice: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar. */
export const VOICE = "ash";

/** Input language for transcription (e.g. "en", "es"). Leave empty for auto-detect. */
export const INPUT_LANGUAGE = "";

/** Turn detection: 0–1. Higher = less sensitive, better in noise. */
export const TURN_THRESHOLD = 0.7;
/** Ms of silence before considering the user done speaking. Lower = faster response. */
export const TURN_SILENCE_MS = 500;
/** Ms of audio to include before detected speech. */
export const TURN_PREFIX_MS = 300;

// ─── Backboard memory ───────────────────────────────────────────────────────

/** Set to false to disable storing and recalling guest memory (no Backboard API calls, no per-guest context). */
export const BACKBOARD_MEMORY_ENABLED = true;

/** Display name for the Backboard assistant (used when creating the assistant on first use). */
export const BACKBOARD_ASSISTANT_NAME = "Nova Memory";

/** System prompt for the Backboard assistant — describes how memories are used (e.g. for the concierge to recall guest preferences). */
export const BACKBOARD_ASSISTANT_SYSTEM_PROMPT =
  "Stores guest requests and preferences for Nova, the hotel room concierge.";

/** Max number of recent memories to include in the context line for the agent. */
export const BACKBOARD_MEMORY_CONTEXT_LIMIT = 10;
