# Demo Video Workflow

This workflow records a reusable frontend reel for live presentations.

## Goal

Generate a short browser video that follows the jury-friendly demo sequence:

1. Landing page
2. Network view
3. Simulation view
4. Report view

This is designed to be rerun after frontend design changes without editing the recording logic each time.

## Script Location

- `apps/web/scripts/record-demo-video.mjs`

## Prerequisites

- Frontend available locally, default `http://127.0.0.1:3000`
- A valid demo session id for populated routes
- Playwright Chromium installed once via `pnpm --filter @halkantir/web demo:setup`

## Run

From the repository root:

```bash
DEMO_SESSION_ID=<session-id> pnpm --filter @halkantir/web demo:record
```

The recording is written by default to:

```text
apps/web/demo-output/halkantir-demo.webm
```

## Useful Environment Variables

- `DEMO_BASE_URL` — frontend URL, default `http://127.0.0.1:3000`
- `DEMO_SESSION_ID` — required for network, simulation, and report scenes
- `DEMO_OUTPUT_DIR` — output directory relative to `apps/web`
- `DEMO_OUTPUT_NAME` — output filename without extension
- `DEMO_OUTPUT_FORMAT` — `webm` by default, or `mp4` if `ffmpeg` is installed
- `DEMO_VIEWPORT_WIDTH` — default `1600`
- `DEMO_VIEWPORT_HEIGHT` — default `900`

Example:

```bash
DEMO_SESSION_ID=demo-123 \
DEMO_OUTPUT_FORMAT=mp4 \
DEMO_OUTPUT_NAME=jury-demo \
pnpm --filter @halkantir/web demo:record
```

## Notes

- If `DEMO_SESSION_ID` is not set, the script records the landing page only.
- The script uses direct route navigation instead of brittle UI selectors so it remains stable while the design evolves.
- If you want a more cinematic demo later, extend the scene actions in `record-demo-video.mjs` with route-specific clicks or pauses.
