import { fail, formatTime, ok, type Ms, type Recording, type Result } from "./01-import";
import type { Workspace } from "./workspace";

/** A moment in a recording: a point when start === end, otherwise a range. */
export interface Segment {
  readonly start: Ms;
  readonly end: Ms;
}
/** A note on a moment — the observation itself, later tagged, clipped and cited as evidence. */
export interface Annotation extends Segment {
  readonly id: string;
  readonly recordingId: string;
  readonly text: string;
  readonly tagIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MAX_NOTE_LENGTH = 2000;
export const MAX_NOTES_PER_RECORDING = 5000;

export type NoteError = "unknown-recording" | "unknown-note" | "empty-note" | "note-too-long" | "bad-segment" | "past-end" | "too-many-notes";

/** Checks a moment against the recording it belongs to. */
export function checkSegment(segment: Segment, recording: Recording): Result<Segment, NoteError> {
  const { start, end } = segment;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0) return fail("bad-segment", "A moment needs a start time of 0:00 or later.");
  if (end < start) return fail("bad-segment", `The end (${formatTime(end)}) is before the start (${formatTime(start)}).`);
  if (end > recording.media.durationMs) return fail("past-end", `${formatTime(end)} is past the end of the recording (${formatTime(recording.media.durationMs)}).`);
  return ok({ start, end });
}
function checkText(text: string): Result<string, NoteError> {
  const value = text.normalize("NFC").trim();
  if (!value) return fail("empty-note", "Write what you noticed before saving the note.");
  if (value.length > MAX_NOTE_LENGTH) return fail("note-too-long", `Notes are limited to ${MAX_NOTE_LENGTH} characters; this one has ${value.length}.`);
  return ok(value);
}

export interface NewNote extends Segment {
  readonly recordingId: string;
  readonly text: string;
  readonly tagIds?: readonly string[];
}
export function addNote(ws: Workspace, input: NewNote, id: string, now: Date): Result<Workspace, NoteError> {
  const recording = ws.recordings.find(r => r.id === input.recordingId);
  if (!recording) return fail("unknown-recording", "That recording is no longer here.");
  if (ws.notes.filter(n => n.recordingId === recording.id).length >= MAX_NOTES_PER_RECORDING) return fail("too-many-notes", `A recording can hold up to ${MAX_NOTES_PER_RECORDING} notes.`);
  const segment = checkSegment(input, recording);
  if (!segment.ok) return segment;
  const text = checkText(input.text);
  if (!text.ok) return text;
  const stamp = now.toISOString();
  const tagIds = (input.tagIds ?? []).filter(tagId => ws.tags.some(tag => tag.id === tagId));
  const note: Annotation = Object.freeze({ id, recordingId: recording.id, ...segment.value, text: text.value, tagIds: Object.freeze([...new Set(tagIds)]), createdAt: stamp, updatedAt: stamp });
  return ok({ ...ws, notes: [...ws.notes, note] });
}

export function editNote(ws: Workspace, id: string, patch: Partial<Segment> & { text?: string }, now: Date): Result<Workspace, NoteError> {
  const note = ws.notes.find(n => n.id === id);
  if (!note) return fail("unknown-note", "That note was deleted.");
  const recording = ws.recordings.find(r => r.id === note.recordingId);
  if (!recording) return fail("unknown-recording", "That recording is no longer here.");
  const segment = checkSegment({ start: patch.start ?? note.start, end: patch.end ?? (patch.start !== undefined && note.end === note.start ? patch.start : note.end) }, recording);
  if (!segment.ok) return segment;
  const text = patch.text === undefined ? ok(note.text) : checkText(patch.text);
  if (!text.ok) return text;
  const next: Annotation = Object.freeze({ ...note, ...segment.value, text: text.value, updatedAt: now.toISOString() });
  return ok({ ...ws, notes: ws.notes.map(n => (n.id === id ? next : n)) });
}

/** Deleting a note also takes it out of every finding that cites it; clips cut from it keep their times. */
export function deleteNote(ws: Workspace, id: string): Result<Workspace, NoteError> {
  if (!ws.notes.some(n => n.id === id)) return fail("unknown-note", "That note was already deleted.");
  return ok({
    ...ws,
    notes: ws.notes.filter(n => n.id !== id),
    findings: ws.findings.map(f => (f.evidence.includes(id) ? { ...f, evidence: f.evidence.filter(e => e !== id) } : f)),
    reels: ws.reels.map(reel => (reel.clips.some(c => c.noteId === id) ? { ...reel, clips: reel.clips.map(c => (c.noteId === id ? { ...c, noteId: undefined } : c)) } : reel)),
  });
}

const byTime = (a: Annotation, b: Annotation) => a.start - b.start || a.end - b.end || a.createdAt.localeCompare(b.createdAt);
export function notesFor(ws: Workspace, recordingId: string): Annotation[] {
  return ws.notes.filter(n => n.recordingId === recordingId).sort(byTime);
}
/** The note being played: the latest one that has started, held through its range or for a few seconds after a point. */
export function currentNote(sorted: readonly Annotation[], time: Ms, hold: Ms = 4000): Annotation | null {
  let lo = 0, hi = sorted.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (sorted[mid].start <= time) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  for (let i = found; i >= 0 && i > found - 50; i--) {
    const note = sorted[i];
    if (time <= Math.max(note.end, note.start + hold)) return note;
  }
  return null;
}

export type TimeError = "bad-time";
/** Reads "75", "1:15", "1:01:15" or "1:15.5" as milliseconds. */
export function parseTime(text: string): Result<Ms, TimeError> {
  const match = /^\s*(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d{1,3})?)\s*$/.exec(text);
  if (!match) return fail("bad-time", `“${text.trim()}” isn't a time — write it as 1:15 or 1:02:15.`);
  const [, a, b, c] = match;
  const hours = a !== undefined && b !== undefined ? Number(a) : 0;
  const minutes = b !== undefined ? Number(b) : a !== undefined ? Number(a) : 0;
  const seconds = Number(c);
  if ((a !== undefined || b !== undefined) && seconds >= 60) return fail("bad-time", "Seconds go up to 59.");
  if (a !== undefined && b !== undefined && minutes >= 60) return fail("bad-time", "Minutes go up to 59 when hours are given.");
  return ok(Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000));
}
export const formatSegment = (s: Segment) => (s.end > s.start ? `${formatTime(s.start)}–${formatTime(s.end)}` : formatTime(s.start));

/** The visible window of the timeline: which time is at the left edge and how many milliseconds a pixel covers. */
export interface Viewport {
  readonly start: Ms;
  readonly msPerPx: number;
  readonly width: number;
}
export const MIN_MS_PER_PX = 10;
export function fitViewport(durationMs: Ms, width: number): Viewport {
  const w = Math.max(1, Math.floor(width));
  return { start: 0, msPerPx: Math.max(MIN_MS_PER_PX, durationMs / w), width: w };
}
export function clampViewport(v: Viewport, durationMs: Ms): Viewport {
  const maxMsPerPx = Math.max(MIN_MS_PER_PX, durationMs / v.width);
  const msPerPx = Math.min(maxMsPerPx, Math.max(MIN_MS_PER_PX, v.msPerPx));
  const span = msPerPx * v.width;
  const start = Math.round(Math.min(Math.max(0, durationMs - span), Math.max(0, v.start)));
  return { start, msPerPx, width: v.width };
}
/** Zooms by `factor` (>1 zooms in) keeping `anchor` at the same place on screen. */
export function zoomViewport(v: Viewport, factor: number, anchor: Ms, durationMs: Ms): Viewport {
  const x = (anchor - v.start) / v.msPerPx;
  const msPerPx = v.msPerPx / factor;
  return clampViewport({ ...v, msPerPx, start: anchor - x * msPerPx }, durationMs);
}
/** Scrolls just enough to bring `time` into view, with a margin, when it has left the window. */
export function revealTime(v: Viewport, time: Ms, durationMs: Ms): Viewport {
  const span = v.msPerPx * v.width;
  if (time >= v.start && time <= v.start + span) return v;
  return clampViewport({ ...v, start: time - span * 0.1 }, durationMs);
}
export const timeToX = (v: Viewport, t: Ms) => (t - v.start) / v.msPerPx;
export const xToTime = (v: Viewport, x: number, durationMs: Ms) => Math.round(Math.min(durationMs, Math.max(0, v.start + x * v.msPerPx)));

const STEPS = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
/** Ruler ticks at a round step that leaves at least `minGapPx` between labels. */
export function ticks(v: Viewport, durationMs: Ms, minGapPx = 72): Ms[] {
  const step = STEPS.find(s => s / v.msPerPx >= minGapPx) ?? STEPS[STEPS.length - 1];
  const end = Math.min(durationMs, v.start + v.msPerPx * v.width);
  const result: Ms[] = [];
  for (let t = Math.ceil(v.start / step) * step; t <= end; t += step) result.push(t);
  return result;
}

export interface Marker {
  readonly x: number;
  readonly width: number;
  readonly noteIds: readonly string[];
}
/**
 * Notes as marks on the visible timeline. Marks closer than `minGapPx` merge into one with a count,
 * so an hour of dense notes stays a few hundred elements instead of thousands.
 */
export function markers(sorted: readonly Annotation[], v: Viewport, minGapPx = 6): Marker[] {
  const viewEnd = v.start + v.msPerPx * v.width;
  const result: { x: number; right: number; noteIds: string[] }[] = [];
  for (const note of sorted) {
    if (note.end < v.start || note.start > viewEnd) continue;
    const x = Math.max(0, timeToX(v, note.start));
    const right = Math.min(v.width, Math.max(x + 2, timeToX(v, note.end)));
    const last = result[result.length - 1];
    if (last && x - last.x < minGapPx) { last.noteIds.push(note.id); last.right = Math.max(last.right, right); }
    else result.push({ x, right, noteIds: [note.id] });
  }
  return result.map(m => ({ x: m.x, width: m.right - m.x, noteIds: m.noteIds }));
}
