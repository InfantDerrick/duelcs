import type { GameMode, MatchConfig, MatchState, Problem, ProblemLock, SolveRecord } from "./types.js";

export interface ModeInfo {
  id: GameMode;
  label: string;
  short: string;
  description: string;
}

export const MODES: Record<GameMode, ModeInfo> = {
  lockout: {
    id: "lockout",
    label: "Lockout",
    short: "LOCKOUT",
    description: "First Accepted solve locks the problem. Only that player gets the points.",
  },
  cumulative: {
    id: "cumulative",
    label: "Cumulative",
    short: "CUMULATIVE",
    description: "Timed race. Everyone can score on every problem once. Highest total wins.",
  },
  speed: {
    id: "speed",
    label: "Speed",
    short: "SPEED",
    description: "Timed race with diminishing points: 1st gets 100%, 2nd gets 50%, 3rd+ gets 25%.",
  },
};

export function normalizeMode(raw: string): GameMode {
  const value = raw.trim().toLowerCase();
  if (value === "lockout") return "lockout";
  if (value === "cumulative" || value === "timed" || value === "cumulative-timed") return "cumulative";
  if (value === "speed" || value === "diminishing") return "speed";
  throw new Error(`Unknown mode "${raw}". Use lockout, cumulative, or speed.`);
}

export function playerSolvedProblem(lock: ProblemLock, playerId: string): boolean {
  return lock.solves.some((solve) => solve.playerId === playerId);
}

export function canAcceptSolve(mode: GameMode, lock: ProblemLock, playerId: string): boolean {
  if (playerSolvedProblem(lock, playerId)) {
    return false;
  }
  if (mode === "lockout") {
    return lock.solves.length === 0;
  }
  return true;
}

export function pointsForSolve(mode: GameMode, problem: Problem, lock: ProblemLock): number {
  const order = lock.solves.length;
  if (mode === "lockout" || mode === "cumulative") {
    return problem.points;
  }
  if (order === 0) return problem.points;
  if (order === 1) return Math.floor(problem.points / 2);
  return Math.floor(problem.points / 4);
}

export function scoreTarget(config: MatchConfig): number {
  if (config.winScore != null) {
    return config.winScore;
  }
  return config.problems.reduce((sum, problem) => sum + problem.points, 0);
}

export function winConditionLabel(config: MatchConfig): string {
  if (config.winScore != null) {
    return `first to ${config.winScore} pts`;
  }
  return "most points when time runs out";
}

export function activityVerb(mode: GameMode): string {
  if (mode === "lockout") return "locked";
  if (mode === "speed") return "scored";
  return "solved";
}

export function showSnipeBadge(mode: GameMode, lock: ProblemLock, now: number): boolean {
  if (mode !== "lockout" || lock.solves.length === 0) {
    return false;
  }
  const first = lock.solves[0]!;
  return now - first.solvedAt < 4000;
}

export function problemStatusText(
  mode: GameMode,
  lock: ProblemLock | undefined,
  meId: string,
  playerCount: number,
): { text: string; color: string; bold: boolean; dimmed: boolean } {
  if (!lock || lock.solves.length === 0) {
    return { text: "○ open", color: "gray", bold: false, dimmed: false };
  }

  if (mode === "lockout") {
    const first = lock.solves[0]!;
    const mine = first.playerId === meId;
    return {
      text: mine ? "🔒 you" : `🔒 ${first.playerName}`,
      color: mine ? "greenBright" : "redBright",
      bold: mine,
      dimmed: true,
    };
  }

  const mine = playerSolvedProblem(lock, meId);
  const count = lock.solves.length;
  if (count >= playerCount) {
    return { text: "✓ all done", color: "gray", bold: false, dimmed: true };
  }
  if (mine) {
    return { text: `✓ you (${count}/${playerCount})`, color: "greenBright", bold: true, dimmed: false };
  }
  const names = lock.solves.map((solve) => solve.playerName).join(", ");
  return { text: `✓ ${names}`, color: "yellow", bold: false, dimmed: false };
}

export interface ActivityEntry {
  key: string;
  slug: string;
  title: string;
  points: number;
  playerName: string;
  playerId: string;
  solvedAt: number;
}

export function buildActivity(state: MatchState): ActivityEntry[] {
  const bySlug = new Map(state.config.problems.map((problem) => [problem.slug, problem]));
  const entries: ActivityEntry[] = [];

  for (const lock of state.locks) {
    const problem = bySlug.get(lock.slug);
    for (const solve of lock.solves) {
      entries.push({
        key: `${lock.slug}-${solve.playerId}-${solve.solvedAt}`,
        slug: lock.slug,
        title: problem?.title ?? lock.slug,
        points: solve.points,
        playerName: solve.playerName,
        playerId: solve.playerId,
        solvedAt: solve.solvedAt,
      });
    }
  }

  return entries.sort((a, b) => b.solvedAt - a.solvedAt);
}

export function applySolve(
  config: MatchConfig,
  lock: ProblemLock,
  problem: Problem,
  player: { id: string; name: string },
  report: { submissionUrl?: string; reportedAt?: number },
): SolveRecord | null {
  if (!canAcceptSolve(config.mode, lock, player.id)) {
    return null;
  }

  const points = pointsForSolve(config.mode, problem, lock);
  const record: SolveRecord = {
    playerId: player.id,
    playerName: player.name,
    points,
    solvedAt: report.reportedAt ?? Date.now(),
    submissionUrl: report.submissionUrl ?? null,
  };

  lock.solves.push(record);
  return record;
}
