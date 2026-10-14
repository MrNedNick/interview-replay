import { memo, useEffect, useRef, useState } from "react";
import { Button } from "../../components/button/button";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { cn } from "../../lib/cn";
import { formatTime, type Ms } from "../../domain/01-import";
import { deleteNote, editNote, formatSegment, parseTime, type Annotation } from "../../domain/02-notes";
import { ensureTag, toggleTag, type Tag } from "../../domain/03-tags";
import { findingsCiting } from "../../domain/05-findings";
import { newId, useStudy } from "../../app/study";
import { TagChip, TagPicker } from "../03-search/TagChip";
import { UseMomentDialog } from "./UseMomentDialog";

/** The recording's notes in time order; the one being played is marked and kept in view. */
export function NoteList({ notes, current, selected, onPlay, onSelect }: { notes: readonly Annotation[]; current: string | null; selected: string | null; onPlay: (time: Ms) => void; onSelect: (id: string) => void }) {
  const { workspace } = useStudy();
  const [using, setUsing] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const id = selected ?? current;
    if (!id) return;
    const item = list.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(id)}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected, current]);
  if (notes.length === 0) return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">No notes yet. Play the recording and type what you notice — each note is pinned to the moment you started typing.</p>;
  return (
    <>
      <ol ref={list} className="space-y-2" aria-label="Notes">
        {notes.map(note => (
          <NoteItem key={note.id} note={note} tags={workspace.tags} citations={findingsCiting(workspace, note.id).length} current={note.id === current} selected={note.id === selected} onPlay={onPlay} onSelect={onSelect} onUse={setUsing} />
        ))}
      </ol>
      <UseMomentDialog key={using} noteId={using} onClose={() => setUsing(null)} />
    </>
  );
}

const NoteItem = memo(function NoteItem({ note, tags, citations, current, selected, onPlay, onSelect, onUse }: {
  note: Annotation; tags: readonly Tag[]; citations: number; current: boolean; selected: boolean;
  onPlay: (time: Ms) => void; onSelect: (id: string) => void; onUse: (id: string) => void;
}) {
  const { apply } = useStudy();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [start, setStart] = useState(formatTime(note.start));
  const [error, setError] = useState<string | null>(null);
  const noteTags = note.tagIds.map(id => tags.find(t => t.id === id)).filter((t): t is Tag => Boolean(t));

  async function save() {
    const parsed = parseTime(start);
    if (!parsed.ok) { setError(parsed.error.message); return; }
    const moved = parsed.value !== note.start;
    const refused = await apply(ws => editNote(ws, note.id, { text, ...(moved ? { start: parsed.value, end: note.end === note.start ? parsed.value : Math.max(parsed.value, note.end + parsed.value - note.start) } : {}) }, new Date()));
    if (refused) { setError(refused.message); return; }
    setEditing(false); setError(null);
  }
  async function remove() {
    if (citations > 0 && !(await confirm({ title: "Delete this note?", description: `It is evidence for ${citations} ${citations === 1 ? "finding" : "findings"}, which will lose this support.`, confirmLabel: "Delete note", variant: "danger" }))) return;
    await apply(ws => deleteNote(ws, note.id));
  }
  const tagNote = (tagId: string) => void apply(ws => toggleTag(ws, note.id, tagId));
  const createTag = (name: string) => void apply(ws => {
    const tag = ensureTag(ws, name, newId());
    return tag.ok ? toggleTag(tag.value.workspace, note.id, tag.value.tag.id) : tag;
  });

  return (
    <li data-note={note.id} className={cn("rounded-lg border bg-surface p-3 transition-colors [contain-intrinsic-size:auto_96px] [content-visibility:auto]", selected ? "border-accent" : current ? "border-accent/50 bg-accent/5" : "border-border")} onClick={() => onSelect(note.id)}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={event => { event.stopPropagation(); onSelect(note.id); onPlay(note.start); }} className="shrink-0 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent tabular-nums hover:bg-accent/20" aria-label={`Play from ${formatTime(note.start)}`}>
          ▶ {formatSegment(note)}
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2" onClick={event => event.stopPropagation()}>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={2000} aria-label="Edit note" autoFocus
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save(); if (e.key === "Escape") setEditing(false); }}
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent" />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-muted">Starts at <input value={start} onChange={e => setStart(e.target.value)} aria-label="Start time" className="h-7 w-20 rounded-md border border-border bg-surface px-2 text-sm text-text tabular-nums" /></label>
                <Button size="sm" onClick={() => void save()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(note.text); setStart(formatTime(note.start)); setError(null); }}>Cancel</Button>
              </div>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{note.text}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={event => event.stopPropagation()}>
            {noteTags.map(tag => <TagChip key={tag.id} tag={tag} onRemove={() => tagNote(tag.id)} />)}
            <TagPicker tags={tags} applied={note.tagIds} onPick={tagNote} onCreate={createTag} />
            {citations > 0 && <span className="text-xs text-text-muted">· evidence for {citations} {citations === 1 ? "finding" : "findings"}</span>}
          </div>
        </div>
      </div>
      {!editing && (
        <div className="mt-2 flex justify-end gap-1" onClick={event => event.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => onUse(note.id)}>Use…</Button>
          <Button size="sm" variant="ghost" onClick={() => { setText(note.text); setStart(formatTime(note.start)); setEditing(true); }}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => void remove()} aria-label={`Delete note at ${formatTime(note.start)}`}>Delete</Button>
        </div>
      )}
    </li>
  );
});
