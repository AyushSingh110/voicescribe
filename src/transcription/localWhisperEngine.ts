import { pipeline } from "@huggingface/transformers";
import { blobToMonoFloat32, computeRmsEnergy, mergeFloat32 } from "./audio";
import { createSegmentId, type TranscriptionEngine, type TranscriptionInput } from "./engine";
import type { ModelProgress, WhisperModel } from "../shared/types";

type AutomaticSpeechRecognitionPipeline = {
  (audio: Float32Array, options?: Record<string, unknown>): Promise<unknown>;
};

type ProgressInfo = {
  status: string;
  file?: string;
  progress?: number;
};

const createPipeline = pipeline as unknown as (
  task: "automatic-speech-recognition",
  model: string,
  options: Record<string, unknown>
) => Promise<AutomaticSpeechRecognitionPipeline>;

/** 0.5 seconds of audio at 16 kHz */
const OVERLAP_SAMPLES = 8000;
/** Chunks below this RMS energy are treated as silence and skipped */
const SILENCE_THRESHOLD = 0.003;

const MODEL_IDS: Record<WhisperModel, string> = {
  tiny: "onnx-community/whisper-tiny",
  base: "onnx-community/whisper-base"
};

async function detectBestDevice(): Promise<"webgpu" | "wasm"> {
  try {
    if (!("gpu" in navigator)) return "wasm";
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

export class LocalWhisperEngine implements TranscriptionEngine {
  readonly name = "local-whisper";
  private transcriberPromise?: Promise<AutomaticSpeechRecognitionPipeline>;
  private overlapBuffer?: Float32Array;
  private loadedModel?: WhisperModel;
  activeDevice?: "webgpu" | "wasm";

  constructor(private readonly onProgress?: (progress: ModelProgress) => void) {}

  async transcribe(input: TranscriptionInput) {
    const audio = await blobToMonoFloat32(input.blob);
    if (audio.length === 0) return null;

    if (computeRmsEnergy(audio) < SILENCE_THRESHOLD) return null;

    const audioWithOverlap = this.overlapBuffer
      ? mergeFloat32(this.overlapBuffer, audio)
      : audio;
    this.overlapBuffer = audio.slice(-OVERLAP_SAMPLES);

    // If the user switched model while running, reset and reload
    const requestedModel = input.settings.whisperModel ?? "base";
    if (this.loadedModel && this.loadedModel !== requestedModel) {
      this.transcriberPromise = undefined;
      this.overlapBuffer = undefined;
    }

    const transcriber = await this.getTranscriber(requestedModel);
    const result = await transcriber(audioWithOverlap, {
      task: "translate",
      language: input.settings.sourceLanguage === "auto" ? undefined : input.settings.sourceLanguage
    });

    const text = normalizeOutputText(result);
    if (!text) return null;

    return {
      id: createSegmentId(input.startedAt),
      tabId: input.tabId,
      text,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      isFinal: true
    };
  }

  dispose(): void {
    this.overlapBuffer = undefined;
    this.transcriberPromise = undefined;
    this.loadedModel = undefined;
  }

  private getTranscriber(model: WhisperModel): Promise<AutomaticSpeechRecognitionPipeline> {
    if (!this.transcriberPromise) {
      this.loadedModel = model;
      this.transcriberPromise = this.buildPipeline(model);
    }
    return this.transcriberPromise;
  }

  private async buildPipeline(model: WhisperModel): Promise<AutomaticSpeechRecognitionPipeline> {
    const modelId = MODEL_IDS[model];
    const device = await detectBestDevice();

    const progressCallback = (info: ProgressInfo) => {
      if (!this.onProgress) return;
      if (info.status === "progress" && info.file && info.progress !== undefined) {
        this.onProgress({ file: info.file, progress: Math.round(info.progress), status: "loading" });
      }
      if (info.status === "done" && info.file) {
        this.onProgress({ file: info.file, progress: 100, status: "done" });
      }
    };

    if (device === "webgpu") {
      try {
        const result = await createPipeline("automatic-speech-recognition", modelId, {
          dtype: "q4",
          device: "webgpu",
          progress_callback: progressCallback
        });
        this.activeDevice = "webgpu";
        return result;
      } catch {
        // WebGPU initialisation failed — fall through to WASM
      }
    }

    this.activeDevice = "wasm";
    return createPipeline("automatic-speech-recognition", modelId, {
      dtype: "q8",
      device: "wasm",
      progress_callback: progressCallback
    });
  }
}

function normalizeOutputText(result: unknown): string {
  if (typeof result === "object" && result && "text" in result) {
    return String(result.text).trim();
  }
  if (Array.isArray(result)) {
    return result.map(normalizeOutputText).join(" ").trim();
  }
  return "";
}
