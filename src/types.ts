export interface Problem {
  slug: string;
  title: string;
  url: string;
  points: number;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  score: number;
  connected: boolean;
}

export interface ProblemLock {
  slug: string;
  ownerId: string | null;
  ownerName: string | null;
  lockedAt: number | null;
  submissionUrl: string | null;
}

export interface MatchConfig {
  durationMinutes: number;
  winScore: number;
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
