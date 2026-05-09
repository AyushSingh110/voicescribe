# Live English Transcriber

A privacy-first Chrome extension that captures audio from any browser tab, transcribes speech in real-time using on-device AI, and displays live floating subtitles directly on the webpage — no cloud APIs, no API keys, no cost.

---

## Features

- **Real-time transcription** — Captures and transcribes tab audio as you listen
- **On-device AI** — Uses Whisper (via Transformers.js + ONNX) running entirely in your browser
- **Live subtitle overlay** — Floating, draggable subtitle box injected into any webpage
- **Dual engine support** — Local Whisper or Web Speech API fallback
- **Multi-language source** — Auto-detect or specify Hindi, Spanish, French, German, Japanese, Korean, Chinese
- **Transcript history** — Last 500 segments stored locally in Chrome storage
- **Export transcript** — Save full transcript as a `.txt` file
- **Zero cost** — Fully local, no accounts, no subscriptions, no cloud dependencies

---

## Supported Browsers

| Browser | Supported |
| ------- | --------- |
| Chrome 116+ | Yes |
| Brave | Yes |
| Microsoft Edge | Yes |
| Opera | Yes |
| Firefox | No (uses Chrome-only `tabCapture` API) |

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| UI | React 19, TypeScript 5.7 |
| Build | Vite 6, ESLint 9 |
| AI / ML | @huggingface/transformers 3.8, Whisper-tiny (ONNX quantized) |
| Extension | Chrome Manifest V3, Service Worker, Offscreen Document |
| Storage | Chrome Storage API (local) |
| Audio | Web Audio API, tabCapture API |

---

## Project Structure

```text
src/
├── background/
│   └── service-worker.ts       # MV3 orchestration, message routing, state management
├── offscreen/
│   ├── offscreen.ts            # Media capture and audio chunk processing
│   └── offscreen.html          # Offscreen document (required for tab audio APIs in MV3)
├── content/
│   ├── content.ts              # Subtitle overlay injected into webpages
│   └── content.css             # Overlay styling
├── popup/
│   ├── main.tsx                # React popup UI
│   ├── index.html              # Popup HTML entry point
│   └── styles.css              # Popup styles
├── transcription/
│   ├── engine.ts               # TranscriptionEngine interface
│   ├── index.ts                # Engine factory
│   ├── localWhisperEngine.ts   # Whisper inference via Transformers.js
│   ├── webSpeechEngine.ts      # Web Speech API implementation
│   └── audio.ts                # Audio processing utilities (resampling, channel mixing)
└── shared/
    ├── types.ts                # Shared TypeScript interfaces
    ├── messages.ts             # Typed extension message definitions
    └── storage.ts              # Chrome storage wrapper
```

---

## How It Works

```text
Tab Audio
    │
    ▼
chrome.tabCapture (offscreen document)
    │
    ▼
Web Audio API → Mono conversion → 16kHz resampling
    │
    ▼
Transcription Engine (Whisper-tiny ONNX or Web Speech API)
    │
    ▼
Background Service Worker (state + message routing)
    │
    ├──► Content Script → Floating subtitle overlay on webpage
    │
    └──► Popup UI → Transcript history, settings, export
```

Audio is processed in 6-second chunks. Each chunk is converted to mono Float32Array, resampled to 16 kHz (Whisper's required sample rate), and passed to the active transcription engine. Results are broadcast to both the overlay and the popup.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- Google Chrome 116 or later (or a Chromium-based browser)

### Install & Build

```bash
# 1. Install dependencies
npm install

# 2. Build the extension
npm run build
```

The built extension is output to the `dist/` folder.

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Toggle **Developer mode** on (top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The extension icon will appear in your toolbar — pin it for easy access

### Using the Extension

1. Navigate to any tab with audio (YouTube, podcast, meeting, etc.)
2. Click the **Live English Transcriber** icon in the toolbar
3. Select your transcription engine and source language
4. Click **Start Capture**
5. On first use with Local Whisper, the model (~40 MB) downloads and caches automatically
6. Subtitles appear as a floating overlay on the page
7. View the full transcript in the popup, or click **Export** to save it as a `.txt` file

---

## Development

### Available Scripts

```bash
npm run build        # Type-check and build to dist/
npm run dev          # Start Vite dev server (for UI component development)
npm run typecheck    # Run TypeScript type checking only
npm run lint         # Run ESLint
npm run preview      # Preview the built output
```

### Development Workflow

Since this is a Chrome extension, the standard hot-reload dev server does not apply to the full extension. Use this workflow instead:

```bash
# Build and watch for changes
npm run build

# After editing any file, rebuild:
npm run build

# Then reload the extension in Chrome:
# chrome://extensions → click the refresh icon on "Live English Transcriber"
```

> Tip: For faster iteration, open a terminal and run `npm run build` after each change, then press the reload button on the extension card in `chrome://extensions`.

---

## Architecture Notes

**Why an offscreen document?**
Chrome Manifest V3 service workers cannot access media or audio APIs. An offscreen document runs as a hidden page that can use `tabCapture`, `MediaRecorder`, and `AudioContext` — it handles all audio capture and processing, then sends results to the service worker via messages.

**Why local inference?**
The long-term goal is zero-cost operation. Whisper models run fully in-browser via WebAssembly/WebGPU through Transformers.js, with no server round-trips. The `whisper-tiny` ONNX model is 39MB and runs in real-time on most machines. Cloud APIs can be added later behind an optional user-provided key but are intentionally not required.

**Engine abstraction**
The `TranscriptionEngine` interface in `src/transcription/engine.ts` makes it trivial to add new backends (e.g., whisper-base for better accuracy, or a cloud API). The factory in `index.ts` selects the engine based on user settings.

---

## Permissions Explained

| Permission | Why It's Needed |
| ---------- | --------------- |
| `activeTab` | Access the currently active tab to start audio capture |
| `tabCapture` | Capture the audio stream from the tab |
| `offscreen` | Create the hidden document for audio processing |
| `scripting` | Inject the subtitle overlay into webpages |
| `storage` | Save transcript history and user settings locally |
| `<all_urls>` | Inject content scripts on any page the user is on |

---

## Roadmap

- [ ] Implement Web Speech API engine (currently scaffolded)
- [ ] Model download progress indicator on first use
- [ ] Service worker keepalive for long capture sessions
- [ ] Silence-based audio chunking (instead of fixed 6s intervals)
- [ ] Upgrade to `whisper-base` for better accuracy
- [ ] Timestamps in transcript segments
- [ ] Export as `.srt` subtitle file
- [ ] Resizable overlay
- [ ] Keyboard shortcut to toggle overlay
- [ ] Search within transcript
- [ ] Dark / light theme toggle

---

## License

Private — not yet licensed for redistribution.
