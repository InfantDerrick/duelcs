import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { Link } from "./Link.js";
import type { JoinSession } from "../client.js";
import type { MatchState, Player } from "../types.js";
import { formatDuration, remainingMs } from "../protocol.js";
import {
  MODES,
  activityVerb,
  buildActivity,
  problemStatusText,
  scoreTarget,
  showSnipeBadge,
  winConditionLabel,
} from "../modes.js";

interface DuelViewProps {
  hostUrl: string;
  session: JoinSession;
  state: MatchState;
  isHost: boolean;
  statusMessage?: string;
}

const PLAYER_COLORS = ["cyan", "magenta", "green", "yellow", "blue", "red"] as const;
const MEDALS = ["🥇", "🥈", "🥉"];

function playerColor(state: MatchState, playerId: string): string {
  const index = state.players.findIndex((player) => player.id === playerId);
  return PLAYER_COLORS[index % PLAYER_COLORS.length] ?? "white";
}

function winnerName(state: MatchState): string | null {
  if (!state.winnerId) {
    return null;
  }
  return state.players.find((player) => player.id === state.winnerId)?.name ?? null;
}

function bar(ratio: number, width: number, fill = "█", empty = "░"): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return fill.repeat(filled) + empty.repeat(Math.max(0, width - filled));
}

function clockTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, Math.max(1, max - 1)) + "…";
}

function PhaseBadge({ phase }: { phase: MatchState["phase"] }) {
  const map = {
    lobby: { bg: "yellow", label: " LOBBY " },
    running: { bg: "green", label: " ● LIVE " },
    finished: { bg: "magenta", label: " FINISHED " },
  } as const;
  const { bg, label } = map[phase];
  return (
    <Text backgroundColor={bg} color="black" bold>
      {label}
    </Text>
  );
}

export function DuelView({ hostUrl, session, state, isHost, statusMessage }: DuelViewProps) {
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState(statusMessage ?? "");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (statusMessage) {
      setNotice(statusMessage);
    }
  }, [statusMessage]);

  useEffect(() => {
    if (state.phase === "running" || state.phase === "finished") {
      setNotice("");
    }
  }, [state.phase]);

  const remaining = remainingMs(state, now);
  const winner = winnerName(state);
  const me = state.players.find((player) => player.id === session.playerId);
  const leaderScore = Math.max(0, ...state.players.map((player) => player.score));
  const activity = useMemo(() => buildActivity(state), [state]);
  const targetScore = scoreTarget(state.config);
  const modeInfo = MODES[state.config.mode];
  const verb = activityVerb(state.config.mode);

  const totalMs = state.config.durationMinutes * 60_000;
  const elapsedRatio = remaining != null ? 1 - remaining / totalMs : 0;
  const lowTime = remaining != null && remaining <= 60_000;

  const titleWidth = useMemo(() => {
    const longest = Math.max(18, ...state.config.problems.map((problem) => problem.title.length));
    return Math.min(longest, 40);
  }, [state.config.problems]);

  useInput(
    (input) => {
      if (input === "q") {
        session.close();
        process.exit(0);
      }

      if (input === "s" && isHost && state.phase === "lobby") {
        if (state.players.length < 2) {
          setNotice("Need at least two players before starting. Have a friend join first.");
          return;
        }
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
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="cyanBright"
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color="cyanBright">
          ⚔  D U E L C S
        </Text>
        <Text dimColor>
          {modeInfo.short} · {me ? `you: ${me.name}` : "connecting…"}
        </Text>
      </Box>

      {/* Status line */}
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <PhaseBadge phase={state.phase} />
          {state.phase === "finished" ? (
            <Text bold color={winner ? "greenBright" : "yellowBright"}>
              {"  "}
              {winner ? `🏆 ${winner} wins!` : "🤝 It's a tie!"}
            </Text>
          ) : null}
          {state.phase === "lobby" ? (
            <Text color="yellow">
              {"  "}
              <Spinner type="dots" /> waiting for players ({state.players.length} joined)
            </Text>
          ) : null}
        </Box>
        {state.phase === "running" && remaining != null ? (
          <Text bold color={lowTime ? "redBright" : "whiteBright"}>
            ⏱ {formatDuration(remaining)}
          </Text>
        ) : (
          <Text dimColor>{winConditionLabel(state.config)}</Text>
        )}
      </Box>

      {/* Time progress bar (running) */}
      {state.phase === "running" && remaining != null ? (
        <Box marginTop={1}>
          <Text color={lowTime ? "redBright" : "greenBright"}>{bar(elapsedRatio, 60)}</Text>
        </Box>
      ) : null}

      {/* Problems */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="whiteBright" underline>
          Problems
        </Text>
        {state.config.problems.map((problem, index) => {
          const lock = state.locks.find((entry) => entry.slug === problem.slug);
          const status = problemStatusText(
            state.config.mode,
            lock,
            session.playerId,
            state.players.length,
          );
          const sniped = showSnipeBadge(state.config.mode, lock ?? { slug: problem.slug, solves: [] }, now);

          return (
            <Box key={problem.slug}>
              <Box width={3}>
                <Text dimColor>{index + 1}.</Text>
              </Box>
              <Box width={titleWidth + 2}>
                <Link
                  url={problem.url}
                  color={status.dimmed ? "gray" : "cyanBright"}
                  underline={!status.dimmed}
                >
                  {truncate(problem.title, titleWidth)}
                </Link>
              </Box>
              <Box width={9}>
                <Text color="yellowBright">{problem.points} pts</Text>
              </Box>
              <Box width={20}>
                <Text color={status.color} bold={status.bold}>
                  {status.text}
                </Text>
              </Box>
              {sniped ? (
                <Text backgroundColor="green" color="black" bold>
                  {" SNIPED "}
                </Text>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {/* Scoreboard */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="whiteBright" underline>
          Scoreboard
        </Text>
        {[...state.players]
          .sort((a, b) => b.score - a.score)
          .map((player: Player, rank) => {
            const isLeader = player.score === leaderScore && leaderScore > 0;
            const color = playerColor(state, player.id);
            const medal = MEDALS[rank] ?? "  ";
            return (
              <Box key={player.id}>
                <Box width={3}>
                  <Text>{leaderScore > 0 ? medal : "  "}</Text>
                </Box>
                <Box width={14}>
                  <Text color={color} bold={player.id === session.playerId}>
                    {player.name}
                    {player.id === session.playerId ? " (you)" : ""}
                  </Text>
                </Box>
                <Box width={18}>
                  <Text color={isLeader ? color : "gray"}>
                    {bar(player.score / targetScore, 16)}
                  </Text>
                </Box>
                <Box width={6}>
                  <Text bold color="whiteBright">
                    {player.score}
                  </Text>
                </Box>
                {!player.connected ? <Text dimColor> (offline)</Text> : null}
              </Box>
            );
          })}
      </Box>

      {/* Activity feed */}
      {activity.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="whiteBright" underline>
            Activity
          </Text>
          {activity.slice(0, 5).map((entry) => {
            const fresh = now - entry.solvedAt < 4000;
            const color = playerColor(state, entry.playerId);
            return (
              <Box key={entry.key}>
                <Box width={10}>
                  <Text dimColor>{clockTime(entry.solvedAt)}</Text>
                </Box>
                <Text>
                  <Text color={color} bold>
                    {entry.playerName}
                  </Text>
                  <Text dimColor> {verb} </Text>
                  <Text color="cyan">{entry.title}</Text>
                  <Text color="yellowBright"> (+{entry.points})</Text>
                  {fresh ? <Text color="greenBright" bold>{"  ⚡"}</Text> : null}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {/* Notice */}
      {notice ? (
        <Box marginTop={1}>
          <Text color="yellowBright">➤ {notice}</Text>
        </Box>
      ) : null}

      {/* Lobby: userscript setup */}
      {state.phase === "lobby" ? (
        <Box
          marginTop={1}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color="whiteBright">
            Userscript setup
          </Text>
          <Text>
            Host URL: <Text color="cyanBright">{hostUrl.replace(/\/$/, "")}</Text>
          </Text>
          <Text>
            Your token: <Text color="cyanBright">{session.token}</Text>
          </Text>
          <Text dimColor>Tampermonkey → Configure duelcs → paste both, then Test connection.</Text>
        </Box>
      ) : null}

      {/* Footer keybindings */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{buildFooter(state, isHost)}</Text>
      </Box>
    </Box>
  );
}

function buildFooter(state: MatchState, isHost: boolean): string {
  const keys: string[] = [];
  if (state.phase === "lobby" && isHost) {
    keys.push("[s] start");
  }
  if (state.phase === "running") {
    keys.push("[1-9] claim");
  }
  keys.push("[click title] open problem");
  keys.push("[q] quit");
  return keys.join("    ");
}
