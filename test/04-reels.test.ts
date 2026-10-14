import { describe, expect, it } from "vitest";
import { addClip, clipFromNote, createReel, deleteReel, moveClip, nextPlayable, playbackPlan, reelDuration, reelPosition, removeClip, trimClip, withheldClips } from "../src/domain/04-reels";
import type { Workspace } from "../src/domain/workspace";
import { NOW, recording, study } from "./fixtures/study";

function withReel(): Workspace {
  const made = createReel(study(), "Substitutions confusion", "reel", NOW);
  if (!made.ok) throw new Error(made.error.message);
  let ws = made.value.workspace;
  for (const [id, noteId] of [["c1", "n2"], ["c2", "n4"], ["c3", "n1"]]) {
    const next = addClip(ws, "reel", { noteId }, id);
    if (!next.ok) throw new Error(next.error.message);
    ws = next.value;
  }
  return ws;
}

describe("reels contract", () => {
  it("cuts a clip around a point note and uses a range note as it is, inside the recording", () => {
    const r = recording("x", "A", 20_000);
    expect(clipFromNote({ start: 18_000, end: 18_000 }, r)).toEqual({ start: 16_000, end: 20_000 });
    expect(clipFromNote({ start: 500, end: 500 }, r)).toEqual({ start: 0, end: 12_000 });
    expect(clipFromNote({ start: 4000, end: 9000 }, r)).toEqual({ start: 4000, end: 9000 });
  });
  it("adds clips from notes with their text as caption, once per reel", () => {
    const ws = withReel();
    expect(ws.reels[0].clips.map(c => [c.recordingId, c.start, c.end])).toEqual([["r1", 40_000, 46_000], ["r2", 25_000, 30_000], ["r1", 16_000, 28_000]]);
    expect(ws.reels[0].clips[1].caption).toBe("Didn't understand substitutions; got oat milk");
    expect(addClip(ws, "reel", { noteId: "n2" }, "dup")).toMatchObject({ ok: false, error: { code: "clip-exists" } });
    expect(reelDuration(ws.reels[0])).toBe(23_000);
  });
  it("refuses empty titles, too-short, too-long and past-the-end clips", () => {
    expect(createReel(study(), "  ", "x", NOW)).toMatchObject({ ok: false, error: { code: "title-empty" } });
    const ws = withReel();
    expect(trimClip(ws, "reel", "c1", { end: 40_500 })).toMatchObject({ ok: false, error: { code: "clip-too-short" } });
    expect(trimClip(ws, "reel", "c1", { end: 61_000 })).toMatchObject({ ok: false, error: { code: "past-end" } });
    expect(addClip(ws, "reel", { recordingId: "r1", start: 0, end: 59_000 }, "c9")).toMatchObject({ ok: true });
    expect(addClip(ws, "missing", { noteId: "n3" }, "c9")).toMatchObject({ ok: false, error: { code: "unknown-reel" } });
  });
  it("reorders, trims and removes clips", () => {
    const ws = withReel();
    const moved = moveClip(ws, "reel", "c3", 0);
    expect(moved.ok && moved.value.reels[0].clips.map(c => c.id)).toEqual(["c3", "c1", "c2"]);
    expect(moveClip(ws, "reel", "c3", 5)).toMatchObject({ ok: false, error: { code: "bad-position" } });
    const trimmed = trimClip(ws, "reel", "c1", { start: 41_000, caption: "Skips the step" });
    expect(trimmed.ok && trimmed.value.reels[0].clips[0]).toMatchObject({ start: 41_000, end: 46_000, caption: "Skips the step" });
    const removed = removeClip(ws, "reel", "c2");
    expect(removed.ok && removed.value.reels[0].clips.length).toBe(2);
    expect(deleteReel(ws, "reel")).toMatchObject({ ok: true, value: { reels: [] } });
  });
  it("plays back to back, skipping clips whose media isn't available", () => {
    const ws = withReel();
    const steps = playbackPlan(ws, ws.reels[0], id => id !== "r2");
    expect(steps.map(s => [s.offset, s.playable])).toEqual([[0, true], [6000, false], [11_000, true]]);
    expect(nextPlayable(steps, 0)).toBe(2);
    expect(nextPlayable(steps, 2)).toBeNull();
    expect(reelPosition(steps, 2, 20_000)).toBe(15_000);
  });
  it("keeps clips without consent to share out of anything shared", () => {
    const ws = withReel();
    expect(withheldClips(ws, ws.reels[0]).map(c => c.id)).toEqual(["c2"]);
  });
});
