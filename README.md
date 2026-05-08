# Live English Transcriber

Privacy-first browser extension MVP that captures audio from the active tab, transcribes it, translates or normalizes it into English, and displays live subtitles plus a transcript history.

## Current MVP Scope

- Chromium browsers first: Chrome, Brave, Edge, Opera.
- Uses `chrome.tabCapture` to capture active-tab audio after a user click.
- Uses an offscreen document for media APIs that a Manifest V3 service worker cannot run directly.
- Provides a local-first transcription engine interface. The MVP includes a Web Speech fallback and a Transformers.js engine scaffold for Whisper.
- Shows a floating subtitle overlay on webpages.

## Commands

```bash
npm install
npm run build
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Architecture

- `src/background`: MV3 service worker orchestration.
- `src/offscreen`: tab-audio capture and chunk processing.
- `src/content`: subtitle overlay injected into pages.
- `src/popup`: React popup UI.
- `src/shared`: typed messages, settings, and transcript models.
- `src/transcription`: pluggable transcription engines.

## Free-Tier Strategy

The long-term free path is local inference with small Whisper models through Transformers.js/WebGPU. Cloud APIs can be added later behind an optional user-provided key, but they are intentionally not required for the MVP.
