import { describe, expect, it } from "vitest";
import { createFinding, deleteFinding, editFinding, evidenceOf, findingsCiting, linkEvidence, moveFinding, strengthOf, unlinkEvidence } from "../src/domain/05-findings";
import { deleteNote } from "../src/domain/02-notes";
import { NOW, recording, study } from "./fixtures/study";

function withFinding() {
  const made = createFinding(study(), "People lose track of the delivery slot at payment", "f1", NOW, ["n1"]);
  if (!made.ok) throw new Error(made.error.message);
  return made.value.workspace;
}

describe("findings contract", () => {
  it("states a finding and backs it with moments", () => {
    const ws = withFinding();
    expect(strengthOf(ws, ws.findings[0])).toEqual({ moments: 1, participants: 1, support: "single" });
    const linked = linkEvidence(ws, "f1", "n3", NOW);
    if (!linked.ok) throw new Error();
    expect(strengthOf(linked.value, linked.value.findings[0])).toEqual({ moments: 2, participants: 2, support: "pattern" });
    expect(evidenceOf(linked.value, linked.value.findings[0]).map(e => [e.note.id, e.recording.consent.participant])).toEqual([["n1", "Maya Rivera"], ["n3", "Jonas"]]);
    expect(findingsCiting(linked.value, "n3").map(f => f.id)).toEqual(["f1"]);
  });
  it("refuses an empty title, a deleted note and citing the same moment twice", () => {
    const ws = withFinding();
    expect(createFinding(ws, "   ", "f2", NOW)).toMatchObject({ ok: false, error: { code: "title-empty" } });
    expect(linkEvidence(ws, "f1", "gone", NOW)).toMatchObject({ ok: false, error: { code: "unknown-note" } });
    expect(linkEvidence(ws, "f1", "n1", NOW)).toMatchObject({ ok: false, error: { code: "already-linked" } });
    expect(editFinding(ws, "f1", { detail: "x".repeat(4001) }, NOW)).toMatchObject({ ok: false, error: { code: "detail-too-long" } });
  });
  it("counts two sessions with one person as one participant", () => {
    const base = withFinding();
    const ws = { ...base, recordings: [...base.recordings, recording("r3", "maya rivera")], notes: [...base.notes, { ...base.notes[0], id: "n9", recordingId: "r3" }] };
    const linked = linkEvidence(ws, "f1", "n9", NOW);
    expect(linked.ok && strengthOf(linked.value, linked.value.findings[0])).toEqual({ moments: 2, participants: 1, support: "single" });
  });
  it("loses support when its evidence is deleted, and keeps order editable", () => {
    const ws = withFinding();
    const gone = deleteNote(ws, "n1");
    expect(gone.ok && strengthOf(gone.value, gone.value.findings[0]).support).toBe("none");
    const unlinked = unlinkEvidence(ws, "f1", "n1", NOW);
    expect(unlinked.ok && unlinked.value.findings[0].evidence).toEqual([]);
    const second = createFinding(ws, "Substitutions wording is unclear", "f2", NOW);
    if (!second.ok) throw new Error();
    const moved = moveFinding(second.value.workspace, "f2", 0);
    expect(moved.ok && moved.value.findings.map(f => f.id)).toEqual(["f2", "f1"]);
    expect(deleteFinding(ws, "f1")).toMatchObject({ ok: true, value: { findings: [] } });
  });
});
