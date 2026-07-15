# duelcs

**Friend-hosted LeetCode duels.**

You and friends pick LeetCode problems, solve them in the browser, and duelcs keeps score live. One person hosts on their laptop; everyone connects over **Tailscale**. A **browser userscript** reports Accepted submissions.

**Game modes:** lockout (snipe problems), cumulative (timed free-for-all), speed (diminishing points).

---

## What you need

- **Node.js 18+** and **Yarn**
- **Tailscale** on every player's machine ([tailscale.com](https://tailscale.com)) — free for personal use
- **Tampermonkey** in your browser ([tampermonkey.net](https://www.tampermonkey.net))
- LeetCode accounts (you solve problems there, not inside duelcs)

---

## How it works (the short version)

1. **Host** starts `duelcs host` with a list of problems.
2. **Players** run `duelcs join` pointing at the host's Tailscale IP.
3. Everyone installs the **userscript** and pastes in their personal **player token** (shown in the terminal).
4. Host presses **s** to start when everyone's in.
5. Open LeetCode, solve problems, submit. When LeetCode says **Accepted**, the userscript notifies the host.
6. The terminal scoreboard updates live. First to lock enough points wins.

---

## How it works (what's actually going on)

Think of duelcs as a **scoreboard + referee** sitting on the host's computer — not a coding platform.

| Piece | What it does |
|-------|----------------|
| **Host program** | Keeps the list of problems, who joined, who locked what, and the timer. Runs a tiny HTTP + WebSocket server on one port (default `3737`). |
| **Join program** | Connects your terminal to the host so you see the live scoreboard. |
| **Userscript** | Lives in your browser on leetcode.com. When you get Accepted, it sends a small message to the host: "I solved `two-sum`." |
| **Tailscale** | Gives each friend a stable private IP (like `100.64.0.2`) so your laptops can talk directly, even behind home routers. No port forwarding, no public server. |

**You still write and submit code on LeetCode.** duelcs does not run your code, check syntax, or host problems. That is intentional — LeetCode already does all of that well.

**Trust model:** This is for friends. The userscript reports your solves honestly; someone could fake a report if they really wanted to. That is fine for casual lockout games.

---

## Install

Clone this repo (or install from npm once published):

```bash
git clone <your-repo-url> duelcs
cd duelcs
yarn install
```

---

## One-time setup

### 1. Tailscale

Install Tailscale on every machine that will host or join a duel. Log into the same tailnet (friend group).

To find your Tailscale IP on Linux/macOS:

```bash
tailscale ip -4
```

Example output: `100.64.0.2` — that is the address friends use to reach you.

### 2. Tampermonkey userscript

1. Install Tampermonkey in your browser.
2. Create a new script and paste the contents of [`userscript/duelcs.user.js`](userscript/duelcs.user.js).
3. Save it.

You will configure it per-duel (host URL + token) from the Tampermonkey menu: **Configure duelcs**.

---

## Running a duel

### Host with settings.yaml (recommended)

Copy the example and tweak it:

```bash
cp settings.example.yaml settings.yaml
```

Example settings:

```yaml
# lockout | cumulative | speed
mode: lockout

duration_minutes: 45
win_score: 800          # omit or null for timer-only (cumulative/speed)
problem_count: 5

difficulty:
  - Easy
  - Medium

topics:
  - array
  - hash-table
  - two-pointers
  - string

exclude_premium: true
# seed: 42
```

Then host:

```bash
yarn duelcs host --config settings.yaml --name Kiwi
```

What happens:

1. duelcs asks LeetCode for problems matching your difficulty + topics
2. Skips premium problems by default
3. Randomly picks `problem_count` of them
4. Prints the chosen set, then starts the host

Topic names use LeetCode’s slugs (lowercase with hyphens), e.g. `dynamic-programming`, `linked-list`, `binary-search`.

You can also put an explicit problem list in the YAML (`problems:`) to skip random selection.

### Host with explicit problems

```bash
yarn duelcs host \
  --mode lockout \
  --problems two-sum 3sum longest-substring-without-repeating-characters \
  --duration 45 \
  --win-score 800 \
  --name Kiwi
```

Cumulative timed (no early win — timer decides):

```bash
yarn duelcs host --config settings.test-cumulative.yaml --name Kiwi
```

LeetCode URLs work too:

```bash
yarn duelcs host --problems \
  https://leetcode.com/problems/two-sum/ \
  https://leetcode.com/problems/3sum/
```

Optional custom points (default is 100, 200, 300, …):

```bash
yarn duelcs host --problems two-sum 3sum --points 100,300
```

The host prints a local URL and instructions. Tell friends your **Tailscale IP** and port:

```text
http://100.64.0.2:3737
```

Wait until everyone has joined, then press **s** in the host terminal to start.

### Join

Each other player:

```bash
yarn duelcs join http://100.64.0.2:3737 --name Alex
```

Replace the IP with the host's Tailscale address.

### Configure the userscript

After joining, your terminal shows:

- **Host URL** — e.g. `http://100.64.0.2:3737`
- **Player token** — a long hex string unique to you this match

In Tampermonkey: click the extension icon → **duelcs — LeetCode lockout reporter** → **Configure duelcs**. Paste both values.

Now open the LeetCode problems in your browser and solve them normally. Accepted submissions are reported automatically.

### Manual claim (backup)

If the userscript misses a solve, press **1–9** in your terminal to claim problem #1, #2, etc.

Press **q** to leave.

---

## Game modes

Set `mode` in your settings file or pass `--mode` on the CLI.

### Lockout (default)

Classic Codeforces-style lockout.

- **First Accepted solve locks the problem** — only that player gets the points.
- Others get nothing for that problem.
- First to `win_score` wins early, or highest score when time runs out.

```yaml
mode: lockout
win_score: 800
```

Test config: `settings.test.yaml`

### Cumulative (timed)

Relaxed timed race — good for practice sessions.

- **Everyone can score on every problem once.**
- No sniping — your solves always count for you.
- Highest total when the timer hits zero wins.
- Set `win_score: null` (or omit) for timer-only; optionally add `win_score` for early win.

```yaml
mode: cumulative
duration_minutes: 45
win_score: null
```

Test config: `settings.test-cumulative.yaml`

### Speed

Timed race with diminishing returns — rewards being fast without full lockout.

- Multiple players can score on the same problem.
- **1st solver:** 100% of points  
- **2nd solver:** 50%  
- **3rd+ solver:** 25%
- Each player can only score once per problem.

```yaml
mode: speed
win_score: 500
```

Test config: `settings.test-speed.yaml`

---

## Troubleshooting

**"Could not connect to the host"**

- Is the host still running `duelcs host`?
- Are you using the host's **Tailscale IP**, not `127.0.0.1`? (127.0.0.1 only works on the host machine itself.)
- Are both machines on the same Tailscale network and connected?

**Userscript does not report solves**

1. Reinstall / paste the latest `userscript/duelcs.user.js` (v0.2.0+) into Tampermonkey and reload the LeetCode tab.
2. Open DevTools → Console. You should see `[duelcs] Userscript loaded…`
3. Tampermonkey menu → **Test duelcs host connection**. It should say Host reachable.
4. Make sure the duel **phase is running** (press `s` after 2 players join). Reports while still in lobby are rejected.
5. Host URL tips:
   - Same machine as host: `http://127.0.0.1:3737`
   - Friend machine: `http://YOUR_TAILSCALE_IP:3737`
6. If auto-detect still fails: Tampermonkey menu → **Manually report current problem as Accepted**.
7. Watch the host terminal for `[duelcs] solve report:` / `solve rejected:` lines.

**LeetCode changed something and detection broke**

- LeetCode updates their site often. The userscript watches submission responses and the page for "Accepted". If that breaks, manual claim still works. File an issue or patch the userscript.

---

## Project layout

```text
duelcs/
├── src/           # CLI, host server, terminal UI
├── userscript/    # Tampermonkey script for LeetCode
└── README.md
```

---

## Why this shape?

Sites like BeatCode and CPDuels tried to be full platforms — auth, matchmaking, code execution, hosting. That is a lot to maintain for a side project.

duelcs does one job: **coordinate a LeetCode duel between friends.** LeetCode is the IDE and judge. Tailscale is the network. Your laptop is the server.

---

## License

MIT
