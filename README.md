# xevol

**Transcribe, analyze, and explore YouTube content from your terminal.**

[![npm version](https://img.shields.io/npm/v/xevol)](https://www.npmjs.com/package/xevol)
[![License](https://img.shields.io/badge/license-proprietary-blue)](https://xevol.com)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Paste a YouTube URL, get AI-powered transcription and analysis — no API keys, no local GPU, no tool chaining.

## Quick Demo

```bash
$ xevol add https://youtube.com/watch?v=oOylEw3tPQ8 --wait --analyze facts

⠋ Processing... (12s)
✔ "Cursor CEO: Going Beyond Code" (37:29)

─── facts ───
• Cursor reached $100M ARR in 20 months
• 40-50% of code in Cursor is AI-generated
• Team hired first 10 employees over 6 months deliberately
• Pivoted from AI-CAD to AI coding tools

✔ Done
```

## Installation

```bash
npm install -g xevol
```

Or run without installing:

```bash
npx xevol
```

Requires Node.js 18+.

## Quick Start

```bash
# 1. Authenticate
xevol login

# 2. Add a YouTube video
xevol add "https://youtube.com/watch?v=abc123" --wait

# 3. Analyze it
xevol analyze <id> --prompt facts

# 4. View the transcript
xevol view <id>
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate via device flow (opens browser) |
| `logout` | Clear stored credentials |
| `whoami` | Show current user, plan, and usage |
| `add` | Add a YouTube URL for transcription |
| `list` | List your transcriptions |
| `view` | View a transcription summary or full transcript |
| `analyze` | Generate AI analysis using a prompt |
| `prompts` | List available analysis prompts |
| `stream` | Stream analysis output via SSE |
| `resume` | Resume a previous streaming session |
| `config` | View or edit CLI configuration |

All commands support `--json` for machine-readable output.

## Command Details

### `xevol login`

Authenticate using the device code flow — opens your browser, you confirm, done.

```bash
# Interactive device flow
xevol login

# Token-based (CI / headless)
xevol login --token <token>

# Or set via environment variable
export XEVOL_TOKEN=<token>
```

### `xevol add`

Add a YouTube video for transcription.

```bash
# Submit and return immediately
xevol add "https://youtube.com/watch?v=abc123"

# Wait for transcription to complete
xevol add "https://youtube.com/watch?v=abc123" --wait

# Specify language
xevol add "https://youtube.com/watch?v=abc123" --lang de --wait

# Transcribe and analyze in one step
xevol add "https://youtube.com/watch?v=abc123" --wait --analyze facts

# Analyze with multiple prompts
xevol add "https://youtube.com/watch?v=abc123" --wait --analyze facts,advice

# Stream analysis output in real time
xevol add "https://youtube.com/watch?v=abc123" --wait --analyze facts --stream
```

| Flag | Description |
|------|-------------|
| `--wait` | Wait for transcription to finish |
| `--no-wait` | Return immediately (default) |
| `--lang <code>` | Language code (e.g. `en`, `de`, `ja`) |
| `--analyze <prompts>` | Comma-separated prompt IDs to run after transcription |
| `--stream` | Stream analysis output via SSE |
| `--json` | JSON output |

### `xevol list`

List your transcriptions.

```bash
# Default table view
xevol list

# Pagination
xevol list --page 2 --limit 50

# Filter by status
xevol list --status completed

# Machine-readable formats
xevol list --json
xevol list --csv
```

| Flag | Description |
|------|-------------|
| `--page <n>` | Page number |
| `--limit <n>` | Results per page |
| `--status <s>` | Filter by status |
| `--json` | JSON output |
| `--csv` | CSV output |

### `xevol view`

View a transcription's summary or full transcript.

```bash
# Summary view
xevol view abc123def45

# Full transcript (pipe-friendly)
xevol view abc123def45 --raw

# Clean transcript (processed content)
xevol view abc123def45 --clean

# JSON output
xevol view abc123def45 --json
```

| Flag | Description |
|------|-------------|
| `--raw` | Print the full transcript text |
| `--clean` | Use cleaned/processed content |
| `--json` | JSON output |

### `xevol analyze`

Generate AI-powered analysis of a transcription.

```bash
# Analyze with a specific prompt
xevol analyze abc123def45 --prompt facts

# Use a different language for output
xevol analyze abc123def45 --prompt facts --lang de

# JSON output
xevol analyze abc123def45 --prompt facts --json
```

| Flag | Description |
|------|-------------|
| `--prompt <id>` | Prompt to use (default: `review`) |
| `--lang <code>` | Output language |
| `--json` | JSON output |

Use `xevol prompts` to see all available prompts.

### `xevol prompts`

List available analysis prompts.

```bash
xevol prompts
xevol prompts --json
xevol prompts --csv
```

### `xevol stream`

Stream analysis output in real time via SSE.

```bash
xevol stream <spike-id>
xevol stream <spike-id> --last-event-id <id>
```

### `xevol resume`

Resume a previously interrupted streaming session.

```bash
xevol resume <transcription-id>
```

### `xevol config`

View or edit CLI configuration.

```bash
# Show all config
xevol config

# Get a value
xevol config get apiUrl

# Set a value
xevol config set default.lang de
xevol config set default.limit 50
```

Available config keys:

| Key | Description |
|-----|-------------|
| `apiUrl` | Base API URL |
| `default.lang` | Default output language |
| `default.limit` | Default page size for `list` |
| `api.timeout` | API request timeout (ms) |

## Output Formats

### Table (default)

```
┌─────────────┬────────────────────────────────┬──────────┬──────────┐
│ ID          │ Title                          │ Duration │ Status   │
├─────────────┼────────────────────────────────┼──────────┼──────────┤
│ abc123def45 │ Cursor CEO: Going Beyond Code  │ 37:29    │ ✔ done   │
│ xyz789ghi01 │ Naval on Happiness             │ 12:03    │ ⠋ proc…  │
└─────────────┴────────────────────────────────┴──────────┴──────────┘
```

### JSON (`--json`)

```bash
xevol list --json | jq '.list[] | select(.channelTitle == "Y Combinator")'
xevol analyze abc123 --prompt facts --json | jq '.spikes[0].content'
```

### CSV (`--csv`)

```bash
xevol list --csv > transcriptions.csv
xevol prompts --csv
```

## Streaming

Analysis output streams in real time via Server-Sent Events (SSE). Use `--stream` with `add` to watch analysis as it's generated:

```bash
xevol add "https://youtube.com/watch?v=..." --wait --analyze facts --stream
```

If a stream is interrupted, resume it:

```bash
xevol resume <transcription-id>
```

## Authentication

xevol uses a device authorization flow, similar to `gh auth login`:

1. Run `xevol login`
2. A code is displayed and your browser opens
3. Enter the code to authorize
4. The CLI stores your token locally at `~/.xevol/`

For CI/CD or headless environments, use token-based auth:

```bash
xevol login --token <token>
# or
export XEVOL_TOKEN=<token>
```

Check your auth status:

```bash
xevol whoami
```

## Piping & Scripting

```bash
# Pipe transcript to other tools
xevol view <id> --raw | wc -w

# JSON output for scripting
xevol list --json | jq '.list | length'

# Export to CSV
xevol list --csv > my-transcriptions.csv
```

## Global Options

| Flag | Description |
|------|-------------|
| `--token <token>` | Override auth token for a single command |
| `--no-color` | Disable colored output |
| `--json` | Machine-readable JSON output |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

## Links

- **Website**: [xevol.com](https://xevol.com)
- **Issues**: [github.com/xevol/xevol-cli/issues](https://github.com/xevol/xevol-cli/issues)

## License

Proprietary — see [xevol.com](https://xevol.com) for terms.
