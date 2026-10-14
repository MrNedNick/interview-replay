import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/button/button";
import { formatTime, type Ms, type Recording } from "../../domain/01-import";
import { addNote, parseTime, type Segment } from "../../domain/02-notes";
import { ensureTag } from "../../domain/03-tags";
import type { Workspace } from "../../domain/workspace";
import { newId, useStudy } from "../../app/study";

/** `#tags` written at the end of a note become tags; inside a sentence they stay text and tag the note too. */
export function splitTags(text: string): { text: string; tags: string[] } {
  const tags = [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu)].map(m => m[1]);
  const trailing = /(?:\s+#[\p{L}\p{N}][\p{L}\p{N}_-]*)+\s*$/u;
  const stripped = text.replace(trailing, "").trim();
  return { text: stripped || text.trim(), tags: [...new Set(tags)] };
}

/**
 * Writes a note at the playhead. The moment is taken when you start typing — what you are reacting to —
 * not when you finish; "End here" turns it into a range. The time can also be typed, which is how notes
 * are added while the file isn't available.
 */
export function NoteComposer({ recording, playhead, onDraft, focusKey }: { recording: Recording; playhead: Ms; onDraft: (segment: Segment | null) => void; focusKey: number }) {
  const { apply } = useStudy();
  const [text, setText] = useState("");
  const [start, setStart] = useState<Ms | null>(null);
  const [end, setEnd] = useState<Ms | null>(null);
  const [timeText, setTimeText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (focusKey > 0) area.current?.focus(); }, [focusKey]);
  const at = start ?? playhead;
  useEffect(() => { onDraft(text || start !== null ? { start: at, end: end ?? at } : null); }, [text, start, end, at, onDraft]);

  function reset() { setText(""); setStart(null); setEnd(null); setTimeText(null); setError(null); }
  function type(value: string) {
    if (!text && value && start === null) setStart(playhead);
    setText(value);
    setError(null);
  }
  function commitTime(): Ms | null {
    if (timeText === null) return at;
    const parsed = parseTime(timeText);
    if (!parsed.ok) { setError(parsed.error.message); return null; }
    setStart(parsed.value); setTimeText(null);
    return parsed.value;
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    const from = commitTime();
    if (from === null) return;
    const { text: body, tags } = splitTags(text);
    const id = newId();
    const refused = await apply(ws => {
      let next: Workspace = ws;
      const tagIds: string[] = [];
      for (const name of tags) {
        const tag = ensureTag(next, name, newId());
        if (!tag.ok) return tag;
        next = tag.value.workspace;
        tagIds.push(tag.value.tag.id);
      }
      return addNote(next, { recordingId: recording.id, start: from, end: end ?? from, text: body, tagIds }, id, new Date());
    });
    if (refused) { setError(refused.message); return; }
    reset();
    area.current?.focus();
  }
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
    if (event.key === "Escape") { event.preventDefault(); reset(); }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-border bg-surface p-3 shadow-card" aria-label="New note">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <label className="flex items-center gap-1.5">
          <span>{end !== null ? "From" : "At"}</span>
          <input
            value={timeText ?? formatTime(at)}
            onChange={e => setTimeText(e.target.value)}
            onBlur={() => commitTime()}
            aria-label="Note time"
            className="h-7 w-20 rounded-md border border-border bg-surface px-2 text-sm text-text tabular-nums"
          />
        </label>
        {end !== null && <span className="tabular-nums">to {formatTime(end)} <button type="button" className="ml-1 underline" onClick={() => setEnd(null)}>make it a point</button></span>}
        <Button type="button" variant="ghost" size="sm" onClick={() => { setStart(playhead); setTimeText(null); }} title="Move the note to the playhead">At playhead</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { if (playhead > at) setEnd(playhead); else setError("Play on past the start, then press “End here” to mark a range."); }} title="End the moment at the playhead">End here</Button>
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={e => type(e.target.value)}
        onKeyDown={onKey}
        rows={2}
        maxLength={2000}
        aria-label="Note"
        aria-keyshortcuts="Enter"
        placeholder="What did you notice? Enter saves, Shift+Enter adds a line, #tag tags it."
        className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="sm" className="ml-auto" disabled={!text.trim()}>Add note</Button>
      </div>
    </form>
  );
}
