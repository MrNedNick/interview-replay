import { clean, fail, formatTime, ok, type Recording, type Result } from "./01-import";
import { formatSegment, type Annotation } from "./02-notes";
import { evidenceOf, strengthOf } from "./05-findings";
import type { Reel } from "./04-reels";
import { restoreWorkspace, WORKSPACE_VERSION, type Restored, type RestoreError, type Workspace } from "./workspace";

export const STUDY_FORMAT = "interview-replay-study";
export const MAX_STUDY_BYTES = 20 * 1024 * 1024;

/**
 * The study as one file: recordings' metadata, notes, tags, reels and findings. Media is not inside —
 * each recording carries its fingerprint, so the same files can be reconnected wherever the study is opened.
 */
export function exportStudy(ws: Workspace, now: Date): string {
  return JSON.stringify({ format: STUDY_FORMAT, exportedAt: now.toISOString(), ...ws, version: WORKSPACE_VERSION }, null, 2);
}

export type StudyError = RestoreError | "not-json" | "not-a-study" | "too-large";
export function readStudy(text: string): Result<Restored, StudyError> {
  if (text.length > MAX_STUDY_BYTES) return fail("too-large", "This file is too large to be a study export.");
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, "")); } catch { return fail("not-json", "This file isn't a study export — it can't be read as JSON."); }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== STUDY_FORMAT) return fail("not-a-study", "This JSON file wasn't exported from Interview Replay.");
  return restoreWorkspace(raw);
}

/** Participants as a report outside the team names them: P1, P2… in the order they were first recorded. */
export function participantCodes(ws: Workspace): Map<string, string> {
  const codes = new Map<string, string>();
  for (const r of ws.recordings) {
    const key = participantKey(r.consent.participant);
    if (!codes.has(key)) codes.set(key, `P${codes.size + 1}`);
  }
  return codes;
}
export const participantKey = (name: string) => clean(name).toLocaleLowerCase();

/** A participant's name, whole and each part of it, paired with what replaces it. */
function nameVariants(name: string, replacement: string): Array<[string, string]> {
  const full = clean(name);
  const variants: Array<[string, string]> = [[full, replacement]];
  for (const part of full.split(/[\s.]+/)) if (part.length >= 2 && !/^p\d+$/i.test(part)) variants.push([part, replacement]);
  return variants;
}
function replaceNames(text: string, names: Array<[string, string]>): string {
  let result = text;
  for (const [name, replacement] of [...names].sort((a, b) => b[0].length - a[0].length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), replacement);
  }
  return result;
}
/** Replaces the participant's name — whole, and each part of it — with their code, wherever it appears. */
export function redactText(text: string, ws: Workspace): string {
  const codes = participantCodes(ws);
  return replaceNames(text, ws.recordings.flatMap(r => nameVariants(r.consent.participant, codes.get(participantKey(r.consent.participant))!)));
}

export interface ReportOptions {
  /**
   * For readers outside the team: participants become P1, P2… in every line, and moments from recordings
   * whose consent covers team review only are left out (and counted, so the gap is visible).
   */
  readonly shareable: boolean;
}
/** The findings with their evidence — each quote with who said it and the moment to replay — as Markdown. */
export function buildReport(ws: Workspace, options: ReportOptions, now: Date, title = "Interview findings"): { markdown: string; withheld: number } {
  const codes = participantCodes(ws);
  const who = (r: Recording) => (options.shareable ? codes.get(participantKey(r.consent.participant))! : clean(r.consent.participant));
  const text = (t: string) => (options.shareable ? redactText(t, ws) : t);
  const allowed = (r: Recording) => !options.shareable || r.consent.scope === "share";
  const quote = (t: string) => text(t).split(/\r?\n/).map(line => `> ${escapeMd(line)}`).join("\n");
  let withheld = 0;
  const shown = ws.recordings.filter(allowed);
  const people = new Set(shown.map(r => participantKey(r.consent.participant))).size;
  const lines = [`# ${escapeMd(title)}`, "", `${now.toISOString().slice(0, 10)} · ${shown.length} ${plural(shown.length, "recording")} · ${people} ${plural(people, "participant")}${options.shareable ? " · names replaced with codes" : ""}`, ""];
  lines.push("## Findings", "");
  if (ws.findings.length === 0) lines.push("_No findings yet._", "");
  ws.findings.forEach((finding, index) => {
    const strength = strengthOf(ws, finding);
    const evidence = evidenceOf(ws, finding);
    const hidden = evidence.filter(item => !allowed(item.recording)).length;
    withheld += hidden;
    lines.push(`### ${index + 1}. ${escapeMd(text(finding.title))}`, "", `_${strength.participants} ${plural(strength.participants, "participant")} · ${strength.moments} ${plural(strength.moments, "moment")}${hidden ? ` · ${hidden} not quoted for consent` : ""}_`, "");
    if (finding.detail) lines.push(escapeMd(text(finding.detail)), "");
    for (const { note, recording } of evidence) {
      if (allowed(recording)) lines.push(quote(note.text), `> — ${escapeMd(who(recording))}, ${escapeMd(text(recording.title))} at ${formatSegment(note)}`, "");
    }
  });
  lines.push("## Recordings", "");
  for (const r of shown) {
    lines.push(`- ${escapeMd(text(r.title))} — ${escapeMd(who(r))}, ${formatTime(r.media.durationMs)}, consent ${r.consent.date} (${r.consent.scope === "share" ? "clips may be shared" : "team review only"})${r.sample ? ", synthetic sample" : ""}`);
  }
  if (withheld > 0) lines.push("", `_${withheld} ${plural(withheld, "moment")} not quoted: the participant agreed to team review only._`);
  return { markdown: lines.join("\n") + "\n", withheld };
}

/** A reel as a list of moments to replay — for sharing it is coded and limited to clips with consent to share. */
export function reelMarkdown(ws: Workspace, reel: Reel, options: ReportOptions): string {
  const codes = participantCodes(ws);
  const lines = [`# ${escapeMd(options.shareable ? redactText(reel.title, ws) : reel.title)}`, ""];
  let withheld = 0, number = 0;
  for (const clip of reel.clips) {
    const r = ws.recordings.find(rec => rec.id === clip.recordingId);
    if (!r) continue;
    if (options.shareable && r.consent.scope !== "share") { withheld++; continue; }
    const who = options.shareable ? codes.get(participantKey(r.consent.participant))! : clean(r.consent.participant);
    const title = options.shareable ? redactText(r.title, ws) : r.title;
    const caption = options.shareable ? redactText(clip.caption, ws) : clip.caption;
    lines.push(`${++number}. ${escapeMd(who)}, ${escapeMd(title)} · ${formatSegment(clip)}${caption ? ` — ${escapeMd(caption)}` : ""}`);
  }
  if (number === 0) lines.push("_No clips can be shared._");
  if (withheld > 0) lines.push("", `_${withheld} ${plural(withheld, "clip")} left out: the participant agreed to team review only._`);
  return lines.join("\n") + "\n";
}

/** Every note as a spreadsheet row. Cells that a spreadsheet would run as a formula are made inert. */
export function notesCsv(ws: Workspace, options: ReportOptions): string {
  const codes = participantCodes(ws);
  const tags = new Map(ws.tags.map(t => [t.id, t.name]));
  const rows = [["recording", "participant", "start", "end", "note", "tags"]];
  for (const r of ws.recordings) {
    if (options.shareable && r.consent.scope !== "share") continue;
    const who = options.shareable ? codes.get(participantKey(r.consent.participant))! : r.consent.participant;
    for (const n of ws.notes.filter(note => note.recordingId === r.id).sort((a, b) => a.start - b.start))
      rows.push([options.shareable ? redactText(r.title, ws) : r.title, who, formatTime(n.start), formatTime(n.end), options.shareable ? redactText(n.text, ws) : n.text, n.tagIds.map(id => tags.get(id) ?? "").filter(Boolean).join("; ")]);
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface Removal {
  readonly workspace: Workspace;
  readonly recordingIds: readonly string[];
  readonly notes: number;
  readonly clips: number;
  readonly evidence: number;
  /** Mentions of a removed participant's name left in the team's own text, replaced by "a removed participant". */
  readonly mentions: number;
}
export type RemovalError = "unknown-recording" | "unknown-participant";
/**
 * Removes recordings and everything that came from them: notes, clips in reels, citations in findings.
 * Findings themselves stay — what the team concluded isn't the participant's data — but lose that support.
 * The caller deletes the stored media for `recordingIds`.
 */
export function removeRecordings(ws: Workspace, recordingIds: readonly string[]): Removal {
  const gone = new Set(recordingIds);
  const goneNotes = new Set(ws.notes.filter(n => gone.has(n.recordingId)).map(n => n.id));
  let clips = 0, evidence = 0;
  const reels = ws.reels.map(reel => {
    const kept = reel.clips.filter(c => !gone.has(c.recordingId));
    clips += reel.clips.length - kept.length;
    return kept.length === reel.clips.length ? reel : { ...reel, clips: kept };
  });
  const findings = ws.findings.map(f => {
    const kept = f.evidence.filter(e => !goneNotes.has(e));
    evidence += f.evidence.length - kept.length;
    return kept.length === f.evidence.length ? f : { ...f, evidence: kept };
  });
  const recordings = ws.recordings.filter(r => !gone.has(r.id));
  // Names of removed participants also leave the text that stays, unless someone remaining shares that name.
  const remaining = new Set(recordings.flatMap(r => nameVariants(r.consent.participant, "")).map(([name]) => name.toLocaleLowerCase()));
  const names = ws.recordings.filter(r => gone.has(r.id)).flatMap(r => nameVariants(r.consent.participant, REMOVED)).filter(([name]) => !remaining.has(name.toLocaleLowerCase()));
  let mentions = 0;
  const scrub = (text: string) => { const next = names.length ? replaceNames(text, names) : text; if (next !== text) mentions++; return next; };
  return {
    workspace: {
      ...ws,
      recordings: recordings.map(r => ({ ...r, title: scrub(r.title) })),
      notes: ws.notes.filter(n => !goneNotes.has(n.id)).map(n => ({ ...n, text: scrub(n.text) })),
      reels: reels.map(reel => ({ ...reel, title: scrub(reel.title), clips: reel.clips.map(c => ({ ...c, caption: scrub(c.caption) })) })),
      findings: findings.map(f => ({ ...f, title: scrub(f.title), detail: scrub(f.detail) })),
    },
    recordingIds: [...gone].filter(id => ws.recordings.some(r => r.id === id)),
    notes: goneNotes.size,
    clips,
    evidence,
    mentions,
  };
}
const REMOVED = "a removed participant";
export function deleteRecording(ws: Workspace, id: string): Result<Removal, RemovalError> {
  if (!ws.recordings.some(r => r.id === id)) return fail("unknown-recording", "That recording was already deleted.");
  return ok(removeRecordings(ws, [id]));
}
/** A participant's request to be forgotten: every session they were in, with everything noted about it. */
export function deleteParticipant(ws: Workspace, participant: string): Result<Removal, RemovalError> {
  const key = participantKey(participant);
  const ids = ws.recordings.filter(r => participantKey(r.consent.participant) === key).map(r => r.id);
  if (ids.length === 0) return fail("unknown-participant", "No recordings of that participant are left.");
  return ok(removeRecordings(ws, ids));
}
export function participants(ws: Workspace): Array<{ name: string; recordings: Recording[]; notes: number }> {
  const groups = new Map<string, { name: string; recordings: Recording[]; notes: number }>();
  for (const r of ws.recordings) {
    const key = participantKey(r.consent.participant);
    const group = groups.get(key) ?? { name: clean(r.consent.participant), recordings: [], notes: 0 };
    group.recordings.push(r);
    group.notes += ws.notes.filter((n: Annotation) => n.recordingId === r.id).length;
    groups.set(key, group);
  }
  return [...groups.values()];
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
/** Keeps user text from turning into Markdown structure (headings, links, HTML) in the report. */
const escapeMd = (text: string) => text.replace(/([\\`*_[\]<>#|])/g, "\\$1");
