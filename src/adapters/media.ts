import { checkDuration, fingerprintRanges, type MediaKind, type Result } from "../domain/01-import";

/** SHA-256 over the file's size and its first and last 256 KiB — the same file always gives the same value. */
export async function fingerprint(blob: Blob): Promise<string> {
  const parts: BlobPart[] = [new TextEncoder().encode(String(blob.size))];
  for (const [start, end] of fingerprintRanges(blob.size)) parts.push(await blob.slice(start, end).arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", await new Blob(parts).arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads the length the browser will actually play. Recordings straight from MediaRecorder report an
 * infinite duration until the element seeks to the end, so it does exactly that before answering.
 */
export function probeDuration(blob: Blob, kind: MediaKind, timeoutMs = 20_000): Promise<Result<number, "no-duration" | "too-long" | "unplayable">> {
  return new Promise(resolve => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (result: Result<number, "no-duration" | "too-long" | "unplayable">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(checkDuration(Number.NaN)), timeoutMs);
    const settle = () => { if (Number.isFinite(element.duration) && element.duration > 0) finish(checkDuration(element.duration)); };
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => {
      if (element.duration === Infinity) { element.ondurationchange = settle; element.currentTime = 1e7; }
      else settle();
    };
    element.onerror = () => finish({ ok: false, error: { code: "unplayable", message: "This browser can't play this file. Try MP4 (H.264) for video or M4A/MP3 for audio." } });
    element.src = url;
  });
}
