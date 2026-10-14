import { fail, ok, type Recording, type Result } from "./01-import";
import type { Annotation } from "./02-notes";
import { TAG_COLORS, type Tag } from "./03-tags";
import type { Clip, Reel } from "./04-reels";
import type { Finding } from "./05-findings";

/** Everything a study holds except the media itself, which lives beside it as files the browser keeps. */
export interface Workspace {
  readonly version: typeof WORKSPACE_VERSION;
  readonly recordings: readonly Recording[];
  readonly notes: readonly Annotation[];
  readonly tags: readonly Tag[];
  readonly reels: readonly Reel[];
  readonly findings: readonly Finding[];
}
export const WORKSPACE_VERSION = 1;
export const EMPTY_WORKSPACE: Workspace = Object.freeze({ version: WORKSPACE_VERSION, recordings: [], notes: [], tags: [], reels: [], findings: [] });

export type RestoreError = "damaged" | "newer-version";
export interface Restored {
  readonly workspace: Workspace;
  /** References to things that no longer exist, dropped while reading (a tag on a note after the tag went, and so on). */
  readonly repaired: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 10_000): v is string => typeof v === "string" && v.length <= max;
const isMs = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isTextArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => isText(x, 200));

function readRecording(v: unknown): Recording | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.title, 200) || !isText(v.createdAt, 40)) return null;
  const c = v.consent, m = v.media;
  if (!isObject(c) || !isText(c.participant, 100) || !c.participant || !isText(c.date, 10) || (c.scope !== "team" && c.scope !== "share")) return null;
  if (!isObject(m) || !isText(m.name, 500) || !isText(m.type, 200) || !isMs(m.size) || !isMs(m.durationMs) || (m.durationMs as number) <= 0 || (m.kind !== "audio" && m.kind !== "video") || !isText(m.fingerprint, 200)) return null;
  return {
    id: v.id, title: v.title, createdAt: v.createdAt,
    consent: { participant: c.participant, date: c.date, scope: c.scope },
    media: { name: m.name, type: m.type, size: m.size as number, durationMs: m.durationMs as number, kind: m.kind, fingerprint: m.fingerprint },
    ...(v.sample === true ? { sample: true } : {}),
  };
}
function readNote(v: unknown): Annotation | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.recordingId, 200) || !isText(v.text, 2000) || !isMs(v.start) || !isMs(v.end) || (v.end as number) < (v.start as number)) return null;
  if (!isTextArray(v.tagIds) || !isText(v.createdAt, 40) || !isText(v.updatedAt, 40)) return null;
  return { id: v.id, recordingId: v.recordingId, start: v.start as number, end: v.end as number, text: v.text, tagIds: v.tagIds, createdAt: v.createdAt, updatedAt: v.updatedAt };
}
function readTag(v: unknown): Tag | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.name, 40) || !v.name) return null;
  return { id: v.id, name: v.name, color: TAG_COLORS.includes(v.color as Tag["color"]) ? (v.color as Tag["color"]) : "slate" };
}
function readClip(v: unknown): Clip | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.recordingId, 200) || !isMs(v.start) || !isMs(v.end) || (v.end as number) <= (v.start as number) || !isText(v.caption, 200)) return null;
  return { id: v.id, recordingId: v.recordingId, start: v.start as number, end: v.end as number, caption: v.caption, ...(isText(v.noteId, 200) ? { noteId: v.noteId } : {}) };
}
function readReel(v: unknown): Reel | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.title, 80) || !Array.isArray(v.clips) || !isText(v.createdAt, 40)) return null;
  const clips = v.clips.map(readClip);
  return clips.every(Boolean) ? { id: v.id, title: v.title, clips: clips as Clip[], createdAt: v.createdAt } : null;
}
function readFinding(v: unknown): Finding | null {
  if (!isObject(v) || !isText(v.id, 200) || !isText(v.title, 140) || !isText(v.detail, 4000) || !isTextArray(v.evidence) || !isText(v.createdAt, 40) || !isText(v.updatedAt, 40)) return null;
  return { id: v.id, title: v.title, detail: v.detail, evidence: v.evidence, createdAt: v.createdAt, updatedAt: v.updatedAt };
}
function readAll<T>(raw: unknown, read: (v: unknown) => T | null): T[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const items = raw.map(read);
  return items.every(item => item !== null) ? (items as T[]) : null;
}

/**
 * Reads a stored or imported workspace. A collection that didn't exist when it was saved (an older build
 * without reels, say) comes back empty; a workspace from a newer version is refused rather than half-read;
 * anything malformed is "damaged" — never partly loaded. Dangling references are dropped and counted.
 */
export function restoreWorkspace(raw: unknown): Result<Restored, RestoreError> {
  if (!isObject(raw)) return fail("damaged", "This isn't a saved study.");
  if (typeof raw.version === "number" && raw.version > WORKSPACE_VERSION) return fail("newer-version", "This study was saved by a newer version of Interview Replay. Reload the page to get the latest version, then try again.");
  if (raw.version !== WORKSPACE_VERSION) return fail("damaged", "This study's format isn't recognised.");
  const recordings = readAll(raw.recordings, readRecording), notes = readAll(raw.notes, readNote), tags = readAll(raw.tags, readTag), reels = readAll(raw.reels, readReel), findings = readAll(raw.findings, readFinding);
  if (!recordings || !notes || !tags || !reels || !findings) return fail("damaged", "Part of this study is damaged, so none of it was loaded.");
  const ids = [recordings, notes, tags, reels, findings].map(list => new Set(list.map(item => item.id)));
  if (ids.some((set, i) => set.size !== [recordings, notes, tags, reels, findings][i].length)) return fail("damaged", "This study repeats an id, so it can't be read safely.");
  const [recordingIds, , tagIds] = ids;
  let repaired = 0;
  const keptNotes = notes.filter(n => recordingIds.has(n.recordingId) || (repaired++, false)).map(n => {
    const known = n.tagIds.filter(t => tagIds.has(t));
    repaired += n.tagIds.length - known.length;
    return known.length === n.tagIds.length ? n : { ...n, tagIds: known };
  });
  const noteIds = new Set(keptNotes.map(n => n.id));
  const keptReels = reels.map(reel => {
    const clips = reel.clips.filter(c => recordingIds.has(c.recordingId) || (repaired++, false)).map(c => (c.noteId && !noteIds.has(c.noteId) ? (repaired++, { ...c, noteId: undefined }) : c));
    return { ...reel, clips };
  });
  const keptFindings = findings.map(f => {
    const evidence = f.evidence.filter(e => noteIds.has(e) || (repaired++, false));
    return evidence.length === f.evidence.length ? f : { ...f, evidence };
  });
  return ok({ workspace: { version: WORKSPACE_VERSION, recordings, notes: keptNotes, tags, reels: keptReels, findings: keptFindings }, repaired });
}
