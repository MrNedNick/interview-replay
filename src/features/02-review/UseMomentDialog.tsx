import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/button/button";
import { Input } from "../../components/input/input";
import { Modal } from "../../components/modal/modal";
import { Select } from "../../components/select/select";
import { useToast } from "../../components/toast/toast";
import { ok } from "../../domain/01-import";
import { formatSegment } from "../../domain/02-notes";
import { addClip, createReel } from "../../domain/04-reels";
import { createFinding, findingsCiting, linkEvidence } from "../../domain/05-findings";
import { href } from "../../app/route";
import { newId, useStudy } from "../../app/study";

/** Puts a note to use: as a clip in a reel, or as evidence for a finding — existing or new. */
export function UseMomentDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { workspace, apply } = useStudy();
  const toast = useToast();
  const note = workspace.notes.find(n => n.id === noteId);
  const [reelId, setReelId] = useState("");
  const [reelTitle, setReelTitle] = useState("");
  const [findingId, setFindingId] = useState("");
  const [findingTitle, setFindingTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!note) return null;
  const cited = findingsCiting(workspace, note.id);
  const inReels = workspace.reels.filter(r => r.clips.some(c => c.noteId === note.id));
  const freeReels = workspace.reels.filter(r => !inReels.includes(r));
  const freeFindings = workspace.findings.filter(f => !cited.includes(f));

  async function toReel(event: FormEvent) {
    event.preventDefault();
    const clipId = newId();
    let target = reelId || freeReels[0]?.id || "";
    let title = workspace.reels.find(r => r.id === target)?.title ?? "";
    const refused = await apply(ws => {
      let next = ws;
      if (reelTitle.trim() || !target) {
        const made = createReel(ws, reelTitle, newId(), new Date());
        if (!made.ok) return made;
        next = made.value.workspace; target = made.value.reel.id; title = made.value.reel.title;
      }
      return addClip(next, target, { noteId: note!.id }, clipId);
    });
    if (refused) { setError(refused.message); return; }
    toast.success(`Added to “${title}”.`);
    setReelTitle("");
    onClose();
  }
  async function toFinding(event: FormEvent) {
    event.preventDefault();
    let title = workspace.findings.find(f => f.id === (findingId || freeFindings[0]?.id))?.title ?? "";
    const refused = await apply(ws => {
      if (findingTitle.trim() || freeFindings.length === 0) {
        const made = createFinding(ws, findingTitle, newId(), new Date(), [note!.id]);
        if (!made.ok) return made;
        title = made.value.finding.title;
        return ok(made.value.workspace);
      }
      return linkEvidence(ws, findingId || freeFindings[0].id, note!.id, new Date());
    });
    if (refused) { setError(refused.message); return; }
    toast.success(`Now evidence for “${title}”.`);
    setFindingTitle("");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Use the moment at ${formatSegment(note)}`} size="md">
      <p className="mb-4 line-clamp-3 text-sm text-text-muted">{note.text}</p>
      <form onSubmit={toFinding} className="space-y-2 border-b border-border pb-4">
        <h3 className="text-sm font-semibold">Evidence for a finding</h3>
        {cited.length > 0 && <p className="text-xs text-text-muted">Already supports: {cited.map(f => f.title).join("; ")}</p>}
        {freeFindings.length > 0 && (
          <Select value={findingId || freeFindings[0].id} onChange={e => { setFindingId(e.target.value); setFindingTitle(""); }} aria-label="Finding">
            {freeFindings.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </Select>
        )}
        <Input value={findingTitle} onChange={e => setFindingTitle(e.target.value)} placeholder={freeFindings.length ? "…or state a new finding" : "State a new finding"} aria-label="New finding" maxLength={140} />
        <Button type="submit" size="sm" disabled={freeFindings.length === 0 && !findingTitle.trim()}>{findingTitle.trim() || freeFindings.length === 0 ? "Create finding" : "Link as evidence"}</Button>
      </form>
      <form onSubmit={toReel} className="space-y-2 pt-4">
        <h3 className="text-sm font-semibold">Clip in a reel</h3>
        {inReels.length > 0 && <p className="text-xs text-text-muted">Already in: {inReels.map(r => <a key={r.id} className="underline" href={href.reels(r.id)}>{r.title}</a>).reduce<ReactNode[]>((all, link, i) => (i ? [...all, ", ", link] : [link]), [])}</p>}
        {freeReels.length > 0 && (
          <Select value={reelId || freeReels[0].id} onChange={e => { setReelId(e.target.value); setReelTitle(""); }} aria-label="Reel">
            {freeReels.map(r => <option key={r.id} value={r.id}>{r.title} · {r.clips.length} clips</option>)}
          </Select>
        )}
        <Input value={reelTitle} onChange={e => setReelTitle(e.target.value)} placeholder={freeReels.length ? "…or name a new reel" : "Name a new reel"} aria-label="New reel" maxLength={80} />
        <Button type="submit" size="sm" disabled={freeReels.length === 0 && !reelTitle.trim()}>{reelTitle.trim() || freeReels.length === 0 ? "Create reel" : "Add clip"}</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
