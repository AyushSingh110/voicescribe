import type { ExtensionSettings, TranscriptSegment } from "../shared/types";

export interface TranscriptionInput {
  blob: Blob;
  tabId: number;
  startedAt: number;
  endedAt: number;
  settings: ExtensionSettings;
}

export interface TranscriptionEngine {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptSegment | null>;
  dispose?(): void;
}

export function createSegmentId(startedAt: number): string {
  return `${startedAt}-${crypto.randomUUID()}`;
}
