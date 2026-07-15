# duelcs

**Friend-hosted LeetCode lockout duels.**

You and a friend pick a set of LeetCode problems. You both solve them on leetcode.com like normal. The first person to get **Accepted** on a problem locks it and takes the points — the other person gets nothing for that problem. First to the target score wins (or highest score when time runs out).

There is no duelcs website, no accounts, and no cloud server you depend on. One friend runs a small program on their laptop. Everyone else connects over **Tailscale**. A **browser userscript** tells the host when you get an Accepted submission on LeetCode.

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
duration_minutes: 45
win_score: 800
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
# seed: 42   # optional — same picks every time
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
  --problems two-sum 3sum longest-substring-without-repeating-characters \
  --duration 45 \
  --win-score 800 \
  --name Kiwi
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

## Lockout rules (default)

- Problems have point values (100 / 200 / 300 / … by default).
- **First Accepted solve locks the problem** — only that player gets the points.
- First player to reach **800 points** wins early.
- If time runs out, highest score wins. Ties are possible.

---

## Troubleshooting

**"Could not connect to the host"**

- Is the host still running `duelcs host`?
- Are you using the host's **Tailscale IP**, not `127.0.0.1`? (127.0.0.1 only works on the host machine itself.)
- Are both machines on the same Tailscale network and connected?

**Userscript does not report solves**

- Open Tampermonkey → Configure duelcs — are host URL and token correct?
- Check the browser console for `[duelcs]` messages.
- Use manual claim (press 1–9) as a fallback.

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

duelcs does one job: **coordinate a lockout match between friends.** LeetCode is the IDE and judge. Tailscale is the network. Your laptop is the server.

---

## License

MIT
