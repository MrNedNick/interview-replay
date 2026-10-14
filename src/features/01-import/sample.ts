import { createRecording, type Recording } from "../../domain/01-import";
import { addNote } from "../../domain/02-notes";
import { ensureTag, toggleTag } from "../../domain/03-tags";
import { addClip, createReel } from "../../domain/04-reels";
import { createFinding } from "../../domain/05-findings";
import type { Workspace } from "../../domain/workspace";
import { fingerprint } from "../../adapters/media";
import lines from "../../sample/lines.json";

type SessionId = keyof typeof lines;
/** Researcher notes on the sample: [session, line index, note, tags, as a range]. */
const NOTES: Array<[SessionId, number, string, string[], boolean]> = [
  ["maya", 1, "Plans groceries on Sunday evening; picks whichever app has a free delivery slot", ["Context"], false],
  ["maya", 3, "Expected to see the delivery time before paying — wasn't sure the slot was still reserved", ["Checkout", "Delivery slot"], true],
  ["maya", 5, "Maya lost a slot this way before; now takes a screenshot of the time before paying", ["Delivery slot", "Workaround"], false],
  ["maya", 7, "Skipped substitutions: the word “sounds like extra work”", ["Substitutions"], false],
  ["maya", 9, "Wants the slot and the total next to the Pay button", ["Checkout", "Idea"], false],
  ["jonas", 1, "Orders on his lunch break — about ten minutes for the whole thing", ["Context"], false],
  ["jonas", 3, "Couldn't see the delivery time on the payment page; scrolled back up to check the slot", ["Checkout", "Delivery slot"], true],
  ["jonas", 5, "Didn't understand substitutions, left the default and got oat milk instead of milk", ["Substitutions"], false],
  ["jonas", 7, "Wants one summary screen: time, address, total — then he'd just press pay", ["Checkout", "Idea"], false],
];
const FINDINGS: Array<[string, number[]]> = [
  ["The delivery slot disappears at payment, so people stop to re-check it", [1, 6, 2]],
  ["“Substitutions” reads as extra work and gets skipped", [3, 7]],
  ["People want one confirmation screen with slot, address and total", [4, 8]],
];
const PEOPLE: Record<SessionId, { participant: string; scope: "share" | "team"; type: string }> = {
  maya: { participant: "Maya", scope: "share", type: "video/mp4" },
  jonas: { participant: "Jonas", scope: "team", type: "audio/mp4" },
};

export interface Sample {
  readonly workspace: Workspace;
  readonly media: ReadonlyArray<{ recordingId: string; blob: Blob }>;
}
/**
 * The sample study: two short synthetic interviews (generated voices, no real participants) about a
 * grocery checkout, with notes, tags, three findings and a reel — added to whatever the study already holds.
 */
export async function buildSample(ws: Workspace, base: string, id: () => string, now = new Date()): Promise<Sample | { error: string }> {
  const media: Array<{ recordingId: string; blob: Blob }> = [];
  const recordings = new Map<SessionId, Recording>();
  let next = ws;
  for (const session of Object.keys(lines) as SessionId[]) {
    const info = lines[session];
    const response = await fetch(`${base}samples/${info.file}`);
    if (!response.ok) return { error: "The sample recordings couldn't be downloaded. Check the connection and try again." };
    const blob = await response.blob();
    const person = PEOPLE[session];
    const made = createRecording({
      file: { name: info.file, type: person.type, size: blob.size }, kind: person.type.startsWith("video") ? "video" : "audio",
      durationMs: info.durationMs, fingerprint: await fingerprint(blob), title: info.title, participant: person.participant,
      consentGiven: true, consentDate: now.toISOString().slice(0, 10), scope: person.scope,
    }, next.recordings, id(), now);
    if (!made.ok) return { error: made.error.code === "duplicate" ? "The sample study is already here." : made.error.message };
    const recording: Recording = { ...made.value, sample: true };
    recordings.set(session, recording);
    next = { ...next, recordings: [...next.recordings, recording] };
    media.push({ recordingId: recording.id, blob });
  }
  const noteIds: string[] = [];
  for (const [session, index, text, tags, range] of NOTES) {
    const line = lines[session].lines[index];
    const noteId = id();
    const added = addNote(next, { recordingId: recordings.get(session)!.id, start: line.start, end: range ? line.end : line.start, text }, noteId, now);
    if (!added.ok) return { error: added.error.message };
    next = added.value;
    for (const name of tags) {
      const tag = ensureTag(next, name, id());
      if (!tag.ok) return { error: tag.error.message };
      const tagged = toggleTag(tag.value.workspace, noteId, tag.value.tag.id);
      if (!tagged.ok) return { error: tagged.error.message };
      next = tagged.value;
    }
    noteIds.push(noteId);
  }
  for (const [title, evidence] of FINDINGS) {
    const made = createFinding(next, title, id(), now, evidence.map(i => noteIds[i]));
    if (!made.ok) return { error: made.error.message };
    next = made.value.workspace;
  }
  const reel = createReel(next, "Slot anxiety at payment", id(), now);
  if (!reel.ok) return { error: reel.error.message };
  next = reel.value.workspace;
  for (const i of [1, 6, 2]) {
    const clip = addClip(next, reel.value.reel.id, { noteId: noteIds[i] }, id());
    if (!clip.ok) return { error: clip.error.message };
    next = clip.value;
  }
  return { workspace: next, media };
}
