/**
 * Frontend runtime configuration.
 *
 * Defaults are same-origin so production deployments behind a reverse proxy do
 * not need hardcoded localhost URLs. Local development works through the Vite
 * dev-server proxy defined in vite.config.ts.
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const explicitApiBase = import.meta.env.VITE_API_URL?.trim();
const explicitWsUrl = import.meta.env.VITE_WS_URL?.trim();
const browserWsProtocol = window.location.protocol === "https:" ? "wss" : "ws";

export const API_BASE: string = explicitApiBase
  ? stripTrailingSlash(explicitApiBase)
  : "";

export const WS_URL: string =
  explicitWsUrl || `${browserWsProtocol}://${window.location.host}/ws/live`;

export const WS_RECONNECT_DELAY_MS = 3_000;
