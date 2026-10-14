import { useMemo, useState, type FormEvent } from "react";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { EmptyState } from "../../components/empty-state/empty-state";
import { Input } from "../../components/input/input";
import { Modal } from "../../components/modal/modal";
import { formatSegment, type Annotation } from "../../domain/02-notes";
import { parseQuery, search } from "../../domain/03-tags";
import { clipFromNote } from "../../domain/04-reels";
import { createFinding, deleteFinding, editFinding, evidenceOf, linkEvidence, moveFinding, strengthOf, unlinkEvidence, type Finding, type Strength } from "../../domain/05-findings";
import type { Recording } from "../../domain/01-import";
import { href } from "../../app/route";
import { newId, useStudy } from "../../app/study";
import { Player } from "../02-review/Player";

const SUPPORT: Record<Strength["support"], { tone: "success" | "warning" | "danger"; text: (s: Strength) => string }> = {
  pattern: { tone: "success", text: s => `Pattern · ${s.participants} participants · ${s.moments} moments` },
  single: { tone: "warning", text: s => `One participant · ${s.moments} ${s.moments === 1 ? "moment" : "moments"}` },
  none: { tone: "danger", text: () => "No evidence yet" },
};

/** What the study concluded, each finding with the moments that show it — and how many people those come from. */
export function FindingsPage() {
  const { workspace, apply } = useStudy();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moment, setMoment] = useState<{ note: Annotation; recording: Recording } | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    const refused = await apply(ws => { const made = createFinding(ws, title, newId(), new Date()); return made.ok ? { ok: true, value: made.value.workspace } : made; });
    if (refused) { setError(refused.message); return; }
    setTitle(""); setError(null);
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Findings</h1>
        <p className="mt-1 max-w-xl text-sm text-text-muted">State what you learned and cite the moments that show it. A finding heard from two or more people is a pattern; from one, an anecdote worth checking.</p>
      </div>
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="State a finding — e.g. people skip the substitutions step" aria-label="New finding" maxLength={140} className="sm:flex-1" />
        <Button type="submit" disabled={!title.trim()}>Add finding</Button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {workspace.findings.length === 0 ? (
        <EmptyState title="No findings yet" description="Write one here, or pick a note in an interview and choose “Use…” → Evidence for a finding." />
      ) : (
        <ol className="space-y-4">
          {workspace.findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} count={workspace.findings.length} onPlay={setMoment} />)}
        </ol>
      )}
      {moment && (
        <Modal open onClose={() => setMoment(null)} title={`${moment.recording.consent.participant} · ${formatSegment(moment.note)}`} size="lg"
          actions={<><a href={href.review(moment.recording.id, moment.note.start)} className="mr-auto text-sm text-accent underline">Open in the interview</a><Button size="sm" variant="outline" onClick={() => setMoment(null)}>Close</Button></>}>
          <MomentPlayer note={moment.note} recording={moment.recording} />
        </Modal>
      )}
    </div>
  );
}

function MomentPlayer({ note, recording }: { note: Annotation; recording: Recording }) {
  const { mediaStatus } = useStudy();
  const clip = clipFromNote(note, recording);
  return (
    <div className="space-y-3">
      {mediaStatus(recording.id) === "missing"
        ? <p className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">The file for “{recording.title}” isn't in this browser. Open the interview to choose it.</p>
        : <Player recording={recording} startAt={clip.start} stopAt={clip.end} autoPlay onTime={() => undefined} compact />}
      <blockquote className="border-l-2 border-accent pl-3 text-sm">{note.text}</blockquote>
    </div>
  );
}

function FindingCard({ finding, index, count, onPlay }: { finding: Finding; index: number; count: number; onPlay: (moment: { note: Annotation; recording: Recording }) => void }) {
  const { workspace, apply } = useStudy();
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidence = useMemo(() => evidenceOf(workspace, finding), [workspace, finding]);
  const strength = useMemo(() => strengthOf(workspace, finding), [workspace, finding]);
  const support = SUPPORT[strength.support];
  const run = async (change: Parameters<typeof apply>[0]) => { const refused = await apply(change); setError(refused?.message ?? null); return refused; };

  return (
    <li className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-1 text-sm font-semibold text-text-muted tabular-nums">{index + 1}.</span>
        <textarea defaultValue={finding.title} key={finding.title} aria-label={`Finding ${index + 1}`} maxLength={140} rows={1}
          onBlur={e => { const input = e.currentTarget; if (input.value.trim() !== finding.title) void run(ws => editFinding(ws, finding.id, { title: input.value }, new Date())).then(refused => { if (refused) input.value = finding.title; }); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          className="min-w-0 flex-1 resize-none rounded-md border border-transparent bg-transparent px-1 font-semibold [field-sizing:content] hover:border-border focus:border-accent focus:outline-none" />
        <Badge tone={support.tone}>{support.text(strength)}</Badge>
      </div>
      <textarea defaultValue={finding.detail} key={finding.detail} aria-label={`Detail for finding ${index + 1}`} placeholder="Why it matters, what to try…" maxLength={4000} rows={2}
        onBlur={e => { if (e.target.value.trim() !== finding.detail) void run(ws => editFinding(ws, finding.id, { detail: e.target.value }, new Date())); }}
        className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm [field-sizing:content] focus:border-accent focus:outline-none" />
      {evidence.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Evidence">
          {evidence.map(({ note, recording }) => (
            <li key={note.id} className="flex gap-3 rounded-md bg-surface-raised p-2.5">
              <Button size="sm" variant="ghost" className="shrink-0 tabular-nums text-accent" onClick={() => onPlay({ note, recording })} aria-label={`Play ${recording.consent.participant} at ${formatSegment(note)}`}>▶ {formatSegment(note)}</Button>
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">“{note.text}”</p>
                <p className="mt-0.5 text-xs text-text-muted">{recording.consent.participant} · <a className="underline" href={href.review(recording.id, note.start)}>{recording.title}</a></p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void run(ws => unlinkEvidence(ws, finding.id, note.id, new Date()))} aria-label={`Remove this moment from finding ${index + 1}`}>×</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setPicking(true)}>Add evidence</Button>
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => void run(ws => moveFinding(ws, finding.id, index - 1))} aria-label={`Move finding ${index + 1} up`}>↑</Button>
        <Button size="sm" variant="ghost" disabled={index === count - 1} onClick={() => void run(ws => moveFinding(ws, finding.id, index + 1))} aria-label={`Move finding ${index + 1} down`}>↓</Button>
        <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: "Delete this finding?", description: "The notes it cites stay.", confirmLabel: "Delete finding", variant: "danger" })) void run(ws => deleteFinding(ws, finding.id)); }}>Delete</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      {picking && <EvidencePicker finding={finding} onClose={() => setPicking(false)} />}
    </li>
  );
}

/** Finds notes across all interviews to cite — the same search as the Search page. */
function EvidencePicker({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const { workspace, apply } = useStudy();
  const [text, setText] = useState("");
  const hits = useMemo(() => {
    const query = parseQuery(text, workspace.tags);
    const all = query.terms.length || query.tagIds.length ? search(workspace, query) : workspace.notes.map(note => ({ note, recording: workspace.recordings.find(r => r.id === note.recordingId)! })).filter(h => h.recording);
    return all.filter(h => !finding.evidence.includes(h.note.id)).slice(0, 50);
  }, [workspace, text, finding.evidence]);
  return (
    <Modal open onClose={onClose} title="Add evidence" size="lg" actions={<Button size="sm" variant="outline" onClick={onClose}>Done</Button>}>
      <p className="mb-2 text-sm text-text-muted">For: {finding.title}</p>
      <Input type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Search notes or #tags" aria-label="Search notes to cite" autoFocus />
      <ul className="mt-3 max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
        {hits.length === 0 && <li className="p-3 text-sm text-text-muted">No notes left to cite{text ? " for this search" : ""}.</li>}
        {hits.map(({ note, recording }) => (
          <li key={note.id} className="flex items-start gap-3 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm break-words">{note.text}</p>
              <p className="text-xs text-text-muted">{recording.consent.participant} · {recording.title} · {formatSegment(note)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void apply(ws => linkEvidence(ws, finding.id, note.id, new Date()))}>Cite</Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
