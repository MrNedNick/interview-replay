import { clean, fail, formatTime, ok, type Ms, type Recording, type Result } from "./01-import";
import type { Segment } from "./02-notes";
import type { Workspace } from "./workspace";

/** A fragment of one recording inside a reel. `noteId` remembers the note it was cut from, if any. */
export interface Clip extends Segment {
  readonly id: string;
  readonly recordingId: string;
  readonly noteId?: string;
  readonly caption: string;
}
/** An ordered selection of fragments across interviews, played back to back. */
export interface Reel {
  readonly id: string;
  readonly title: string;
  readonly clips: readonly Clip[];
  readonly createdAt: string;
}

export const MIN_CLIP_MS = 1000;
export const MAX_CLIP_MS = 5 * 60 * 1000;
export const MAX_CLIPS = 100;
/** A note marks a point; the clip around it starts a little before and runs on after it. */
export const LEAD_IN_MS = 2000;
export const POINT_CLIP_MS = 12_000;
const MAX_CAPTION = 200;

export type ReelError = "title-empty" | "title-too-long" | "unknown-reel" | "unknown-clip" | "unknown-recording" | "unknown-note" | "clip-too-short" | "clip-too-long" | "past-end" | "clip-exists" | "too-many-clips" | "bad-position";

function checkTitle(title: string): Result<string, ReelError> {
  const value = clean(title);
  if (!value) return fail("title-empty", "Give the reel a title.");
  if (value.length > 80) return fail("title-too-long", "Keep the title under 80 characters.");
  return ok(value);
}
export function createReel(ws: Workspace, title: string, id: string, now: Date): Result<{ workspace: Workspace; reel: Reel }, ReelError> {
  const value = checkTitle(title);
  if (!value.ok) return value;
  const reel: Reel = { id, title: value.value, clips: [], createdAt: now.toISOString() };
  return ok({ workspace: { ...ws, reels: [...ws.reels, reel] }, reel });
}
export function renameReel(ws: Workspace, id: string, title: string): Result<Workspace, ReelError> {
  const value = checkTitle(title);
  if (!value.ok) return value;
  return update(ws, id, reel => ok({ ...reel, title: value.value }));
}
export function deleteReel(ws: Workspace, id: string): Result<Workspace, ReelError> {
  if (!ws.reels.some(r => r.id === id)) return fail("unknown-reel", "That reel was already deleted.");
  return ok({ ...ws, reels: ws.reels.filter(r => r.id !== id) });
}

/** The clip a note suggests: its own range, or a window around a point note — kept inside the recording. */
export function clipFromNote(note: Segment, recording: Recording): Segment {
  const duration = recording.media.durationMs;
  if (note.end - note.start >= MIN_CLIP_MS) return { start: note.start, end: Math.min(note.end, note.start + MAX_CLIP_MS) };
  const start = Math.max(0, note.start - LEAD_IN_MS);
  const end = Math.min(duration, Math.max(start + POINT_CLIP_MS, note.end));
  return { start: Math.max(0, Math.min(start, end - MIN_CLIP_MS)), end };
}
function checkClip(segment: Segment, recording: Recording): Result<Segment, ReelError> {
  const { start, end } = segment;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0) return fail("clip-too-short", "A clip needs a start of 0:00 or later.");
  if (end > recording.media.durationMs) return fail("past-end", `${formatTime(end)} is past the end of “${recording.title}” (${formatTime(recording.media.durationMs)}).`);
  if (end - start < MIN_CLIP_MS) return fail("clip-too-short", "A clip has to be at least a second long.");
  if (end - start > MAX_CLIP_MS) return fail("clip-too-long", "Keep clips under five minutes — split a long stretch into several.");
  return ok({ start, end });
}

export interface NewClip extends Partial<Segment> {
  readonly recordingId?: string;
  readonly noteId?: string;
  readonly caption?: string;
}
/** Adds a clip — from a note (its moment and text) or from an explicit range of a recording. */
export function addClip(ws: Workspace, reelId: string, input: NewClip, id: string): Result<Workspace, ReelError> {
  const note = input.noteId ? ws.notes.find(n => n.id === input.noteId) : undefined;
  if (input.noteId && !note) return fail("unknown-note", "That note was deleted.");
  const recording = ws.recordings.find(r => r.id === (note?.recordingId ?? input.recordingId));
  if (!recording) return fail("unknown-recording", "That recording is no longer here.");
  const suggested = note ? clipFromNote(note, recording) : undefined;
  const segment = checkClip({ start: input.start ?? suggested?.start ?? 0, end: input.end ?? suggested?.end ?? 0 }, recording);
  if (!segment.ok) return segment;
  return update(ws, reelId, reel => {
    if (reel.clips.length >= MAX_CLIPS) return fail("too-many-clips", `A reel holds up to ${MAX_CLIPS} clips.`);
    if (note && reel.clips.some(c => c.noteId === note.id)) return fail("clip-exists", `This moment is already in “${reel.title}”.`);
    const caption = clean(input.caption ?? note?.text ?? "").slice(0, MAX_CAPTION);
    const clip: Clip = { id, recordingId: recording.id, ...(note ? { noteId: note.id } : {}), ...segment.value, caption };
    return ok({ ...reel, clips: [...reel.clips, clip] });
  });
}
export function trimClip(ws: Workspace, reelId: string, clipId: string, patch: Partial<Segment> & { caption?: string }): Result<Workspace, ReelError> {
  return update(ws, reelId, reel => {
    const clip = reel.clips.find(c => c.id === clipId);
    if (!clip) return fail("unknown-clip", "That clip was removed.");
    const recording = ws.recordings.find(r => r.id === clip.recordingId);
    if (!recording) return fail("unknown-recording", "That recording is no longer here.");
    const segment = checkClip({ start: patch.start ?? clip.start, end: patch.end ?? clip.end }, recording);
    if (!segment.ok) return segment;
    const caption = patch.caption === undefined ? clip.caption : clean(patch.caption).slice(0, MAX_CAPTION);
    return ok({ ...reel, clips: reel.clips.map(c => (c.id === clipId ? { ...c, ...segment.value, caption } : c)) });
  });
}
export function moveClip(ws: Workspace, reelId: string, clipId: string, toIndex: number): Result<Workspace, ReelError> {
  return update(ws, reelId, reel => {
    const from = reel.clips.findIndex(c => c.id === clipId);
    if (from === -1) return fail("unknown-clip", "That clip was removed.");
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= reel.clips.length) return fail("bad-position", "That position is outside the reel.");
    const clips = [...reel.clips];
    clips.splice(toIndex, 0, ...clips.splice(from, 1));
    return ok({ ...reel, clips });
  });
}
export function removeClip(ws: Workspace, reelId: string, clipId: string): Result<Workspace, ReelError> {
  return update(ws, reelId, reel => (reel.clips.some(c => c.id === clipId) ? ok({ ...reel, clips: reel.clips.filter(c => c.id !== clipId) }) : fail("unknown-clip", "That clip was already removed.")));
}
function update(ws: Workspace, reelId: string, change: (reel: Reel) => Result<Reel, ReelError>): Result<Workspace, ReelError> {
  const reel = ws.reels.find(r => r.id === reelId);
  if (!reel) return fail("unknown-reel", "That reel was deleted.");
  const next = change(reel);
  if (!next.ok) return next;
  return ok({ ...ws, reels: ws.reels.map(r => (r.id === reelId ? next.value : r)) });
}

export const reelDuration = (reel: Reel): Ms => reel.clips.reduce((sum, c) => sum + c.end - c.start, 0);

export interface Step {
  readonly clip: Clip;
  readonly recording: Recording;
  /** Where this clip starts inside the reel. */
  readonly offset: Ms;
  readonly playable: boolean;
}
/** The reel as a sequence of media positions; clips whose media isn't available are kept in place but skipped. */
export function playbackPlan(ws: Workspace, reel: Reel, isPlayable: (recordingId: string) => boolean): Step[] {
  let offset = 0;
  const steps: Step[] = [];
  for (const clip of reel.clips) {
    const recording = ws.recordings.find(r => r.id === clip.recordingId);
    if (!recording) continue;
    steps.push({ clip, recording, offset, playable: isPlayable(recording.id) });
    offset += clip.end - clip.start;
  }
  return steps;
}
/** The next clip that can play after `index`, or null at the end of the reel. */
export function nextPlayable(steps: readonly Step[], index: number): number | null {
  for (let i = index + 1; i < steps.length; i++) if (steps[i].playable) return i;
  return null;
}
/** Where the reel is for a media time inside step `index`. */
export function reelPosition(steps: readonly Step[], index: number, mediaTime: Ms): Ms {
  const step = steps[index];
  return step ? step.offset + Math.min(step.clip.end - step.clip.start, Math.max(0, mediaTime - step.clip.start)) : 0;
}

/** Clips whose participant agreed only to review inside the team: they stay out of anything shared. */
export function withheldClips(ws: Workspace, reel: Reel): Clip[] {
  return reel.clips.filter(c => ws.recordings.find(r => r.id === c.recordingId)?.consent.scope !== "share");
}
