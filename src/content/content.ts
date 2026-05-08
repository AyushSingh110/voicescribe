import type { ExtensionMessage } from "../shared/messages";
import type { TranscriptSegment } from "../shared/types";
import "./content.css";

const rootId = "live-english-transcriber-root";

let rootElement: HTMLDivElement | undefined;
let overlayElement: HTMLDivElement | undefined;
let textElement: HTMLDivElement | undefined;
let visible = true;
let latestSegment: TranscriptSegment | undefined;
let position = { x: 24, y: Math.max(24, window.innerHeight - 170) };

function isMessage(value: unknown): value is ExtensionMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}

function ensureOverlay(): void {
  if (rootElement && overlayElement && textElement) {
    return;
  }

  rootElement = document.createElement("div");
  rootElement.id = rootId;

  overlayElement = document.createElement("div");
  overlayElement.className = "let-overlay";

  const labelElement = document.createElement("div");
  labelElement.className = "let-overlay__label";
  labelElement.textContent = "English transcript";

  textElement = document.createElement("div");
  textElement.className = "let-overlay__text";

  overlayElement.append(labelElement, textElement);
  rootElement.append(overlayElement);
  document.documentElement.append(rootElement);

  overlayElement.addEventListener("pointerdown", startDrag);
  render();
}

function render(): void {
  if (!overlayElement || !textElement) {
    return;
  }

  overlayElement.style.transform = `translate(${position.x}px, ${position.y}px)`;
  overlayElement.style.display = visible && latestSegment ? "block" : "none";
  textElement.textContent = latestSegment?.text ?? "";
}

function startDrag(event: PointerEvent): void {
  if (!overlayElement) {
    return;
  }

  const startX = event.clientX;
  const startY = event.clientY;
  const initial = position;
  overlayElement.setPointerCapture(event.pointerId);

  const move = (moveEvent: PointerEvent) => {
    position = {
      x: Math.max(8, initial.x + moveEvent.clientX - startX),
      y: Math.max(8, initial.y + moveEvent.clientY - startY)
    };
    render();
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isMessage(message)) {
    return;
  }

  if (message.type === "CONTENT_SHOW_SEGMENT") {
    latestSegment = message.segment;
    visible = true;
    ensureOverlay();
    render();
  }

  if (message.type === "CONTENT_SET_VISIBILITY") {
    visible = message.visible;
    render();
  }
});

if (!document.getElementById(rootId)) {
  ensureOverlay();
}
