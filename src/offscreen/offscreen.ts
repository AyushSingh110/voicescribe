import type { ExtensionMessage } from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";
import type { ExtensionSettings } from "../shared/types";
import { createTranscriptionEngine } from "../transcription";
import type { TranscriptionEngine } from "../transcription/engine";
import type { LocalWhisperEngine } from "../transcription/localWhisperEngine";

let mediaStream: MediaStream | undefined;
let mediaRecorder: MediaRecorder | undefined;
let audioContext: AudioContext | undefined;
let activeEngine: TranscriptionEngine | undefined;
let currentTabId: number | undefined;
let currentSettings: ExtensionSettings | undefined;
let chunkStartedAt = 0;
let processingQueue = Promise.resolve();

// --- Keepalive: prevent MV3 service worker from sleeping during long sessions ---
let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepalive(): void {
  stopKeepalive();
  keepAlivePort = chrome.runtime.connect({ name: "keepalive" });
  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    // Reconnect only if still capturing
    if (mediaRecorder) {
      startKeepalive();
    }
  });
  keepAliveInterval = setInterval(() => {
    keepAlivePort?.postMessage({ ping: true });
  }, 20000);
}

function stopKeepalive(): void {
  if (keepAliveInterval !== null) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  keepAlivePort?.disconnect();
  keepAlivePort = null;
}
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return false;
  }

  void (async () => {
    try {
      if (message.type === "OFFSCREEN_START_CAPTURE") {
        await startCapture(message.streamId, message.tabId, message.settings);
      }

      if (message.type === "OFFSCREEN_STOP_CAPTURE") {
        await stopCapture();
      }

      sendResponse({ ok: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Offscreen processing failed";
      await sendStatus("error", errorMessage);
      sendResponse({ ok: false, error: errorMessage });
    }
  })();

  return true;
});

async function startCapture(streamId: string, tabId: number, settings: ExtensionSettings): Promise<void> {
  await stopCapture();
  await sendStatus("starting");

  currentTabId = tabId;
  currentSettings = settings;
  activeEngine = createTranscriptionEngine(settings.engineMode, (progress) => {
    void chrome.runtime.sendMessage({
      type: "OFFSCREEN_MODEL_PROGRESS",
      progress
    } satisfies ExtensionMessage).catch(() => undefined);
  });

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    } as MediaTrackConstraints,
    video: false
  });

  preserveTabAudio(mediaStream);
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: getSupportedMimeType() });
  mediaRecorder.addEventListener("dataavailable", handleAudioChunk);
  mediaRecorder.addEventListener("stop", () => void sendStatus("idle"));

  chunkStartedAt = Date.now();
  mediaRecorder.start(settings.chunkSeconds * 1000);
  startKeepalive();
  await sendStatus("capturing");
}

async function stopCapture(): Promise<void> {
  stopKeepalive();

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  mediaRecorder?.removeEventListener("dataavailable", handleAudioChunk);
  mediaRecorder = undefined;

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;

  await audioContext?.close().catch(() => undefined);
  audioContext = undefined;

  activeEngine?.dispose?.();
  activeEngine = undefined;
  currentTabId = undefined;
  currentSettings = undefined;
}

function preserveTabAudio(stream: MediaStream): void {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);
}

function handleAudioChunk(event: BlobEvent): void {
  const blob = event.data;
  const startedAt = chunkStartedAt;
  const endedAt = Date.now();
  chunkStartedAt = endedAt;

  if (!blob.size || !activeEngine || !currentTabId || !currentSettings) {
    return;
  }

  processingQueue = processingQueue
    .then(async () => {
      await sendStatus("processing");
      const segment = await activeEngine?.transcribe({
        blob,
        tabId: currentTabId as number,
        settings: currentSettings as ExtensionSettings,
        startedAt,
        endedAt
      });

      if (segment) {
        await chrome.runtime.sendMessage({
          type: "TRANSCRIPT_SEGMENT",
          segment
        } satisfies ExtensionMessage);

        // Report which inference backend actually loaded (once, on first result)
        const whisperEngine = activeEngine as LocalWhisperEngine | undefined;
        if (whisperEngine?.activeDevice) {
          await chrome.runtime.sendMessage({
            type: "OFFSCREEN_INFERENCE_DEVICE",
            device: whisperEngine.activeDevice
          } satisfies ExtensionMessage).catch(() => undefined);
        }
      }

      await sendStatus("capturing");
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Audio chunk processing failed";
      void sendStatus("error", message);
    });
}

function getSupportedMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

async function sendStatus(status: "idle" | "starting" | "capturing" | "processing" | "error", error?: string): Promise<void> {
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_STATUS",
    status,
    error
  } satisfies ExtensionMessage).catch(() => undefined);
}
