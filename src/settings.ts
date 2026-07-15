import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { defaultPoints, parseProblemInput } from "./protocol.js";
import type { MatchConfig, Problem } from "./types.js";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface DuelSettings {
  durationMinutes: number;
  winScore: number;
  problemCount: number;
  points?: number[];
  difficulty: Difficulty[];
  topics: string[];
  excludePremium: boolean;
  seed?: number;
  problems?: string[];
}

function asStringArray(value: unknown, field: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`settings.${field} must be a list of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeDifficulty(raw: string): Difficulty {
  const value = raw.trim().toLowerCase();
  if (value === "easy") return "Easy";
  if (value === "medium") return "Medium";
  if (value === "hard") return "Hard";
  throw new Error(`Unknown difficulty "${raw}". Use Easy, Medium, or Hard.`);
}

function normalizeTopicSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[&/]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadSettingsFile(path: string): DuelSettings {
  const absolute = resolve(path);
  const raw = loadYaml(readFileSync(absolute, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Settings file must be a YAML object.");
  }

  const doc = raw as Record<string, unknown>;
  const durationMinutes = Number(doc.duration_minutes ?? 45);
  const winScore = Number(doc.win_score ?? 800);
  const problemCount = Number(doc.problem_count ?? 5);
  const excludePremium = doc.exclude_premium !== false;

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("settings.duration_minutes must be a positive number.");
  }
  if (!Number.isFinite(winScore) || winScore <= 0) {
    throw new Error("settings.win_score must be a positive number.");
  }
  if (!Number.isFinite(problemCount) || problemCount <= 0) {
    throw new Error("settings.problem_count must be a positive number.");
  }

  let points: number[] | undefined;
  if (doc.points != null) {
    if (!Array.isArray(doc.points) || doc.points.some((p) => typeof p !== "number")) {
      throw new Error("settings.points must be a list of numbers.");
    }
    points = doc.points as number[];
  }

  const difficultyRaw = asStringArray(doc.difficulty, "difficulty");
  const difficulty =
    difficultyRaw.length > 0 ? difficultyRaw.map(normalizeDifficulty) : (["Easy", "Medium"] as Difficulty[]);

  const topics = asStringArray(doc.topics, "topics").map(normalizeTopicSlug);
  const problems = asStringArray(doc.problems, "problems");

  let seed: number | undefined;
  if (doc.seed != null) {
    seed = Number(doc.seed);
    if (!Number.isFinite(seed)) {
      throw new Error("settings.seed must be a number.");
    }
  }

  return {
    durationMinutes,
    winScore,
    problemCount,
    points,
    difficulty,
    topics,
    excludePremium,
    seed,
    problems: problems.length > 0 ? problems : undefined,
  };
}

export function problemsFromSettingsList(settings: DuelSettings): Problem[] {
  if (!settings.problems?.length) {
    throw new Error("No explicit problems in settings.");
  }
  const pointValues = settings.points ?? defaultPoints(settings.problems.length);
  return settings.problems.map((raw, index) =>
    parseProblemInput(raw, pointValues[index] ?? pointValues.at(-1)!),
  );
}

export function matchConfigFromProblems(
  problems: Problem[],
  settings: Pick<DuelSettings, "durationMinutes" | "winScore">,
): MatchConfig {
  return {
    durationMinutes: settings.durationMinutes,
    winScore: settings.winScore,
    problems,
  };
}
