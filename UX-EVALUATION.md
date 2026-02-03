# xevol CLI — UX/DX Evaluation

**Evaluator perspective**: CLI power user and developer advocate, first-time encounter.  
**Date**: 2026-02-02  
**Version evaluated**: 0.1.0

---

## A. Command Naming & Discoverability

### What works
- **`add`**, **`list`**, **`view`**, **`login`**, **`logout`**, **`whoami`** — all instantly understandable. Good verb choices.
- The top-level `--help` gives a clean, scannable command list. No clutter.
- `--json` on every command is great for scripting. `--csv` on `list` and `prompts` is a nice touch.
- Device code auth flow (`login`) is genuinely well-implemented — opens browser, polls, stores token. This is `gh auth login` level polish.

### What's confusing

- **`spikes`** — the command name tells me nothing. First time seeing it, I'd think it's a debugging/metrics thing (latency spikes? traffic spikes?). It's actually the most powerful feature. This is a discoverability killer.
- **`stream`** requires a `spikeId` — but where do I get a spike ID? It's not shown in `spikes` output. The `stream` command feels like an internal plumbing command exposed to users.
- **`resume`** — resume what? The help says "Resume a previous streaming session" but there's no `sessions` or `jobs` command to see what's resumable. It's a dead end unless you already know.
- **`prompts`** — the table shows ID and Name columns, but they're identical for every row. No descriptions. 51 prompts with names like `create_hormozi_offer` and `extract_extraordinary_claim` — a new user has zero idea what these do.

### Missing commands users would expect
- **`search`** — with 858 transcriptions, I need to search by title, channel, or date range. Pagination alone won't cut it.
- **`delete`** — can I remove a transcription?
- **`export`** — give me the transcript as .txt, .srt, .md
- **`open`** — open the YouTube URL or the web dashboard for a transcription
- **`status`** — check processing status of a pending transcription
- **`config`** — show/edit configuration (API URL, default language, etc.)

### Help text issues
- `spikes --generate` exists as a flag but the command already generates by default (POST is idempotent). What does this flag actually do? Looking at the code... it's never checked. Dead flag.
- `add --spikes` says "requires --wait" but doesn't enforce it or error if you forget `--wait`.
- No examples in any help text. Every great CLI shows examples: `gh pr create`, `stripe listen`, `vercel deploy` all have them.

---

## B. Workflow Analysis

### User Journey: New User (0→1)

```
1. npm install -g xevol        ← not published yet (private: false but 0.1.0)
2. xevol login                  ← great! device flow opens browser
3. xevol add <url>              ← submits, returns ID... then what?
4. ???                          ← user has no idea about --wait, --spikes
5. xevol list                   ← ah, there it is
6. xevol view <id>              ← sees summary, "use --raw for full transcript"
7. xevol spikes <id>            ← gets a "review" spike. Didn't ask for review.
8. xevol prompts                ← 51 options, no descriptions, overwhelmed
```

**Friction points:**
- Step 3→4 is a cliff. `add` without `--wait` just prints an ID. The user has no guidance on what to do next. They don't know the video takes time to process.
- Step 7 silently defaults to `--prompt review`. The user didn't choose this. Surprising behavior.
- Step 8 is information overload. 51 prompts with no categorization or descriptions.

**Time to "aha moment"**: ~5 minutes if you stumble onto `spikes` with a good prompt. But the default `review` output is a conference submission evaluation format — confusing for someone who just transcribed a YouTube video. The `facts` output is genuinely impressive. That's the aha moment, but it's not the default path.

### User Journey: Returning User

```
xevol list --limit 10
xevol add <url> --wait --spikes facts,advice
xevol view <id>
```

This flow is solid once you know the flags. But you have to memorize: `--wait --spikes facts` is 3 things to remember every time.

### User Journey: Power User / Scripting

```
xevol add <url> --wait --spikes facts --json | jq '.spikes[0].content'
xevol list --json | jq '.list[] | select(.channelTitle == "Y Combinator")'
```

The `--json` flag makes this possible, which is great. But there's no way to:
- Pipe a URL list (`cat urls.txt | xevol add --each`)
- Get transcript to stdout for piping (`xevol view <id> --raw | fabric --pattern summarize`)
- Watch for completion events

### The ideal happy path (doesn't exist yet)

```
xevol add https://youtube.com/watch?v=... --analyze facts
# ⠋ Downloading... ✔ "Video Title" (12:34)
# ⠋ Transcribing... ✔ Complete
# ⠋ Analyzing...
# 
# === Key Facts ===
# 1. Cursor reached $100M ARR in 20 months...
# 2. ...
#
# ✔ Done. View: xevol view abc123
```

One command. Zero flags to memorize. Streaming output. Actionable next step.

---

## C. Information Architecture

### Output format analysis

| Command | Format | Verdict |
|---------|--------|---------|
| `list` | Table | ✅ Perfect. Clean, scannable. |
| `view` | Header + summary + hint | ✅ Good. The "use --raw" hint is helpful. |
| `view --raw` | Full transcript to stdout | ✅ Great for piping. |
| `spikes` | Markdown blob to stdout | ⚠️ Wall of text. No structure. The default "review" spike dumps a conference review format. |
| `prompts` | Table (ID, Name) | ❌ Useless. ID == Name for every row. No descriptions. |
| `whoami` | Single line | ✅ Perfect. |
| `stream` | Streaming text | ✅ Cool when it works. |

### What's missing
- **`view` should show spike status** — "2 spikes generated: review, facts" — so I know what analysis exists.
- **`list` needs more filtering** — at minimum `--channel`, `--status`, `--search`.
- **`prompts` needs categories and descriptions** — group by type (analysis, creation, extraction, educational) and show a one-liner for each.
- **Colored/formatted markdown output** — the `spikes` output is raw markdown. Tools like `glow` or `bat` render this beautifully. Consider basic terminal markdown rendering.

### Error messages
- Auth errors are good: "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN." — actionable.
- API errors surface the server message, which is fine.
- No help for "invalid YouTube URL" or "video already transcribed" — would these be handled?

---

## D. Competitive Analysis

### vs. yt-dlp
yt-dlp downloads video/audio/subtitles. xevol transcribes and *analyzes*. Different layer entirely. But yt-dlp's composability is the gold standard: everything goes to stdout, everything is pipeable, options are exhaustive. xevol should aim for that composability.

### vs. fabric (by Daniel Miessler)
This is the closest competitor. `fabric` pipes text through AI prompts:
```
yt-dlp --get-url <video> | fabric --pattern extract_wisdom
```
fabric's pattern system is xevol's prompt system. The difference: fabric is local-first (runs against local LLMs or OpenAI API key), xevol is a hosted service. xevol's advantage is the integrated transcription pipeline — no need to chain yt-dlp → whisper → fabric.

**xevol's unique value prop**: One command to go from YouTube URL → transcription → AI analysis. No local GPU, no API keys to manage, no tool chaining. The "turnkey YouTube intelligence" positioning.

### Patterns to steal from great CLIs

| CLI | Pattern | Apply to xevol |
|-----|---------|----------------|
| `gh` | Interactive mode (`gh pr create` asks questions) | `xevol add` should interactively ask for prompts |
| `gh` | `--web` flag opens browser | `xevol view --web` to open dashboard |
| `stripe` | Examples in every help text | Add examples to every command |
| `vercel` | Zero-config defaults | `xevol add <url>` should just work with sensible defaults |
| `railway` | Linked project context | Remember last-used transcription ID for quick `xevol spikes` |
| `fzf` | Fuzzy selection | `xevol spikes <id>` with interactive prompt picker |
| `jq` | Composable filters | `xevol list --filter 'channel=YC'` |

---

## E. Naming & Branding

### "xevol"
- **Pronunciation**: Is it "zeh-vol"? "ex-eh-vol"? "ecks-vol"? Nobody will know.
- **Typing**: 5 chars, no awkward key combos. Fine ergonomically.
- **Memorability**: Low. It's a made-up word with no semantic hook. Compare: `gh` (GitHub), `stripe` (Stripe), `yt-dlp` (YouTube download). You can't guess what `xevol` does from the name.
- **Searchability**: Googling "xevol" returns nothing useful. This is actually good for SEO — zero competition — but bad for word-of-mouth ("what was that tool called again?").
- **Verdict**: Fine as a brand name for the company/platform. For the CLI binary, consider an alias: `xv` (2 chars, fast to type, still unique).

### "spikes"
- **The problem**: "Spike" in software means a time-boxed investigation/prototype (Agile), a traffic spike, or a monitoring anomaly. None of these map to "AI analysis of a transcription."
- **What it actually is**: An AI-generated analysis using a specific prompt. It's an *insight*, an *extract*, a *lens*, an *analysis*.
- **Suggested alternatives**:
  - `analyze` / `analysis` — most descriptive
  - `extract` — "extract facts from this video"
  - `insights` — slightly marketing-speak but clear
  - `lens` — "view this through the 'facts' lens" (creative but might confuse)
- **Recommendation**: Rename to `analyze`. Command becomes `xevol analyze <id> --prompt facts`. Verb, not noun. Action, not artifact.

### "prompts"
- Fine as an internal concept. But users think in terms of *what they want to get*, not *what prompt to use*.
- Consider: `xevol analyze <id> --as facts` or `xevol analyze <id> facts`

---

## F. Radical Rethink

### If I redesigned this from scratch

**Core insight**: xevol is trying to be two things — a transcription service CLI and an AI analysis tool. Lean into the analysis. Transcription is the plumbing; analysis is the product.

### The ideal CLI

```bash
# The 30-second demo
$ xevol https://youtube.com/watch?v=oOylEw3tPQ8

⠋ Transcribing "Cursor CEO: Going Beyond Code..."
✔ Transcribed (37:29)

Key Facts:
• Cursor reached $100M ARR in 20 months
• 40-50% of code in Cursor is AI-generated
• Team hired first 10 employees over 6 months deliberately
• Early training involved 10B+ parameter models
• Pivoted from AI-CAD to AI coding tools

Memorable Quotes:
• "Building a company's hard, so you may as well work on the thing you're really excited about"
• "One thing that will be irreplaceable is taste"

→ Full transcript: xevol view oOylEw3tPQ8
→ Deep analysis: xevol analyze oOylEw3tPQ8 --as review
→ All prompts: xevol prompts
```

**Key design principles:**
1. **URL as the primary input** — `xevol <url>` should just work. No `add` subcommand needed for the simple case.
2. **Smart defaults** — show `facts` + `quotes` by default, not a conference review.
3. **Progressive disclosure** — simple output first, suggest deeper commands.
4. **Pipe-friendly** — `xevol view <id> --raw | wc -w` should work (it does! good).

### Composability & integrations

```bash
# Pipe to other tools
xevol view <id> --raw | fabric --pattern summarize
xevol analyze <id> --as facts --json | jq '.facts[]'

# Batch processing
cat urls.txt | xevol add --batch --wait

# Watch a channel
xevol watch "Y Combinator" --auto-analyze facts

# Compare analyses
xevol diff <id1> <id2> --prompt facts

# Export
xevol export <id> --format srt
xevol export <id> --format notion
xevol export <id> --format obsidian
```

### Features that would make this a must-have

1. **Playlist/channel import** — `xevol add --playlist <url>` → transcribe all videos
2. **Semantic search across transcripts** — `xevol search "product market fit"` → finds all mentions across all your transcriptions
3. **Cross-video analysis** — "What does Naval say about happiness across these 5 videos?"
4. **Webhook/automation** — `xevol add <url> --webhook https://...` → POST results when done
5. **Local transcript cache** — `xevol sync` downloads all your transcripts for offline grep/search
6. **Obsidian/Notion integration** — `xevol export <id> --to obsidian` creates a linked note

---

## G. Concrete Recommendations

### Priority-ordered list

| # | Change | Effort | Impact | Notes |
|---|--------|--------|--------|-------|
| 1 | Add examples to every `--help` text | S | High | `Examples:\n  xevol add https://youtube.com/... --wait\n  xevol add <url> --wait --spikes facts,advice` |
| 2 | Add descriptions to `prompts` output | S | High | Even a one-line description per prompt transforms usability |
| 3 | Make `add` default to `--wait` behavior | S | High | Fire-and-forget is the minority use case. Make waiting the default, add `--no-wait` or `--background` for async. |
| 4 | Rename `spikes` → `analyze` | S | High | One find-replace. Massive clarity improvement. |
| 5 | Default prompt should be `facts` not `review` | S | High | `review` outputs a conference submission evaluation — bizarre default. `facts` is universally useful. |
| 6 | Add `--search` / `--query` to `list` | M | High | `xevol list --search "startup"` — essential at 800+ transcriptions |
| 7 | Make bare `xevol <url>` work as shortcut for `add --wait` | M | High | Lowest friction path to value |
| 8 | Show "next steps" after every command | S | Med | After `add`: "View: xevol view <id> · Analyze: xevol analyze <id>" |
| 9 | Add `xv` alias in package.json bin | S | Med | `"bin": { "xevol": "...", "xv": "..." }` — power users will love it |
| 10 | Group prompts by category | M | Med | Analysis, Creation, Extraction, Educational, Religious, etc. |
| 11 | Remove dead `--generate` flag from `spikes` | S | Low | Code cleanup — flag is never checked |
| 12 | Add `--web` flag to `view` | S | Med | Opens YouTube URL or dashboard in browser |
| 13 | Interactive prompt picker with @inquirer (already a dep!) | M | High | `xevol analyze <id>` with no `--prompt` → fuzzy-searchable list |
| 14 | Basic markdown rendering in terminal | M | Med | Bold, headers, lists. No need for full renderer — just basics. |
| 15 | `export` command (txt, srt, md) | M | Med | Common ask for transcription tools |
| 16 | Semantic search across transcriptions | L | High | "Find all videos where someone talks about scaling laws" — killer feature |
| 17 | Playlist/channel batch import | L | High | `xevol add --playlist <url>` — transforms from single-video to library tool |
| 18 | Local transcript cache + offline search | L | Med | `xevol sync && grep "product market fit" ~/.xevol/transcripts/*` |

### The "just ship these 5 things" list

If I could only ship 5 changes before a public launch:

1. **Rename `spikes` → `analyze`** — instant clarity
2. **Default to `--wait` in `add`** — no more fire-and-forget confusion  
3. **Add examples to help text** — self-documenting
4. **Descriptions in `prompts`** — users need to know what they're choosing
5. **Show next steps after every command** — guide the user forward

These 5 changes, all Small effort, would transform the first-user experience from "what is this?" to "oh, this is powerful."

---

## Summary

xevol has solid engineering foundations — the auth flow, SSE streaming, job resume, JSON/CSV output modes, and the API abstraction layer are all well-built. The *infrastructure* is good.

The *product surface* needs work. The naming (`spikes`), the defaults (review prompt, no-wait), the discoverability (51 undescribed prompts), and the guidance (no examples, no next steps) all create unnecessary friction between the user and the genuine value underneath.

The core value proposition — "paste a YouTube URL, get AI-powered insights" — is compelling. The 30-second demo writes itself. But right now, the CLI makes you work too hard to get there. Fix the five things above and you have a genuinely useful tool that people will share.

**Rating: 6/10 as-is → 8.5/10 with the quick wins above.**
