# xevol

CLI for XEVol — transcribe, analyze, and explore YouTube content from your terminal.

Learn more at https://xevol.com

## Install

```bash
npm i -g xevol
```

Or run without installing:

```bash
npx xevol
```

## Authenticate

```bash
xevol login
```

For CI or headless environments:

```bash
xevol login --token <token>
```

## Commands

All commands support `--json` for machine-readable output.

### List transcriptions

```bash
xevol list
xevol list --page 2 --limit 50
xevol list --json
```

### Add a YouTube URL

```bash
xevol add "https://youtube.com/watch?v=abc123"
xevol add "https://youtube.com/watch?v=abc123" --lang de
xevol add "https://youtube.com/watch?v=abc123" --wait
```

### View a transcript

```bash
xevol view abc123def45
xevol view abc123def45 --raw
xevol view abc123def45 --json
```

### Show spikes

```bash
xevol spikes abc123def45
xevol spikes abc123def45 --json
```

## License

Proprietary
