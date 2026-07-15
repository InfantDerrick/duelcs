import React, { useEffect, useState } from "react";
import { render } from "ink";
import { connectToHost, type JoinSession } from "../client.js";
import { DuelView } from "./DuelView.js";
import type { MatchState } from "../types.js";

interface SessionAppProps {
  hostUrl: string;
  name: string;
  isHost: boolean;
}

function SessionApp({ hostUrl, name, isHost }: SessionAppProps) {
  const [session, setSession] = useState<JoinSession | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>();

  useEffect(() => {
    const joined = connectToHost(hostUrl, name, {
      onWelcome: (nextSession, initialState) => {
        setSession(nextSession);
        setState(initialState);
      },
      onState: (nextState) => {
        setState(nextState);
        if (nextState.phase === "running") {
          setStatusMessage(undefined);
        }
      },
      onError: (message) => {
        // Force a refresh even if the same error is repeated.
        setStatusMessage(`${message} (${new Date().toLocaleTimeString()})`);
      },
    });

    return () => joined.close();
  }, [hostUrl, name]);

  if (!session || !state) {
    return null;
  }

  return (
    <DuelView
      hostUrl={hostUrl}
      session={session}
      state={state}
      isHost={isHost}
      statusMessage={statusMessage}
    />
  );
}

export function runSession(hostUrl: string, name: string, isHost: boolean): void {
  render(<SessionApp hostUrl={hostUrl} name={name} isHost={isHost} />);
}
