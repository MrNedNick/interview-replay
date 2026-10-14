import { describe, expect, it } from "vitest";
import { addNote, currentNote, deleteNote, editNote, fitViewport, markers, notesFor, parseTime, revealTime, ticks, timeToX, xToTime, zoomViewport } from "../src/domain/02-notes";
import { HOUR, hourLong, NOW, study } from "./fixtures/study";

describe("notes contract", () => {
  it("adds a note at a moment and keeps notes in time order", () => {
    const ws = study();
    const next = addNote(ws, { recordingId: "r1", start: 5000, end: 5000, text: "  Plans groceries on Sunday  " }, "n0", NOW);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(notesFor(next.value, "r1").map(n => n.id)).toEqual(["n0", "n1", "n2"]);
    expect(next.value.notes.find(n => n.id === "n0")?.text).toBe("Plans groceries on Sunday");
  });
  it("refuses empty text, reversed ranges and moments past the end with distinct errors", () => {
    const ws = study();
    expect(addNote(ws, { recordingId: "r1", start: 1, end: 1, text: "  " }, "x", NOW)).toMatchObject({ ok: false, error: { code: "empty-note" } });
    expect(addNote(ws, { recordingId: "r1", start: 9000, end: 8000, text: "a" }, "x", NOW)).toMatchObject({ ok: false, error: { code: "bad-segment" } });
    expect(addNote(ws, { recordingId: "r1", start: 61_000, end: 61_000, text: "a" }, "x", NOW)).toMatchObject({ ok: false, error: { code: "past-end" } });
    expect(addNote(ws, { recordingId: "gone", start: 0, end: 0, text: "a" }, "x", NOW)).toMatchObject({ ok: false, error: { code: "unknown-recording" } });
    expect(addNote(ws, { recordingId: "r1", start: 0, end: 0, text: "a".repeat(2001) }, "x", NOW)).toMatchObject({ ok: false, error: { code: "note-too-long" } });
  });
  it("edits text and moves a point note as a point", () => {
    const ws = study();
    const moved = editNote(ws, "n1", { start: 20_000 }, NOW);
    expect(moved.ok && moved.value.notes.find(n => n.id === "n1")).toMatchObject({ start: 20_000, end: 20_000 });
    expect(editNote(ws, "n2", { start: 50_000 }, NOW)).toMatchObject({ ok: false, error: { code: "bad-segment" } });
    expect(editNote(ws, "nope", { text: "x" }, NOW)).toMatchObject({ ok: false, error: { code: "unknown-note" } });
  });
  it("deleting a note removes it from findings and unlinks clips cut from it", () => {
    const ws = { ...study(), findings: [{ id: "f1", title: "t", detail: "", evidence: ["n1", "n3"], createdAt: "", updatedAt: "" }], reels: [{ id: "reel", title: "R", createdAt: "", clips: [{ id: "c1", recordingId: "r1", noteId: "n1", start: 16_000, end: 28_000, caption: "x" }] }] };
    const next = deleteNote(ws, "n1");
    expect(next.ok && next.value.findings[0].evidence).toEqual(["n3"]);
    expect(next.ok && next.value.reels[0].clips[0]).toMatchObject({ noteId: undefined, start: 16_000 });
  });
  it("parses times as people type them", () => {
    expect(parseTime("75")).toEqual({ ok: true, value: 75_000 });
    expect(parseTime("1:15")).toEqual({ ok: true, value: 75_000 });
    expect(parseTime("1:02:15")).toEqual({ ok: true, value: 3_735_000 });
    expect(parseTime("0:07.25")).toEqual({ ok: true, value: 7250 });
    expect(parseTime("1:75")).toMatchObject({ ok: false, error: { code: "bad-time" } });
    expect(parseTime("soon")).toMatchObject({ ok: false, error: { code: "bad-time" } });
  });
  it("highlights the note being played, held for a few seconds after a point", () => {
    const sorted = notesFor(study(), "r1");
    expect(currentNote(sorted, 17_000)).toBeNull();
    expect(currentNote(sorted, 20_000)?.id).toBe("n1");
    expect(currentNote(sorted, 30_000)).toBeNull();
    expect(currentNote(sorted, 45_000)?.id).toBe("n2");
  });
});

describe("hour-long recordings", () => {
  const ws = hourLong();
  const sorted = notesFor(ws, "long");
  it("fits the whole hour, zooms around the pointer and reveals the playhead", () => {
    const fit = fitViewport(HOUR, 1200);
    expect(fit.msPerPx).toBe(3000);
    const zoomed = zoomViewport(fit, 8, 1_800_000, HOUR);
    expect(Math.round(timeToX(zoomed, 1_800_000))).toBe(Math.round(timeToX(fit, 1_800_000)));
    expect(zoomed.msPerPx).toBe(375);
    expect(zoomViewport(zoomed, 1 / 1000, 0, HOUR)).toEqual(fit);
    const revealed = revealTime(zoomed, 3_500_000, HOUR);
    expect(3_500_000).toBeGreaterThanOrEqual(revealed.start);
    expect(3_500_000).toBeLessThanOrEqual(revealed.start + revealed.msPerPx * revealed.width);
    expect(xToTime(fit, 5000, HOUR)).toBe(HOUR);
  });
  it("labels the ruler in round steps and merges dense notes into a few hundred marks", () => {
    const fit = fitViewport(HOUR, 1200);
    expect(ticks(fit, HOUR).slice(0, 3)).toEqual([0, 300_000, 600_000]);
    const marks = markers(sorted, fit);
    expect(marks.length).toBeLessThan(250);
    expect(marks.reduce((sum, m) => sum + m.noteIds.length, 0)).toBe(3000);
    const close = markers(sorted, zoomViewport(fit, 100, 0, HOUR));
    expect(close.every(m => m.noteIds.length === 1)).toBe(true);
  });
  it("finds the current note in a 3,000-note hour quickly", () => {
    const started = performance.now();
    for (let t = 0; t < HOUR; t += 1000) currentNote(sorted, t);
    expect(performance.now() - started).toBeLessThan(200);
    expect(currentNote(sorted, 3_598_900)?.id).toBe("h2999");
  });
});
