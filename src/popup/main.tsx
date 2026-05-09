import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Captions, Check, Copy, Eraser, FileText, Loader2, Mic, Moon, Search, Square, Subtitles, Sun } from "lucide-react";
import type { MessageResponse } from "../shared/messages";
import type { EngineMode, RuntimeState, Theme, TranscriptSegment, WhisperModel } from "../shared/types";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/types";
import "./styles.css";

function formatTimestamp(startedAt: number, baseTime: number): string {
  const elapsed = Math.max(0, startedAt - baseTime);
  const m = Math.floor(elapsed / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msRem).padStart(3, "0")}`;
}

function App() {
  const [state, setState] = useState<RuntimeState>({
    status: "idle",
    settings: DEFAULT_SETTINGS
  });
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const theme: Theme = state.settings.theme ?? "light";

  const isRunning = ["starting", "capturing", "processing"].includes(state.status);

  const statusText = useMemo(() => {
    if (state.status === "processing") return "Processing audio";
    if (state.status === "capturing") return "Listening to tab";
    if (state.status === "starting") return "Starting capture";
    if (state.status === "error") return "Needs attention";
    return "Ready";
  }, [state.status]);

  const baseTime = transcript[0]?.startedAt ?? 0;

  const filteredTranscript = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transcript.slice(-50);
    return transcript.filter((s) => s.text.toLowerCase().includes(query));
  }, [transcript, search]);

  const stats = useMemo(() => {
    if (!transcript.length) return null;
    const words = transcript.reduce(
      (acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length,
      0
    );
    const durationMs = transcript[transcript.length - 1].endedAt - transcript[0].startedAt;
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    return { words, duration: `${mins}:${String(secs).padStart(2, "0")}` };
  }, [transcript]);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Auto-scroll to latest segment
  useEffect(() => {
    if (!search) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, search]);

  useEffect(() => {
    void refresh();

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.state]?.newValue) {
        setState(changes[STORAGE_KEYS.state].newValue as RuntimeState);
      }

      if (changes[STORAGE_KEYS.transcript]?.newValue) {
        setTranscript(changes[STORAGE_KEYS.transcript].newValue as TranscriptSegment[]);
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  async function refresh() {
    const response = await chrome.runtime.sendMessage({ type: "POPUP_GET_STATE" }) as MessageResponse<RuntimeState>;
    const stored = await chrome.storage.local.get(STORAGE_KEYS.transcript);
    if (response.ok && response.data) {
      setState(response.data);
    }
    setTranscript((stored[STORAGE_KEYS.transcript] as TranscriptSegment[]) ?? []);
  }

  async function start() {
    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab found.");

      const response = await chrome.runtime.sendMessage({
        type: "POPUP_START_CAPTURE",
        tabId: tab.id
      }) as MessageResponse<RuntimeState>;

      if (!response.ok) throw new Error(response.error);
      if (response.data) setState(response.data);
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Could not start capture"
      }));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    const response = await chrome.runtime.sendMessage({ type: "POPUP_STOP_CAPTURE" }) as MessageResponse<RuntimeState>;
    if (response.data) setState(response.data);
    setBusy(false);
  }

  async function updateSettings(next: Partial<RuntimeState["settings"]>) {
    const response = await chrome.runtime.sendMessage({
      type: "POPUP_UPDATE_SETTINGS",
      settings: next
    }) as MessageResponse<RuntimeState>;

    if (response.ok && response.data) setState(response.data);
  }

  async function clearTranscript() {
    await chrome.runtime.sendMessage({ type: "POPUP_CLEAR_TRANSCRIPT" });
    setTranscript([]);
  }

  function exportTxt() {
    const text = transcript
      .map((s) => `[${formatTimestamp(s.startedAt, baseTime)}] ${s.text}`)
      .join("\n");
    downloadFile(text, "text/plain;charset=utf-8", `transcript-${Date.now()}.txt`);
  }

  function exportSrt() {
    const base = transcript[0]?.startedAt ?? 0;
    const content = transcript
      .map((s, i) => {
        const start = msToSrtTime(s.startedAt - base);
        const end = msToSrtTime(s.endedAt - base);
        return `${i + 1}\n${start} --> ${end}\n${s.text}`;
      })
      .join("\n\n");
    downloadFile(content, "text/plain;charset=utf-8", `transcript-${Date.now()}.srt`);
  }

  function downloadFile(content: string, mimeType: string, filename: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copySegment(segment: TranscriptSegment) {
    await navigator.clipboard.writeText(segment.text);
    setCopiedId(segment.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const modelLoading = state.modelProgress?.status === "loading";

  return (
    <main className="app">
      <header className="header">
        <div className="brand">
          <Subtitles size={22} />
          <div>
            <h1>Live English Transcriber</h1>
            <p>{statusText}</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            onClick={() => updateSettings({ theme: theme === "light" ? "dark" : "light" })}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <span className={`status status--${state.status}`}>{state.status}</span>
        </div>
      </header>

      {state.error ? <div className="notice notice--error">{state.error}</div> : null}

      {modelLoading && state.modelProgress ? (
        <div className="model-progress">
          <div className="model-progress__label">
            Downloading model &mdash; {state.modelProgress.progress}%
          </div>
          <div className="model-progress__track">
            <div
              className="model-progress__fill"
              style={{ width: `${state.modelProgress.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <section className="controls" aria-label="Capture controls">
        {isRunning ? (
          <button className="primary primary--stop" onClick={stop} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Square size={18} />}
            Stop
          </button>
        ) : (
          <button className="primary" onClick={start} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Mic size={18} />}
            Start
          </button>
        )}
      </section>

      <section className="settings" aria-label="Settings">
        <label>
          Engine
          <select
            value={state.settings.engineMode}
            onChange={(event) => updateSettings({ engineMode: event.target.value as EngineMode })}
            disabled={isRunning}
          >
            <option value="local-whisper">Local Whisper (tab audio)</option>
            <option value="web-speech">Web Speech (microphone)</option>
          </select>
        </label>

        <label>
          Source
          <select
            value={state.settings.sourceLanguage}
            onChange={(event) => updateSettings({ sourceLanguage: event.target.value })}
            disabled={isRunning}
          >
            <option value="auto">Auto detect</option>
            <option value="hi">Hindi</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
          </select>
        </label>

        {state.settings.engineMode === "local-whisper" ? (
          <label>
            Model
            <select
              value={state.settings.whisperModel ?? "base"}
              onChange={(event) => updateSettings({ whisperModel: event.target.value as WhisperModel })}
              disabled={isRunning}
            >
              <option value="base">whisper-base (accurate)</option>
              <option value="tiny">whisper-tiny (fast)</option>
            </select>
          </label>
        ) : null}

        {state.settings.engineMode === "local-whisper" && state.inferenceDevice ? (
          <div className={`device-badge device-badge--${state.inferenceDevice}`}>
            {state.inferenceDevice === "webgpu" ? "⚡ WebGPU" : "🧮 WASM"}
          </div>
        ) : null}

        <label className="toggle">
          <input
            type="checkbox"
            checked={state.settings.showOverlay}
            onChange={(event) => updateSettings({ showOverlay: event.target.checked })}
          />
          <span>Overlay (Alt+T)</span>
        </label>
      </section>

      <section className="transcript">
        <div className="section-title">
          <span>Transcript</span>
          <div className="icon-actions">
            <button title="Clear transcript" onClick={clearTranscript}>
              <Eraser size={16} />
            </button>
            <button title="Export as .txt" onClick={exportTxt} disabled={!transcript.length}>
              <Captions size={16} />
            </button>
            <button title="Export as .srt subtitle file" onClick={exportSrt} disabled={!transcript.length}>
              <FileText size={16} />
            </button>
          </div>
        </div>

        {stats ? (
          <div className="stats">
            {stats.words} words &nbsp;&middot;&nbsp; {stats.duration} elapsed
          </div>
        ) : null}

        <div className="search-wrap">
          <Search size={13} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Search transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="transcript-list">
          {filteredTranscript.length ? (
            filteredTranscript.map((segment) => (
              <article key={segment.id} className="segment">
                <div className="segment__meta">
                  <span className="segment__time">{formatTimestamp(segment.startedAt, baseTime)}</span>
                  <button
                    className="segment__copy"
                    title="Copy"
                    onClick={() => void copySegment(segment)}
                  >
                    {copiedId === segment.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <p className="segment__text">{segment.text}</p>
              </article>
            ))
          ) : (
            <p className="empty">
              {search ? "No segments match your search." : "Start capture on a tab with audio."}
            </p>
          )}
          <div ref={transcriptBottomRef} />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
