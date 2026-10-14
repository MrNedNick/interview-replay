/** Times are whole milliseconds from the start of a recording. */
export type Ms = number;

export interface DomainError<C extends string = string> {
  readonly code: C;
  readonly message: string;
}
export type Result<T, C extends string = string> = { ok: true; value: T } | { ok: false; error: DomainError<C> };
export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const fail = <C extends string>(code: C, message: string): { ok: false; error: DomainError<C> } => ({ ok: false, error: { code, message } });

export type MediaKind = "audio" | "video";
/** What is known about a media file without keeping it: enough to recognise the same file again. */
export interface MediaInfo {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly durationMs: Ms;
  readonly kind: MediaKind;
  /** SHA-256 over the size and the first and last 256 KiB (see `fingerprintRanges`). */
  readonly fingerprint: string;
}

/** "team" — reviewed inside the research team only; "share" — clips may also leave the team (reports, reels). */
export type ConsentScope = "team" | "share";
export interface Consent {
  readonly participant: string;
  /** ISO date (YYYY-MM-DD) the participant agreed. */
  readonly date: string;
  readonly scope: ConsentScope;
}
export interface Recording {
  readonly id: string;
  readonly title: string;
  readonly consent: Consent;
  readonly media: MediaInfo;
  readonly createdAt: string;
  /** Part of the bundled sample study: synthetic voices, no real participant. */
  readonly sample?: boolean;
}

export const MAX_MEDIA_BYTES = 4 * 1024 ** 3;
export const MAX_DURATION_MS = 6 * 60 * 60 * 1000;
export const FINGERPRINT_CHUNK = 256 * 1024;
const MAX_PARTICIPANT = 60;
const MAX_TITLE = 120;

const EXTENSIONS: Record<string, MediaKind> = {
  mp3: "audio", m4a: "audio", aac: "audio", wav: "audio", oga: "audio", ogg: "audio", opus: "audio", flac: "audio", weba: "audio",
  mp4: "video", m4v: "video", mov: "video", webm: "video", ogv: "video", mkv: "video",
};

export type MediaFileError = "empty-file" | "too-large" | "unsupported-type";
/** Decides from the file's type (or its extension when the browser gives none) whether it is a recording at all. */
export function checkMediaFile(file: { name: string; type: string; size: number }): Result<MediaKind, MediaFileError> {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  const kind: MediaKind | undefined = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : file.type === "" || file.type === "application/octet-stream" ? EXTENSIONS[extension] : undefined;
  if (!kind) return fail("unsupported-type", `${file.name} is not an audio or video file. Choose a recording such as MP4, MOV, WebM, M4A, MP3 or WAV.`);
  if (file.size <= 0) return fail("empty-file", `${file.name} is empty.`);
  if (file.size > MAX_MEDIA_BYTES) return fail("too-large", `${file.name} is ${formatBytes(file.size)}; recordings up to ${formatBytes(MAX_MEDIA_BYTES)} can be imported.`);
  return ok(kind);
}

export type DurationError = "no-duration" | "too-long";
/** The media element's float seconds become whole milliseconds once, here. */
export function checkDuration(seconds: number): Result<Ms, DurationError> {
  if (!Number.isFinite(seconds) || seconds <= 0) return fail("no-duration", "The browser couldn't read how long this recording is, so it can't be played here. Try exporting it again as MP4 or M4A.");
  const ms = Math.round(seconds * 1000);
  if (ms > MAX_DURATION_MS) return fail("too-long", `This recording is ${formatTime(ms)} long; up to ${formatTime(MAX_DURATION_MS)} is supported.`);
  return ok(ms);
}

/** Byte ranges hashed for the fingerprint: cheap even for a multi-gigabyte file, and different for re-encoded copies. */
export function fingerprintRanges(size: number): Array<[start: number, end: number]> {
  if (size <= FINGERPRINT_CHUNK * 2) return [[0, size]];
  return [[0, FINGERPRINT_CHUNK], [size - FINGERPRINT_CHUNK, size]];
}

export interface ImportInput {
  readonly file: { name: string; type: string; size: number };
  readonly kind: MediaKind;
  readonly durationMs: Ms;
  readonly fingerprint: string;
  readonly title: string;
  readonly participant: string;
  readonly consentGiven: boolean;
  readonly consentDate: string;
  readonly scope: ConsentScope;
}
export type ImportError = "consent-missing" | "participant-missing" | "participant-too-long" | "title-too-long" | "bad-date" | "duplicate";

/** A recording only exists with recorded consent: who agreed, when, and to what use. */
export function createRecording(input: ImportInput, existing: readonly Recording[], id: string, now: Date): Result<Recording, ImportError> {
  const participant = clean(input.participant);
  if (!input.consentGiven) return fail("consent-missing", "Confirm that the participant agreed to be recorded and to this use before importing.");
  if (!participant) return fail("participant-missing", "Name the participant — a first name or an alias such as “P4” is enough.");
  if (participant.length > MAX_PARTICIPANT) return fail("participant-too-long", `Keep the participant's name under ${MAX_PARTICIPANT} characters.`);
  if (!isIsoDate(input.consentDate) || input.consentDate > now.toISOString().slice(0, 10)) return fail("bad-date", "Enter the date consent was given; it can't be in the future.");
  const title = clean(input.title) || input.file.name.replace(/\.[^.]+$/, "");
  if (title.length > MAX_TITLE) return fail("title-too-long", `Keep the title under ${MAX_TITLE} characters.`);
  const twin = existing.find(recording => recording.media.fingerprint === input.fingerprint);
  if (twin) return fail("duplicate", `This file is already imported as “${twin.title}”.`);
  return ok(Object.freeze({
    id,
    title,
    consent: Object.freeze({ participant, date: input.consentDate, scope: input.scope }),
    media: Object.freeze({ name: input.file.name, type: input.file.type, size: input.file.size, durationMs: input.durationMs, kind: input.kind, fingerprint: input.fingerprint }),
    createdAt: now.toISOString(),
  }));
}

export type MediaMatch = "same" | "renamed" | "other-version";
export type MediaMatchError = "different-media";
const VERSION_TOLERANCE_MS = 2000;
/**
 * Reconnects a recording to a file chosen again — after a reload without a stored copy, in another browser,
 * or once the file was moved or renamed. A re-export of the same interview (different bytes, same length)
 * is "other-version": usable, but the page asks first. Anything else is refused.
 */
export function matchMedia(expected: MediaInfo, candidate: { name: string; fingerprint: string; durationMs: Ms }): Result<MediaMatch, MediaMatchError> {
  if (candidate.fingerprint === expected.fingerprint) return ok(candidate.name === expected.name ? "same" : "renamed");
  if (Math.abs(candidate.durationMs - expected.durationMs) <= VERSION_TOLERANCE_MS) return ok("other-version");
  return fail("different-media", `${candidate.name} (${formatTime(candidate.durationMs)}) isn't this recording: expected ${expected.name} (${formatTime(expected.durationMs)}).`);
}

export function formatTime(ms: Ms): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
export const clean = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const isIsoDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
