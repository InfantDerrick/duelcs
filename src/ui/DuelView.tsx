import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { JoinSession } from "../client.js";
import type { MatchState, ProblemLock } from "../types.js";
import { formatDuration, remainingMs } from "../protocol.js";

interface DuelViewProps {
  hostUrl: string;
  session: JoinSession;
  state: MatchState;
  isHost: boolean;
  statusMessage?: string;
}

function lockLabel(lock: ProblemLock): string {
  if (!lock.ownerName) {
    return "open";
  }
  return lock.ownerName;
}

function winnerName(state: MatchState): string | null {
  if (!state.winnerId) {
    return null;
  }
  return state.players.find((player) => player.id === state.winnerId)?.name ?? null;
}

export function DuelView({ hostUrl, session, state, isHost, statusMessage }: DuelViewProps) {
  const { stdout } = useStdout();
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState(statusMessage ?? "");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (statusMessage) {
      setNotice(statusMessage);
    }
  }, [statusMessage]);

  const remaining = remainingMs(state, now);
  const winner = winnerName(state);

  const helpLines = useMemo(() => {
    const lines = ["Solve on leetcode.com — the userscript reports Accepted solves automatically."];
    if (state.phase === "lobby" && isHost) {
      lines.push("Press s to start once everyone has joined.");
    }
    if (state.phase === "running") {
      lines.push("Press 1-9 to manually claim a problem if the userscript misses one.");
    }
    lines.push("Press q to leave.");
    return lines;
  }, [isHost, state.phase]);

  useInput(
    (input, key) => {
      if (input === "q") {
        session.close();
        process.exit(0);
      }

      if (input === "s" && isHost && state.phase === "lobby") {
        session.send({ type: "start" });
        setNotice("Starting duel...");
        return;
      }

      if (state.phase === "running" && /^[1-9]$/.test(input)) {
        const index = Number(input) - 1;
        const problem = state.config.problems[index];
        if (!problem) {
          setNotice(`No problem #${input}.`);
          return;
        }
        session.send({ type: "claim", slug: problem.slug });
        setNotice(`Claim sent for ${problem.title}.`);
      }
    },
    { isActive: Boolean(process.stdin.isTTY) },
  );

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        duelcs
      </Text>
      <Text>
        Host: {hostUrl} · You: {state.players.find((player) => player.id === session.playerId)?.name ?? "?"}
      </Text>
      <Text>
        Phase: {state.phase}
        {state.phase === "running" && remaining != null ? ` · ${formatDuration(remaining)} left` : ""}
        {state.phase === "finished" && winner ? ` · Winner: ${winner}` : ""}
        {state.phase === "finished" && !winner ? " · Tie" : ""}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Problems</Text>
        {state.config.problems.map((problem, index) => {
          const lock = state.locks.find((entry) => entry.slug === problem.slug);
          return (
            <Text key={problem.slug}>
              {index + 1}. {problem.title} ({problem.points} pts) — {lock ? lockLabel(lock) : "open"}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Scores</Text>
        {state.players.map((player) => (
          <Text key={player.id}>
            {player.name}: {player.score}
            {!player.connected ? " (disconnected)" : ""}
            {player.id === session.playerId ? " ← you" : ""}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Userscript setup</Text>
        <Text>Host URL: {hostUrl.replace(/\/$/, "")}</Text>
        <Text>Player token: {session.token}</Text>
        <Text dimColor>Install userscript/duelcs.user.js in Tampermonkey, then paste those values.</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {helpLines.map((line) => (
          <Text key={line} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {notice ? (
        <Box marginTop={1}>
          <Text color="yellow">{notice}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>Terminal width: {stdout.columns}</Text>
      </Box>
    </Box>
  );
}
