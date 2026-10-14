import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../../components/button/button";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { EmptyState } from "../../components/empty-state/empty-state";
import { Input } from "../../components/input/input";
import { Select } from "../../components/select/select";
import { formatSegment } from "../../domain/02-notes";
import { deleteTag, mergeTags, parseQuery, recolorTag, renameTag, search, similarTags, tagCounts, TAG_COLORS, type SearchHit, type Tag, type TagColor } from "../../domain/03-tags";
import { href, replaceHash } from "../../app/route";
import { useStudy } from "../../app/study";
import { TagChip, TAG_STYLE } from "./TagChip";

/** Search every interview at once: words and "phrases" in notes, #tags, a participant's name. */
export function SearchPage({ query: initial }: { query: string }) {
  const { workspace } = useStudy();
  const [text, setText] = useState(initial);
  const [recordingId, setRecordingId] = useState("");
  const [debounced, setDebounced] = useState(initial);
  useEffect(() => { const timer = setTimeout(() => setDebounced(text), 150); return () => clearTimeout(timer); }, [text]);
  useEffect(() => { replaceHash(href.search(debounced)); }, [debounced]);

  const query = useMemo(() => parseQuery(debounced, workspace.tags), [debounced, workspace.tags]);
  const searching = query.terms.length > 0 || query.tagIds.length > 0 || recordingId !== "";
  const hits = useMemo(() => (searching ? search(workspace, query, { recordingIds: recordingId ? [recordingId] : [] }) : []), [workspace, query, recordingId, searching]);
  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) map.set(hit.recording.id, [...(map.get(hit.recording.id) ?? []), hit]);
    return [...map.values()];
  }, [hits]);
  const toggleTag = (tag: Tag) => {
    const token = tagToken(tag);
    const active = query.tagIds.includes(tag.id);
    const next = active ? text.replace(new RegExp(`(^|\\s)#("${escape(tag.name)}"|${escape(tag.name)})(?=\\s|$)`, "i"), " ").trim() : `${text.trim()} ${token}`.trim();
    setText(next); setDebounced(next);
  };

  if (workspace.recordings.length === 0) return <EmptyState title="Nothing to search yet" description="Import a recording or open the sample study, write a few notes, and search them all here." action={<a href={href.library()} className="text-sm font-medium text-accent underline">Go to interviews</a>} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-text-muted">Across every interview. Words, “quoted phrases”, #tags or a participant's name; accents and case don't matter.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="search" value={text} onChange={e => setText(e.target.value)} placeholder='slot #checkout "extra work"' aria-label="Search notes" className="sm:flex-1" autoFocus />
        <Select value={recordingId} onChange={e => setRecordingId(e.target.value)} aria-label="Recording" className="sm:w-60">
          <option value="">All interviews</option>
          {workspace.recordings.map(r => <option key={r.id} value={r.id}>{r.title} · {r.consent.participant}</option>)}
        </Select>
      </div>
      {workspace.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
          {workspace.tags.map(tag => <TagChip key={tag.id} tag={tag} pressed={query.tagIds.includes(tag.id)} onClick={() => toggleTag(tag)} />)}
        </div>
      )}
      {query.unknownTags.length > 0 && <p role="status" className="text-sm text-warning">No tag called {query.unknownTags.map(t => `#${t}`).join(", ")} — showing nothing for it.</p>}
      {searching && (
        <section aria-label="Results" className="space-y-4">
          <p className="text-sm text-text-muted" role="status">{hits.length === 0 ? "No notes match." : `${hits.length} ${hits.length === 1 ? "note" : "notes"} in ${groups.length} ${groups.length === 1 ? "interview" : "interviews"}`}</p>
          {groups.map(group => (
            <div key={group[0].recording.id}>
              <h2 className="text-sm font-semibold">{group[0].recording.title} <span className="font-normal text-text-muted">· {group[0].recording.consent.participant}</span></h2>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {group.map(hit => (
                  <li key={hit.note.id} className="flex gap-3 p-3">
                    <a href={href.review(hit.recording.id, hit.note.start)} className="shrink-0 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent tabular-nums hover:bg-accent/20">▶ {formatSegment(hit.note)}</a>
                    <div className="min-w-0">
                      <p className="text-sm break-words"><Highlighted text={hit.note.text} ranges={hit.ranges} /></p>
                      {hit.note.tagIds.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{hit.note.tagIds.map(id => workspace.tags.find(t => t.id === id)).filter((t): t is Tag => Boolean(t)).map(t => <TagChip key={t.id} tag={t} />)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      <TagManager onShow={tag => { const token = tagToken(tag); setText(token); setDebounced(token); window.scrollTo({ top: 0 }); }} />
    </div>
  );
}

const tagToken = (tag: Tag) => `#${/\s/.test(tag.name) ? `"${tag.name}"` : tag.name}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlighted({ text, ranges }: { text: string; ranges: SearchHit["ranges"] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>);
    at = end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** The study's tags: how often each is used, rename, recolour, delete, and merge spellings of one tag. */
function TagManager({ onShow }: { onShow: (tag: Tag) => void }) {
  const { workspace, apply } = useStudy();
  const confirm = useConfirm();
  const counts = useMemo(() => tagCounts(workspace), [workspace]);
  const similar = useMemo(() => similarTags(workspace), [workspace]);
  const [error, setError] = useState<string | null>(null);
  if (workspace.tags.length === 0) return null;
  const run = async (change: Parameters<typeof apply>[0]) => { const refused = await apply(change); setError(refused?.message ?? null); return refused; };
  async function remove(tag: Tag) {
    const used = counts.get(tag.id) ?? 0;
    if (used > 0 && !(await confirm({ title: `Delete #${tag.name}?`, description: `It comes off ${used} ${used === 1 ? "note" : "notes"}; the notes stay.`, confirmLabel: "Delete tag", variant: "danger" }))) return;
    await run(ws => deleteTag(ws, tag.id));
  }
  return (
    <section aria-labelledby="tags-title" className="space-y-3 border-t border-border pt-6">
      <h2 id="tags-title" className="text-lg font-semibold">Tags</h2>
      {similar.map(([a, b]) => {
        const [keep, fold] = (counts.get(a.id) ?? 0) >= (counts.get(b.id) ?? 0) ? [a, b] : [b, a];
        return (
          <div key={`${a.id}-${b.id}`} role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span>#{fold.name} and #{keep.name} look like one tag.</span>
            <Button size="sm" variant="outline" onClick={() => void run(ws => mergeTags(ws, fold.id, keep.id))}>Merge into #{keep.name}</Button>
          </div>
        );
      })}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {workspace.tags.map(tag => (
          <li key={tag.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <span className={`size-3 shrink-0 rounded-full border ${TAG_STYLE[tag.color]}`} aria-hidden="true" />
            <input defaultValue={tag.name} key={tag.name} aria-label={`Rename #${tag.name}`} maxLength={40}
              onBlur={e => { const input = e.currentTarget; if (input.value.trim() !== tag.name) void run(ws => renameTag(ws, tag.id, input.value)).then(refused => { if (refused) input.value = tag.name; }); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-accent focus:outline-none" />
            <span className="text-xs text-text-muted tabular-nums">{counts.get(tag.id) ?? 0} notes</span>
            <Button size="sm" variant="ghost" onClick={() => onShow(tag)}>Show notes</Button>
            <Select value={tag.color} onChange={e => void run(ws => recolorTag(ws, tag.id, e.target.value as TagColor))} aria-label={`Colour of #${tag.name}`} className="h-8 w-28 text-xs">
              {TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => void remove(tag)} aria-label={`Delete #${tag.name}`}>Delete</Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
