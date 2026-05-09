import { appendTranscriptSegment, clearTranscript, getSettings, getState, saveSettings, saveState } from "../shared/storage";
import type { ExtensionMessage, MessageResponse } from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";
import type { RuntimeState, TranscriptSegment } from "../shared/types";

let runtimeState: RuntimeState | undefined;

async function ensureState(): Promise<RuntimeState> {
  if (!runtimeState) {
    runtimeState = await getState();
  }
  return runtimeState;
}

async function setState(next: Partial<RuntimeState>): Promise<RuntimeState> {
  const current = await ensureState();
  runtimeState = { ...current, ...next };
  await saveState(runtimeState);
  return runtimeState;
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL("src/offscreen/offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "src/offscreen/offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture and process active tab audio for live transcription."
  });
}

async function startCapture(tabId: number): Promise<RuntimeState> {
  const settings = await getSettings();
  await setState({ status: "starting", activeTabId: tabId, settings, error: undefined });
  await ensureOffscreenDocument();

  const streamId = await getTabMediaStreamId(tabId);
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START_CAPTURE",
    streamId,
    tabId,
    settings
  } satisfies ExtensionMessage);

  return setState({ status: "capturing", activeTabId: tabId, settings });
}

async function getTabMediaStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(streamId);
    });
  });
}

async function stopCapture(): Promise<RuntimeState> {
  await setState({ status: "stopping" });
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP_CAPTURE" } satisfies ExtensionMessage).catch(() => undefined);
  return setState({ status: "idle", activeTabId: undefined, modelProgress: undefined, inferenceDevice: undefined });
}

async function forwardSegment(segment: TranscriptSegment): Promise<void> {
  await appendTranscriptSegment(segment);
  await setState({ latestSegment: segment, status: "capturing" });

  if (!runtimeState?.settings.showOverlay) {
    return;
  }

  await chrome.tabs.sendMessage(segment.tabId, {
    type: "CONTENT_SHOW_SEGMENT",
    segment
  } satisfies ExtensionMessage).catch(() => undefined);
}

// --- Keepalive: accept connections from the offscreen document ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "keepalive") return;
  port.onMessage.addListener(() => { /* intentional no-op — connection existence keeps worker alive */ });
});

// --- Keyboard command: Alt+T toggles the overlay ---
chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-overlay") return;

  void (async () => {
    const state = await ensureState();
    const next = !state.settings.showOverlay;
    const nextSettings = { ...state.settings, showOverlay: next };
    await saveSettings(nextSettings);
    await setState({ settings: nextSettings });

    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        type: "CONTENT_SET_VISIBILITY",
        visible: next
      } satisfies ExtensionMessage).catch(() => undefined);
    }
  })();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return false;
  }

  void (async (): Promise<MessageResponse> => {
    try {
      switch (message.type) {
        case "POPUP_GET_STATE":
          return { ok: true, data: await ensureState() };

        case "POPUP_START_CAPTURE":
          return { ok: true, data: await startCapture(message.tabId) };

        case "POPUP_STOP_CAPTURE":
          return { ok: true, data: await stopCapture() };

        case "POPUP_UPDATE_SETTINGS": {
          const nextSettings = { ...(await getSettings()), ...message.settings };
          await saveSettings(nextSettings);
          const state = await setState({ settings: nextSettings });
          if (typeof message.settings.showOverlay === "boolean" && state.activeTabId) {
            await chrome.tabs.sendMessage(state.activeTabId, {
              type: "CONTENT_SET_VISIBILITY",
              visible: message.settings.showOverlay
            } satisfies ExtensionMessage).catch(() => undefined);
          }
          return { ok: true, data: state };
        }

        case "POPUP_CLEAR_TRANSCRIPT":
          await clearTranscript();
          return { ok: true };

        case "OFFSCREEN_STATUS":
          return { ok: true, data: await setState({ status: message.status, error: message.error }) };

        case "OFFSCREEN_MODEL_PROGRESS":
          return { ok: true, data: await setState({ modelProgress: message.progress }) };

        case "OFFSCREEN_INFERENCE_DEVICE":
          return { ok: true, data: await setState({ inferenceDevice: message.device }) };

        case "TRANSCRIPT_SEGMENT":
          await forwardSegment(message.segment);
          return { ok: true };

        default:
          return { ok: true };
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unexpected extension error";
      await setState({ status: "error", error: messageText }).catch(() => undefined);
      return { ok: false, error: messageText };
    }
  })().then(sendResponse);

  return true;
});
