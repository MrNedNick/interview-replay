import { describe, expect, it } from "vitest";
import { checkDuration, checkMediaFile, createRecording, fingerprintRanges, formatBytes, formatTime, matchMedia, FINGERPRINT_CHUNK, type ImportInput } from "../src/domain/01-import";
import { NOW, recording } from "./fixtures/study";

const input = (over: Partial<ImportInput> = {}): ImportInput => ({
  file: { name: "maya-session.mp4", type: "video/mp4", size: 52_000_000 }, kind: "video", durationMs: 3_540_000, fingerprint: "abc",
  title: "", participant: "  Maya  ", consentGiven: true, consentDate: "2026-10-13", scope: "team", ...over,
});

describe("import contract", () => {
  it("recognises recordings by type, and by extension when the browser gives no type", () => {
    expect(checkMediaFile({ name: "a.mp4", type: "video/mp4", size: 10 })).toEqual({ ok: true, value: "video" });
    expect(checkMediaFile({ name: "call.M4A", type: "", size: 10 })).toEqual({ ok: true, value: "audio" });
    expect(checkMediaFile({ name: "zoom.mov", type: "application/octet-stream", size: 10 })).toEqual({ ok: true, value: "video" });
  });
  it("refuses what isn't a recording with a distinct reason", () => {
    expect(checkMediaFile({ name: "notes.pdf", type: "application/pdf", size: 10 })).toMatchObject({ ok: false, error: { code: "unsupported-type" } });
    expect(checkMediaFile({ name: "a.mp3", type: "audio/mpeg", size: 0 })).toMatchObject({ ok: false, error: { code: "empty-file" } });
    expect(checkMediaFile({ name: "a.mp4", type: "video/mp4", size: 5 * 1024 ** 3 })).toMatchObject({ ok: false, error: { code: "too-large" } });
  });
  it("turns the media clock into whole milliseconds and refuses unknown or extreme lengths", () => {
    expect(checkDuration(3599.9996)).toEqual({ ok: true, value: 3_600_000 });
    expect(checkDuration(Infinity)).toMatchObject({ ok: false, error: { code: "no-duration" } });
    expect(checkDuration(Number.NaN)).toMatchObject({ ok: false, error: { code: "no-duration" } });
    expect(checkDuration(7 * 3600)).toMatchObject({ ok: false, error: { code: "too-long" } });
  });
  it("creates a recording only with consent, a participant and a real date", () => {
    const made = createRecording(input(), [], "r1", NOW);
    expect(made).toMatchObject({ ok: true, value: { id: "r1", title: "maya-session", consent: { participant: "Maya", date: "2026-10-13", scope: "team" }, media: { durationMs: 3_540_000, kind: "video" } } });
    expect(Object.isFrozen(made.ok && made.value)).toBe(true);
    expect(createRecording(input({ consentGiven: false }), [], "r1", NOW)).toMatchObject({ ok: false, error: { code: "consent-missing" } });
    expect(createRecording(input({ participant: "   " }), [], "r1", NOW)).toMatchObject({ ok: false, error: { code: "participant-missing" } });
    expect(createRecording(input({ consentDate: "2026-02-30" }), [], "r1", NOW)).toMatchObject({ ok: false, error: { code: "bad-date" } });
    expect(createRecording(input({ consentDate: "2026-10-15" }), [], "r1", NOW)).toMatchObject({ ok: false, error: { code: "bad-date" } });
  });
  it("refuses importing the same file twice and names the existing recording", () => {
    const existing = recording("x", "Maya");
    const twin = createRecording(input({ fingerprint: existing.media.fingerprint }), [existing], "r2", NOW);
    expect(twin).toMatchObject({ ok: false, error: { code: "duplicate" } });
    expect(!twin.ok && twin.error.message).toContain("Session x");
  });
  it("hashes the whole of a small file and only both ends of a large one", () => {
    expect(fingerprintRanges(100)).toEqual([[0, 100]]);
    expect(fingerprintRanges(10 * FINGERPRINT_CHUNK)).toEqual([[0, FINGERPRINT_CHUNK], [9 * FINGERPRINT_CHUNK, 10 * FINGERPRINT_CHUNK]]);
  });
});

describe("moved media", () => {
  const media = recording("r1", "Maya", 3_540_000).media;
  it("accepts the same file after a move or rename", () => {
    expect(matchMedia(media, { name: media.name, fingerprint: media.fingerprint, durationMs: media.durationMs })).toEqual({ ok: true, value: "same" });
    expect(matchMedia(media, { name: "Moved/renamed.mp4", fingerprint: media.fingerprint, durationMs: 1 })).toEqual({ ok: true, value: "renamed" });
  });
  it("treats a re-export of the same length as another version, and refuses a different recording", () => {
    expect(matchMedia(media, { name: "maya-720p.mp4", fingerprint: "other", durationMs: media.durationMs + 1500 })).toEqual({ ok: true, value: "other-version" });
    const wrong = matchMedia(media, { name: "jonas.mp4", fingerprint: "other", durationMs: 600_000 });
    expect(wrong).toMatchObject({ ok: false, error: { code: "different-media" } });
    expect(!wrong.ok && wrong.error.message).toContain("59:00");
  });
});

it("formats hour-long times and sizes for people", () => {
  expect(formatTime(3_725_000)).toBe("1:02:05");
  expect(formatTime(65_400)).toBe("1:05");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(52_000_000)).toBe("50 MB");
});
