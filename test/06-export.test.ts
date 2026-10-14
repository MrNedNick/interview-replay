import { describe, expect, it } from "vitest";
import { buildReport, deleteParticipant, deleteRecording, exportStudy, notesCsv, participants, readStudy, redactText, reelMarkdown } from "../src/domain/06-export";
import { createFinding, linkEvidence } from "../src/domain/05-findings";
import { addClip, createReel } from "../src/domain/04-reels";
import { createTag, toggleTag } from "../src/domain/03-tags";
import { restoreWorkspace, WORKSPACE_VERSION, type Workspace } from "../src/domain/workspace";
import { hourLong, NOW, study } from "./fixtures/study";

function full(): Workspace {
  const steps: Array<(ws: Workspace) => { ok: boolean; value?: unknown; error?: { message: string } }> = [];
  let ws = study();
  const tag = createTag(ws, "Checkout", "t1"); if (!tag.ok) throw new Error(); ws = tag.value.workspace;
  const t = toggleTag(ws, "n1", "t1"); if (!t.ok) throw new Error(); ws = t.value;
  const reel = createReel(ws, "Slot", "reel", NOW); if (!reel.ok) throw new Error(); ws = reel.value.workspace;
  for (const [id, noteId] of [["c1", "n1"], ["c2", "n3"]]) { const c = addClip(ws, "reel", { noteId }, id); if (!c.ok) throw new Error(c.error.message); ws = c.value; }
  const f = createFinding(ws, "Maya and Jonas lose the slot", "f1", NOW, ["n1", "n3"]); if (!f.ok) throw new Error(); ws = f.value.workspace;
  const l = linkEvidence(ws, "f1", "n2", NOW); if (!l.ok) throw new Error(); ws = l.value;
  void steps;
  return ws;
}

describe("study file", () => {
  it("round-trips the whole study exactly", () => {
    const ws = full();
    const read = readStudy(exportStudy(ws, NOW));
    expect(read.ok && read.value).toEqual({ workspace: ws, repaired: 0 });
  });
  it("refuses other files, newer versions and damaged studies with distinct errors", () => {
    expect(readStudy("not json")).toMatchObject({ ok: false, error: { code: "not-json" } });
    expect(readStudy('{"hello":1}')).toMatchObject({ ok: false, error: { code: "not-a-study" } });
    const newer = JSON.parse(exportStudy(full(), NOW)); newer.version = WORKSPACE_VERSION + 1;
    expect(readStudy(JSON.stringify(newer))).toMatchObject({ ok: false, error: { code: "newer-version" } });
    const damaged = JSON.parse(exportStudy(full(), NOW)); damaged.notes[0].start = -5;
    expect(readStudy(JSON.stringify(damaged))).toMatchObject({ ok: false, error: { code: "damaged" } });
    const twice = JSON.parse(exportStudy(full(), NOW)); twice.notes.push(twice.notes[0]);
    expect(readStudy(JSON.stringify(twice))).toMatchObject({ ok: false, error: { code: "damaged" } });
  });
  it("reads a study saved before reels and findings existed, and drops dangling references", () => {
    const { reels: _r, findings: _f, ...older } = study();
    expect(restoreWorkspace(older)).toMatchObject({ ok: true, value: { workspace: { reels: [], findings: [] }, repaired: 0 } });
    const dangling = { ...full(), tags: [] };
    const restored = restoreWorkspace(dangling);
    expect(restored.ok && restored.value.repaired).toBe(1);
    expect(restored.ok && restored.value.workspace.notes.every(n => n.tagIds.length === 0)).toBe(true);
  });
  it("exports an hour-long study with 3,000 notes quickly", () => {
    const ws = hourLong();
    const started = performance.now();
    const read = readStudy(exportStudy(ws, NOW));
    expect(read.ok && read.value.workspace.notes.length).toBe(3000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("personal data in exports", () => {
  it("replaces names — whole and in parts — with participant codes", () => {
    const ws = full();
    expect(redactText("Maya told Jonas; maya rivera agreed. Mayan ruins stay.", ws)).toBe("P1 told P2; P1 agreed. Mayan ruins stay.");
  });
  it("writes an internal report with names and every moment", () => {
    const { markdown, withheld } = buildReport(full(), { shareable: false }, NOW);
    expect(withheld).toBe(0);
    expect(markdown).toContain("### 1. Maya and Jonas lose the slot");
    expect(markdown).toContain("_2 participants · 3 moments_");
    expect(markdown).toContain("> — Jonas, Session r2 at 0:09");
    expect(markdown).toContain("> — Maya Rivera, Session r1 at 0:40–0:46");
  });
  it("writes a shareable report with codes, leaving out team-only consent and saying so", () => {
    const { markdown, withheld } = buildReport(full(), { shareable: true }, NOW);
    expect(withheld).toBe(1);
    expect(markdown).not.toMatch(/Maya|Jonas/);
    expect(markdown).toContain("### 1. P1 and P2 lose the slot");
    expect(markdown).toContain("> P1 expected the delivery time before paying");
    expect(markdown).toContain("1 recording · 1 participant");
    expect(markdown).toContain("_2 participants · 3 moments · 1 not quoted for consent_");
    expect(markdown).toContain("_1 moment not quoted: the participant agreed to team review only._");
  });
  it("lists a reel's clips for sharing without names or team-only clips", () => {
    const ws = full();
    expect(reelMarkdown(ws, ws.reels[0], { shareable: false })).toBe("# Slot\n\n1. Maya Rivera, Session r1 · 0:16–0:28 — Maya expected the delivery time before paying\n2. Jonas, Session r2 · 0:07–0:19 — Scrolled back up to check the slot\n");
    expect(reelMarkdown(ws, ws.reels[0], { shareable: true })).toBe("# Slot\n\n1. P1, Session r1 · 0:16–0:28 — P1 expected the delivery time before paying\n\n_1 clip left out: the participant agreed to team review only._\n");
  });
  it("escapes markup in user text and neutralises spreadsheet formulas", () => {
    const ws = { ...full(), notes: full().notes.map(n => (n.id === "n1" ? { ...n, text: "=HYPERLINK(\"x\") <b>#1</b>" } : n)) };
    expect(buildReport(ws, { shareable: false }, NOW).markdown).toContain("> =HYPERLINK(\"x\") \\<b\\>\\#1\\</b\\>");
    const csv = notesCsv(ws, { shareable: false });
    expect(csv.split("\r\n")[0]).toBe("recording,participant,start,end,note,tags");
    expect(csv).toContain(`Session r1,Maya Rivera,0:18,0:18,"'=HYPERLINK(""x"") <b>#1</b>",Checkout`);
    expect(notesCsv(ws, { shareable: true })).not.toContain("Session r2");
  });
});

describe("deleting a participant's data", () => {
  it("removes their recordings, notes, clips and citations, and keeps the findings", () => {
    const ws = full();
    const removal = deleteParticipant(ws, "  JONAS ");
    expect(removal.ok).toBe(true);
    if (!removal.ok) return;
    const { workspace, recordingIds, notes, clips, evidence, mentions } = removal.value;
    expect([recordingIds, notes, clips, evidence, mentions]).toEqual([["r2"], 2, 1, 1, 1]);
    expect(workspace.findings[0].title).toBe("Maya and a removed participant lose the slot");
    expect(workspace.recordings.map(r => r.id)).toEqual(["r1"]);
    expect(workspace.findings[0].evidence).toEqual(["n1", "n2"]);
    expect(JSON.stringify(workspace)).not.toContain("Jonas");
    expect(participants(workspace).map(p => p.name)).toEqual(["Maya Rivera"]);
  });
  it("doesn't scrub a name someone remaining shares", () => {
    const base = full();
    const ws = { ...base, recordings: base.recordings.map(r => (r.id === "r2" ? { ...r, consent: { ...r.consent, participant: "Maya Chen" } } : r)) };
    const removal = deleteParticipant(ws, "Maya Chen");
    expect(removal.ok && removal.value.workspace.findings[0].title).toBe("Maya and Jonas lose the slot");
  });
  it("refuses what is already gone", () => {
    expect(deleteParticipant(full(), "Nobody")).toMatchObject({ ok: false, error: { code: "unknown-participant" } });
    expect(deleteRecording(full(), "gone")).toMatchObject({ ok: false, error: { code: "unknown-recording" } });
  });
});
