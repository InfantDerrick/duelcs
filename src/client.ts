import WebSocket from "ws";
import type { MatchState } from "./types.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";

export interface JoinSession {
  playerId: string;
  token: string;
  send: (message: ClientMessage) => void;
  close: () => void;
}

function toWsUrl(hostUrl: string): string {
  const url = new URL(hostUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString().replace(/\/$/, "");
}

export function connectToHost(hostUrl: string, name: string, handlers: {
  onWelcome: (session: JoinSession, state: MatchState) => void;
  onState: (state: MatchState) => void;
  onError: (message: string) => void;
}): JoinSession {
  const ws = new WebSocket(toWsUrl(hostUrl));

  const send = (message: ClientMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const session: JoinSession = {
    playerId: "",
    token: "",
    send,
    close: () => ws.close(),
  };

  ws.on("open", () => {
    send({ type: "join", name });
  });

  ws.on("message", (raw) => {
    const message = JSON.parse(String(raw)) as ServerMessage;
    if (message.type === "welcome") {
      session.playerId = message.playerId;
      session.token = message.token;
      handlers.onWelcome(session, message.state);
      handlers.onState(message.state);
      return;
    }
    if (message.type === "state") {
      handlers.onState(message.state);
      return;
    }
    if (message.type === "error") {
      handlers.onError(message.message);
    }
  });

  ws.on("error", () => {
    handlers.onError("Could not connect to the host. Check the URL and Tailscale connection.");
  });

  ws.on("close", () => {
    handlers.onError("Disconnected from host.");
  });

  return session;
}

export async function reportSolveHttp(hostUrl: string, payload: {
  token: string;
  slug: string;
  submissionUrl?: string;
}): Promise<void> {
  const base = hostUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, reportedAt: Date.now() }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to report solve.");
  }
}
