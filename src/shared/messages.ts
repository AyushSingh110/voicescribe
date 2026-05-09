import type { ExtensionSettings, ModelProgress, RuntimeState, TranscriptSegment } from "./types";

export type ExtensionMessage =
  | { type: "POPUP_GET_STATE" }
  | { type: "POPUP_START_CAPTURE"; tabId: number }
  | { type: "POPUP_STOP_CAPTURE" }
  | { type: "POPUP_CLEAR_TRANSCRIPT" }
  | { type: "POPUP_UPDATE_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "OFFSCREEN_START_CAPTURE"; streamId: string; tabId: number; settings: ExtensionSettings }
  | { type: "OFFSCREEN_STOP_CAPTURE" }
  | { type: "OFFSCREEN_STATUS"; status: RuntimeState["status"]; error?: string }
  | { type: "OFFSCREEN_MODEL_PROGRESS"; progress: ModelProgress }
  | { type: "OFFSCREEN_INFERENCE_DEVICE"; device: "webgpu" | "wasm" }
  | { type: "TRANSCRIPT_SEGMENT"; segment: TranscriptSegment }
  | { type: "CONTENT_SHOW_SEGMENT"; segment: TranscriptSegment }
  | { type: "CONTENT_SET_VISIBILITY"; visible: boolean };

export type MessageResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}
