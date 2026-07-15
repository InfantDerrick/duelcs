#!/usr/bin/env node
import { Command } from "commander";
import { MatchRoom, startHost } from "./host.js";
import { selectProblemsFromSettings } from "./catalog.js";
import { defaultPoints, parseProblemInput } from "./protocol.js";
import {
  loadSettingsFile,
  matchConfigFromProblems,
  problemsFromSettingsList,
} from "./settings.js";
import { runSession } from "./ui/SessionApp.js";
import type { MatchConfig, Problem } from "./types.js";

async function buildConfig(options: {
  problems?: string[];
  points?: string;
  duration: string;
  winScore: string;
  config?: string;
}): Promise<{ match: MatchConfig; source: string }> {
  if (options.config) {
    const settings = loadSettingsFile(options.config);
    let problems: Problem[];

    if (settings.problems?.length) {
      problems = problemsFromSettingsList(settings);
      console.log(`Loaded ${problems.length} explicit problems from ${options.config}`);
    } else {
      console.log(`Looking up LeetCode problems from ${options.config}...`);
      problems = await selectProblemsFromSettings(settings);
      console.log("Selected problems:");
      for (const problem of problems) {
        console.log(`  - ${problem.title} (${problem.points} pts)  ${problem.url}`);
      }
    }

    return {
      match: matchConfigFromProblems(problems, settings),
      source: options.config,
    };
  }

  const slugs = options.problems ?? [];
  if (slugs.length === 0) {
    throw new Error("Provide --config settings.yaml or --problems <slugs...>.");
  }

  const pointValues = options.points
    ? options.points.split(",").map((value) => Number(value.trim()))
    : defaultPoints(slugs.length);

  if (pointValues.some((value) => Number.isNaN(value) || value <= 0)) {
    throw new Error("Points must be positive numbers.");
  }

  const problems = slugs.map((raw, index) =>
    parseProblemInput(raw, pointValues[index] ?? pointValues.at(-1)!),
  );

  const durationMinutes = Number(options.duration);
  const winScore = Number(options.winScore);
  if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive number of minutes.");
  }
  if (Number.isNaN(winScore) || winScore <= 0) {
    throw new Error("Win score must be a positive number.");
  }

  return {
    match: { durationMinutes, winScore, problems },
    source: "cli flags",
  };
}

async function runHost(options: {
  port: string;
  bind: string;
  problems?: string[];
  points?: string;
  duration: string;
  winScore: string;
  name: string;
  config?: string;
}) {
  const { match } = await buildConfig(options);
  const room = new MatchRoom(match);
  startHost(room, Number(options.port), options.bind);

  const localUrl = `http://127.0.0.1:${options.port}`;

  console.log("");
  console.log("duelcs host is running.");
  console.log(`Local URL: ${localUrl}`);
  console.log("");
  console.log("Friends should connect to your Tailscale IP, for example:");
  console.log(`  yarn duelcs join http://100.x.x.x:${options.port} --name Alex`);
  console.log("");
  console.log("Everyone needs the userscript: userscript/duelcs.user.js");
  console.log("Install it in Tampermonkey, then paste the host URL and player token shown below.");
  console.log("");

  runSession(localUrl, options.name, true);
}

function runJoin(hostUrl: string, name: string) {
  runSession(hostUrl.replace(/\/$/, ""), name, false);
}

const program = new Command();
program.name("duelcs").description("Friend-hosted LeetCode lockout duels");

program
  .command("host")
  .description("Host a duel on this machine")
  .option("--port <number>", "Port for HTTP/WebSocket traffic", "3737")
  .option("--bind <address>", "Address to bind", "0.0.0.0")
  .option("--name <name>", "Your display name", "Host")
  .option("--config <path>", "YAML settings file for duration, topics, difficulty, count, etc.")
  .option(
    "--problems <items...>",
    "LeetCode slugs or URLs (optional if --config is set)",
  )
  .option("--points <list>", "Comma-separated points per problem")
  .option("--duration <minutes>", "Match length in minutes (ignored if --config sets it)", "45")
  .option("--win-score <points>", "Score needed to win early (ignored if --config sets it)", "800")
  .action(async (options) => {
    try {
      await runHost(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("join")
  .description("Join a friend's duel")
  .argument("<host-url>", "Host URL, e.g. http://100.64.0.2:3737")
  .requiredOption("--name <name>", "Your display name")
  .action((hostUrl: string, options: { name: string }) => runJoin(hostUrl, options.name));

program.parse();
