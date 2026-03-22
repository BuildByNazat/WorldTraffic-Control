/**
 * config.ts — Frontend configuration constants.
 *
 * Single source of truth for API/WS URLs and reconnect policy.
 * Override via .env.local using the VITE_* prefix.
 */

export const WS_URL: string =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/live";

export const API_BASE: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Milliseconds to wait before attempting a WebSocket reconnect. */
export const WS_RECONNECT_DELAY_MS = 3_000;
