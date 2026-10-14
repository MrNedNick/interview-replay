import { clean, fail, ok, type Recording, type Result } from "./01-import";
import type { Annotation } from "./02-notes";
import type { Workspace } from "./workspace";

/** A conclusion from the study, backed by the notes — moments in recordings — that show it. */
export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** Note ids, in the order the researcher put them. */
  readonly evidence: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
export const MAX_EVIDENCE = 50;
const MAX_TITLE = 140;
const MAX_DETAIL = 4000;

export type FindingError = "title-empty" | "title-too-long" | "detail-too-long" | "unknown-finding" | "unknown-note" | "already-linked" | "too-much-evidence" | "bad-position";

function checkTitle(title: string): Result<string, FindingError> {
  const value = clean(title);
  if (!value) return fail("title-empty", "State the finding in a sentence.");
  if (value.length > MAX_TITLE) return fail("title-too-long", `Keep the finding under ${MAX_TITLE} characters; put the rest in the detail.`);
  return ok(value);
}
export function createFinding(ws: Workspace, title: string, id: string, now: Date, evidence: readonly string[] = []): Result<{ workspace: Workspace; finding: Finding }, FindingError> {
  const value = checkTitle(title);
  if (!value.ok) return value;
  const missing = evidence.find(noteId => !ws.notes.some(n => n.id === noteId));
  if (missing) return fail("unknown-note", "One of those notes was deleted.");
  const stamp = now.toISOString();
  const finding: Finding = { id, title: value.value, detail: "", evidence: [...new Set(evidence)].slice(0, MAX_EVIDENCE), createdAt: stamp, updatedAt: stamp };
  return ok({ workspace: { ...ws, findings: [...ws.findings, finding] }, finding });
}
export function editFinding(ws: Workspace, id: string, patch: { title?: string; detail?: string }, now: Date): Result<Workspace, FindingError> {
  return update(ws, id, now, finding => {
    const title = patch.title === undefined ? ok(finding.title) : checkTitle(patch.title);
    if (!title.ok) return title;
    const detail = patch.detail === undefined ? finding.detail : patch.detail.normalize("NFC").trim();
    if (detail.length > MAX_DETAIL) return fail("detail-too-long", `Keep the detail under ${MAX_DETAIL} characters.`);
    return ok({ ...finding, title: title.value, detail });
  });
}
export function deleteFinding(ws: Workspace, id: string): Result<Workspace, FindingError> {
  if (!ws.findings.some(f => f.id === id)) return fail("unknown-finding", "That finding was already deleted.");
  return ok({ ...ws, findings: ws.findings.filter(f => f.id !== id) });
}
export function linkEvidence(ws: Workspace, findingId: string, noteId: string, now: Date): Result<Workspace, FindingError> {
  if (!ws.notes.some(n => n.id === noteId)) return fail("unknown-note", "That note was deleted.");
  return update(ws, findingId, now, finding => {
    if (finding.evidence.includes(noteId)) return fail("already-linked", `This moment already supports “${finding.title}”.`);
    if (finding.evidence.length >= MAX_EVIDENCE) return fail("too-much-evidence", `A finding cites up to ${MAX_EVIDENCE} moments — pick the clearest ones.`);
    return ok({ ...finding, evidence: [...finding.evidence, noteId] });
  });
}
export function unlinkEvidence(ws: Workspace, findingId: string, noteId: string, now: Date): Result<Workspace, FindingError> {
  return update(ws, findingId, now, finding => (finding.evidence.includes(noteId) ? ok({ ...finding, evidence: finding.evidence.filter(e => e !== noteId) }) : fail("unknown-note", "That moment isn't linked any more.")));
}
export function moveFinding(ws: Workspace, id: string, toIndex: number): Result<Workspace, FindingError> {
  const from = ws.findings.findIndex(f => f.id === id);
  if (from === -1) return fail("unknown-finding", "That finding was deleted.");
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= ws.findings.length) return fail("bad-position", "That position is outside the list.");
  const findings = [...ws.findings];
  findings.splice(toIndex, 0, ...findings.splice(from, 1));
  return ok({ ...ws, findings });
}
function update(ws: Workspace, id: string, now: Date, change: (finding: Finding) => Result<Finding, FindingError>): Result<Workspace, FindingError> {
  const finding = ws.findings.find(f => f.id === id);
  if (!finding) return fail("unknown-finding", "That finding was deleted.");
  const next = change(finding);
  if (!next.ok) return next;
  return ok({ ...ws, findings: ws.findings.map(f => (f.id === id ? { ...next.value, updatedAt: now.toISOString() } : f)) });
}

export interface EvidenceItem {
  readonly note: Annotation;
  readonly recording: Recording;
}
/** The cited moments that still exist, in the researcher's order. */
export function evidenceOf(ws: Workspace, finding: Finding): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const noteId of finding.evidence) {
    const note = ws.notes.find(n => n.id === noteId);
    const recording = note && ws.recordings.find(r => r.id === note.recordingId);
    if (note && recording) items.push({ note, recording });
  }
  return items;
}

export type Support = "none" | "single" | "pattern";
export interface Strength {
  readonly moments: number;
  readonly participants: number;
  readonly support: Support;
}
/**
 * How well a finding is backed: one participant saying something is an anecdote, two or more is a pattern.
 * Participants are counted by name, so two sessions with the same person count once.
 */
export function strengthOf(ws: Workspace, finding: Finding): Strength {
  const items = evidenceOf(ws, finding);
  const participants = new Set(items.map(item => clean(item.recording.consent.participant).toLowerCase())).size;
  return { moments: items.length, participants, support: participants === 0 ? "none" : participants === 1 ? "single" : "pattern" };
}
/** Findings citing this note — shown next to the note so its weight is visible where it was written. */
export const findingsCiting = (ws: Workspace, noteId: string) => ws.findings.filter(f => f.evidence.includes(noteId));
