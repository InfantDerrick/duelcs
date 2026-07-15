import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { MatchConfig, MatchState, Player, ProblemLock } from "./types.js";
import type { ClientMessage, SolveReport } from "./protocol.js";
import { applySolve } from "./modes.js";

function id(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function cloneState(state: MatchState): MatchState {
  return structuredClone(state);
}

export class MatchRoom {
  readonly state: MatchState;
  private sockets = new Map<string, WebSocket>();

  constructor(config: MatchConfig) {
    this.state = {
      id: id("match"),
      phase: "lobby",
      config,
      players: [],
      locks: config.problems.map((problem) => ({
        slug: problem.slug,
        solves: [],
      })),
      startedAt: null,
      endsAt: null,
      winnerId: null,
    };
  }

  addPlayer(name: string, socket: WebSocket): Player {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Name is required.");
    }
    if (this.state.players.some((player) => player.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`"${trimmed}" is already in this duel.`);
    }
    if (this.state.phase === "finished") {
      throw new Error("This duel has already ended.");
    }

    const player: Player = {
      id: id("player"),
      name: trimmed,
      token: randomBytes(12).toString("hex"),
      score: 0,
      connected: true,
    };

    this.state.players.push(player);
    this.sockets.set(player.id, socket);
    return player;
  }

  announcePlayerJoined(): void {
    this.broadcast();
  }

  reconnectPlayer(playerId: string, socket: WebSocket): Player {
    const player = this.state.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Unknown player.");
    }
    player.connected = true;
    this.sockets.set(player.id, socket);
    this.broadcast();
    return player;
  }

  disconnectPlayer(playerId: string): void {
    const player = this.state.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    player.connected = false;
    this.sockets.delete(playerId);
    this.broadcast();
  }

  start(): void {
    if (this.state.phase !== "lobby") {
      throw new Error("This duel has already started.");
    }
    if (this.state.players.length < 2) {
      throw new Error("Need at least two players before starting.");
    }

    const now = Date.now();
    this.state.phase = "running";
    this.state.startedAt = now;
    this.state.endsAt = now + this.state.config.durationMinutes * 60_000;
    this.broadcast();
  }

  reportSolve(report: SolveReport): void {
    if (this.state.phase !== "running") {
      throw new Error("This duel is not running yet.");
    }

    const player = this.state.players.find((entry) => entry.token === report.token);
    if (!player) {
      throw new Error("Unknown player token.");
    }

    const lock = this.state.locks.find((entry) => entry.slug === report.slug);
    if (!lock) {
      throw new Error(`Problem "${report.slug}" is not part of this duel.`);
    }

    const problem = this.state.config.problems.find((entry) => entry.slug === report.slug);
    if (!problem) {
      throw new Error(`Problem "${report.slug}" is not part of this duel.`);
    }

    const record = applySolve(this.state.config, lock, problem, player, report);
    if (!record) {
      return;
    }

    player.score += record.points;

    if (this.state.config.winScore != null && player.score >= this.state.config.winScore) {
      this.finish(player.id);
      return;
    }

    this.broadcast();
  }

  tick(now = Date.now()): void {
    if (this.state.phase !== "running" || this.state.endsAt == null) {
      return;
    }
    if (now >= this.state.endsAt) {
      this.finishByScore();
    }
  }

  private finish(winnerId: string): void {
    this.state.phase = "finished";
    this.state.winnerId = winnerId;
    this.broadcast();
  }

  private finishByScore(): void {
    const sorted = [...this.state.players].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const tied = sorted.filter((player) => player.score === top?.score);
    this.state.phase = "finished";
    this.state.winnerId = tied.length === 1 ? top!.id : null;
    this.broadcast();
  }

  broadcast(): void {
    const payload = JSON.stringify({ type: "state", state: cloneState(this.state) });
    for (const socket of this.sockets.values()) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

export interface HostServer {
  url: string;
  close: () => Promise<void>;
}

export function startHost(room: MatchRoom, port: number, bindHost = "0.0.0.0"): HostServer {
  const httpServer = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, phase: room.state.phase });
      return;
    }

    if (req.method === "GET" && req.url === "/state") {
      sendJson(res, 200, room.state);
      return;
    }

    if (req.method === "POST" && req.url === "/solve") {
      try {
        const body = JSON.parse(await readBody(req)) as SolveReport;
        console.log(`[duelcs] solve report: slug=${body.slug} token=${String(body.token || "").slice(0, 8)}…`);
        room.reportSolve(body);
        sendJson(res, 200, { ok: true, state: room.state });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bad request";
        console.warn(`[duelcs] solve rejected: ${message}`);
        sendJson(res, 400, { ok: false, message });
      }
      return;
    }

    sendJson(res, 404, { ok: false, message: "Not found" });
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket) => {
    let boundPlayerId: string | null = null;

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw)) as ClientMessage;

        if (message.type === "join") {
          const player = room.addPlayer(message.name, socket);
          boundPlayerId = player.id;
          socket.send(
            JSON.stringify({
              type: "welcome",
              state: cloneState(room.state),
              playerId: player.id,
              token: player.token,
            }),
          );
          room.announcePlayerJoined();
          return;
        }

        if (message.type === "start") {
          room.start();
          return;
        }

        if (message.type === "claim") {
          if (!boundPlayerId) {
            throw new Error("Join the duel before claiming a solve.");
          }
          const player = room.state.players.find((entry) => entry.id === boundPlayerId);
          if (!player) {
            throw new Error("Unknown player.");
          }
          room.reportSolve({
            token: player.token,
            slug: message.slug,
            submissionUrl: message.submissionUrl,
          });
          return;
        }
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Unexpected error",
          }),
        );
      }
    });

    socket.on("close", () => {
      if (boundPlayerId) {
        room.disconnectPlayer(boundPlayerId);
      }
    });
  });

  httpServer.listen(port, bindHost, () => {
    // listening
  });

  const timer = setInterval(() => room.tick(), 1000);

  return {
    url: `http://${bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost}:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(timer);
        wss.close((wsError) => {
          if (wsError) {
            reject(wsError);
            return;
          }
          httpServer.close((httpError) => {
            if (httpError) {
              reject(httpError);
              return;
            }
            resolve();
          });
        });
      }),
  };
}
