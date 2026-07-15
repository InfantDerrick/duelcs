export interface Problem {
  slug: string;
  title: string;
  url: string;
  points: number;
}

export type GameMode = "lockout" | "cumulative" | "speed";

export interface Player {
  id: string;
  name: string;
  token: string;
  score: number;
  connected: boolean;
}

export interface SolveRecord {
  playerId: string;
  playerName: string;
  points: number;
  solvedAt: number;
  submissionUrl: string | null;
}

export interface ProblemLock {
  slug: string;
  solves: SolveRecord[];
}

export interface MatchConfig {
  mode: GameMode;
  durationMinutes: number;
  winScore: number | null;
  problems: Problem[];
}

export interface MatchState {
  id: string;
  phase: "lobby" | "running" | "finished";
  config: MatchConfig;
  players: Player[];
  locks: ProblemLock[];
  startedAt: number | null;
  endsAt: number | null;
  winnerId: string | null;
}

export interface JoinInfo {
  playerId: string;
  token: string;
  name: string;
  hostUrl: string;
}
