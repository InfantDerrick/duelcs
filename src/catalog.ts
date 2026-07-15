import type { Difficulty, DuelSettings } from "./settings.js";
import { defaultPoints } from "./protocol.js";
import type { Problem } from "./types.js";

export interface CatalogProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  topics: string[];
}

const GRAPHQL_URL = "https://leetcode.com/graphql";

const LIST_QUERY = `
query duelcsProblemList($filters: QuestionFilterInput, $limit: Int, $skip: Int) {
  problemsetQuestionListV2(filters: $filters, limit: $limit, skip: $skip) {
    totalLength
    hasMore
    questions {
      titleSlug
      title
      difficulty
      paidOnly
      topicTags { name slug }
    }
  }
}
`;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed?: number): T[] {
  const copy = [...items];
  const random = seed == null ? Math.random : mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function difficultyToApi(value: Difficulty): string {
  return value.toUpperCase();
}

function mapQuestion(raw: {
  titleSlug: string;
  title: string;
  difficulty: string;
  paidOnly: boolean;
  topicTags: { name: string; slug: string }[];
}): CatalogProblem {
  const difficulty = raw.difficulty.toLowerCase();
  let normalized: Difficulty = "Medium";
  if (difficulty === "easy") normalized = "Easy";
  if (difficulty === "hard") normalized = "Hard";

  return {
    slug: raw.titleSlug,
    title: raw.title,
    difficulty: normalized,
    paidOnly: Boolean(raw.paidOnly),
    topics: (raw.topicTags ?? []).map((tag) => tag.slug),
  };
}

async function fetchPage(filters: Record<string, unknown>, skip: number, limit: number): Promise<{
  problems: CatalogProblem[];
  totalLength: number;
  hasMore: boolean;
}> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/problemset/",
    },
    body: JSON.stringify({
      query: LIST_QUERY,
      variables: { filters, limit, skip },
    }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode GraphQL request failed (${response.status}).`);
  }

  const body = (await response.json()) as {
    errors?: { message: string }[];
    data?: {
      problemsetQuestionListV2?: {
        totalLength: number;
        hasMore: boolean;
        questions: {
          titleSlug: string;
          title: string;
          difficulty: string;
          paidOnly: boolean;
          topicTags: { name: string; slug: string }[];
        }[];
      };
    };
  };

  if (body.errors?.length) {
    throw new Error(`LeetCode GraphQL error: ${body.errors[0]!.message}`);
  }

  const payload = body.data?.problemsetQuestionListV2;
  if (!payload) {
    throw new Error("Unexpected LeetCode GraphQL response.");
  }

  return {
    problems: payload.questions.map(mapQuestion),
    totalLength: payload.totalLength,
    hasMore: payload.hasMore,
  };
}

function buildFilters(settings: DuelSettings): Record<string, unknown> {
  const filters: Record<string, unknown> = {
    filterCombineType: "ALL",
  };

  if (settings.difficulty.length > 0) {
    filters.difficultyFilter = {
      difficulties: settings.difficulty.map(difficultyToApi),
      operator: "IS",
    };
  }

  if (settings.topics.length > 0) {
    filters.topicFilter = {
      topicSlugs: settings.topics,
      operator: "IS",
    };
  }

  return filters;
}

/** Fetch a pool of matching free problems, then randomly pick problem_count. */
export async function selectProblemsFromSettings(settings: DuelSettings): Promise<Problem[]> {
  const filters = buildFilters(settings);
  const pageSize = 100;
  const maxPool = Math.max(settings.problemCount * 20, 200);
  const pool: CatalogProblem[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore && pool.length < maxPool) {
    const page = await fetchPage(filters, skip, pageSize);
    const batch = page.problems.filter((problem) => !settings.excludePremium || !problem.paidOnly);
    pool.push(...batch);
    skip += page.problems.length;
    hasMore = page.hasMore && page.problems.length > 0;

    if (page.problems.length === 0) {
      break;
    }
  }

  if (pool.length < settings.problemCount) {
    const topicHint =
      settings.topics.length > 0 ? ` topics=[${settings.topics.join(", ")}]` : "";
    const difficultyHint =
      settings.difficulty.length > 0 ? ` difficulty=[${settings.difficulty.join(", ")}]` : "";
    throw new Error(
      `Only found ${pool.length} matching free problems (need ${settings.problemCount}).` +
        ` Try broadening${difficultyHint}${topicHint}.`,
    );
  }

  const chosen = shuffle(pool, settings.seed).slice(0, settings.problemCount);
  const pointValues = settings.points ?? defaultPoints(chosen.length);

  return chosen.map((problem, index) => ({
    slug: problem.slug,
    title: problem.title,
    url: `https://leetcode.com/problems/${problem.slug}/`,
    points: pointValues[index] ?? pointValues.at(-1)!,
  }));
}
