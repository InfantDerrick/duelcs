import type { MatchState } from "./types.js";

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "claim"; slug: string; submissionUrl?: string };

export type ServerMessage =
  | { type: "welcome"; state: MatchState; playerId: string; token: string }
  | { type: "state"; state: MatchState }
  | { type: "error"; message: string };

export interface SolveReport {
  token: string;
  slug: string;
  submissionUrl?: string;
  reportedAt?: number;
}

export function parseProblemInput(raw: string, points: number): {
  slug: string;
  title: string;
  url: string;
  points: number;
} {
  const trimmed = raw.trim();
  let slug = trimmed;
  let url = trimmed;

  const urlMatch = trimmed.match(/leetcode\.com\/problems\/([^/?#]+)/i);
  if (urlMatch) {
    slug = urlMatch[1]!;
  }

  slug = slug.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!slug) {
    throw new Error(`Could not parse problem from "${raw}"`);
  }

  if (!url.startsWith("http")) {
    url = `https://leetcode.com/problems/${slug}/`;
  }

  const title = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return { slug, title, url, points };
}

export function defaultPoints(count: number): number[] {
  const base = [100, 200, 300, 400, 500, 600];
  if (count <= base.length) {
    return base.slice(0, count);
  }
  return Array.from({ length: count }, (_, i) => (i + 1) * 100);
}

export function remainingMs(state: MatchState, now = Date.now()): number | null {
  if (state.phase !== "running" || state.endsAt == null) {
    return null;
  }
  return Math.max(0, state.endsAt - now);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
