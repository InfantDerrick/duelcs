#!/usr/bin/env node
import { Command } from "commander";
import { MatchRoom, startHost } from "./host.js";
import { defaultPoints, parseProblemInput } from "./protocol.js";
import { runSession } from "./ui/SessionApp.js";

function buildConfig(options: {
  problems: string[];
  points?: string;
  duration: string;
  winScore: string;
}) {
  const slugs = options.problems;
  if (slugs.length === 0) {
    throw new Error("Provide at least one problem with --problems.");
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

  return { durationMinutes, winScore, problems };
}

function runHost(options: {
  port: string;
  bind: string;
  problems: string[];
  points?: string;
  duration: string;
  winScore: string;
  name: string;
}) {
  const config = buildConfig(options);
  const room = new MatchRoom(config);
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
  .requiredOption(
    "--problems <items...>",
    "LeetCode slugs or URLs (example: two-sum https://leetcode.com/problems/3sum/)",
  )
  .option("--points <list>", "Comma-separated points per problem")
  .option("--duration <minutes>", "Match length in minutes", "45")
  .option("--win-score <points>", "Score needed to win early", "800")
  .action(runHost);

program
  .command("join")
  .description("Join a friend's duel")
  .argument("<host-url>", "Host URL, e.g. http://100.64.0.2:3737")
  .requiredOption("--name <name>", "Your display name")
  .action((hostUrl: string, options: { name: string }) => runJoin(hostUrl, options.name));

program.parse();
