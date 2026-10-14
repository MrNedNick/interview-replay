import { createRecording, type ConsentScope, type Recording } from "../../src/domain/01-import";
import { addNote } from "../../src/domain/02-notes";
import { EMPTY_WORKSPACE, type Workspace } from "../../src/domain/workspace";

export const NOW = new Date("2026-10-14T10:00:00Z");
export const HOUR = 60 * 60 * 1000;

export function recording(id: string, participant: string, durationMs = 60_000, scope: ConsentScope = "share"): Recording {
  const made = createRecording({
    file: { name: `${id}.mp4`, type: "video/mp4", size: 1000 + id.length },
    kind: "video", durationMs, fingerprint: `fp-${id}`, title: `Session ${id}`, participant,
    consentGiven: true, consentDate: "2026-10-01", scope,
  }, [], id, NOW);
  if (!made.ok) throw new Error(made.error.message);
  return made.value;
}

/** Two participants, two notes each — the smallest study with a pattern across people. */
export function study(): Workspace {
  let ws: Workspace = { ...EMPTY_WORKSPACE, recordings: [recording("r1", "Maya Rivera"), recording("r2", "Jonas", 45_000, "team")] };
  const notes: Array<[string, string, number, number, string]> = [
    ["n1", "r1", 18_000, 18_000, "Maya expected the delivery time before paying"],
    ["n2", "r1", 40_000, 46_000, "Skipped substitutions — “sounds like extra work”"],
    ["n3", "r2", 9_000, 9_000, "Scrolled back up to check the slot"],
    ["n4", "r2", 25_000, 30_000, "Didn't understand substitutions; got oat milk"],
  ];
  for (const [id, recordingId, start, end, text] of notes) {
    const next = addNote(ws, { recordingId, start, end, text }, id, NOW);
    if (!next.ok) throw new Error(next.error.message);
    ws = next.value;
  }
  return ws;
}

/** An hour-long interview with a note every 1.2 seconds: 3,000 notes. */
export function hourLong(): Workspace {
  const r = recording("long", "Ana", HOUR);
  const notes = Array.from({ length: 3000 }, (_, i) => ({ id: `h${i}`, recordingId: "long", start: i * 1200, end: i * 1200 + (i % 3 === 0 ? 5000 : 0), text: `Observation ${i}`, tagIds: [], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }));
  return { ...EMPTY_WORKSPACE, recordings: [r], notes };
}
