import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Captions, Eraser, Loader2, Mic, Square, Subtitles } from "lucide-react";
import type { MessageResponse } from "../shared/messages";
import type { EngineMode, RuntimeState, TranscriptSegment } from "../shared/types";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/types";
import "./styles.css";

function App() {
  const [state, setState] = useState<RuntimeState>({
    status: "idle",
    settings: DEFAULT_SETTINGS
  });
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [busy, setBusy] = useState(false);

  const isRunning = ["starting", "capturing", "processing"].includes(state.status);
  const statusText = useMemo(() => {
    if (state.status === "processing") return "Processing audio";
    if (state.status === "capturing") return "Listening to tab";
    if (state.status === "starting") return "Starting capture";
    if (state.status === "error") return "Needs attention";
    return "Ready";
  }, [state.status]);

  useEffect(() => {
    void refresh();

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.state]?.newValue) {
        setState(changes[STORAGE_KEYS.state].newValue);
      }

      if (changes[STORAGE_KEYS.transcript]?.newValue) {
        setTranscript(changes[STORAGE_KEYS.transcript].newValue);
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
    setTranscript(stored[STORAGE_KEYS.transcript] ?? []);
  }

  async function start() {
    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error("No active tab found.");
      }

      const response = await chrome.runtime.sendMessage({
        type: "POPUP_START_CAPTURE",
        tabId: tab.id
      }) as MessageResponse<RuntimeState>;

      if (!response.ok) {
        throw new Error(response.error);
      }

      if (response.data) {
        setState(response.data);
      }
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
    if (response.data) {
      setState(response.data);
    }
    setBusy(false);
  }

  async function updateSettings(next: Partial<RuntimeState["settings"]>) {
    const response = await chrome.runtime.sendMessage({
      type: "POPUP_UPDATE_SETTINGS",
      settings: next
    }) as MessageResponse<RuntimeState>;

    if (response.ok && response.data) {
      setState(response.data);
    }
  }

  async function clearTranscript() {
    await chrome.runtime.sendMessage({ type: "POPUP_CLEAR_TRANSCRIPT" });
    setTranscript([]);
  }

  function exportTranscript() {
    const text = transcript.map((segment) => segment.text).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `live-english-transcript-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
        <span className={`status status--${state.status}`}>{state.status}</span>
      </header>

      {state.error ? <div className="notice">{state.error}</div> : null}

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
            <option value="local-whisper">Local Whisper</option>
            <option value="web-speech">Web Speech placeholder</option>
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

        <label className="toggle">
          <input
            type="checkbox"
            checked={state.settings.showOverlay}
            onChange={(event) => updateSettings({ showOverlay: event.target.checked })}
          />
          <span>Overlay</span>
        </label>
      </section>

      <section className="transcript">
        <div className="section-title">
          <span>Transcript</span>
          <div className="icon-actions">
            <button title="Clear transcript" onClick={clearTranscript}>
              <Eraser size={16} />
            </button>
            <button title="Export transcript" onClick={exportTranscript} disabled={!transcript.length}>
              <Captions size={16} />
            </button>
          </div>
        </div>

        <div className="transcript-list">
          {transcript.length ? (
            transcript.slice(-8).reverse().map((segment) => (
              <article key={segment.id} className="segment">
                {segment.text}
              </article>
            ))
          ) : (
            <p className="empty">Start capture on a tab with audio.</p>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
