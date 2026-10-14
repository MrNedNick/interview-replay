import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { tagKey, type Tag, type TagColor } from "../../domain/03-tags";
import { useClickOutside } from "../../lib/use-click-outside";

export const TAG_STYLE: Record<TagColor, string> = {
  blue: "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/30",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  red: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/30",
  pink: "bg-pink-500/12 text-pink-700 dark:text-pink-300 border-pink-500/30",
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

export function TagChip({ tag, onRemove, onClick, pressed, children }: { tag: Tag; onRemove?: () => void; onClick?: () => void; pressed?: boolean; children?: ReactNode }) {
  const style = cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TAG_STYLE[tag.color], pressed === false && "opacity-60");
  return (
    <span className={style}>
      {onClick ? <button type="button" onClick={onClick} aria-pressed={pressed} className="truncate">#{tag.name}{children}</button> : <span className="truncate">#{tag.name}{children}</span>}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag.name}`} className="-mr-1 rounded-full px-1 leading-none hover:bg-black/10 dark:hover:bg-white/10">×</button>}
    </span>
  );
}

/** Adds a tag to a note: type to filter the study's tags, Enter picks the first match or creates the tag. */
export function TagPicker({ tags, applied, onPick, onCreate }: { tags: readonly Tag[]; applied: readonly string[]; onPick: (tagId: string) => void; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const box = useClickOutside<HTMLDivElement>(useCallback(() => setOpen(false), []));
  const options = useMemo(() => {
    const key = tagKey(text);
    return tags.filter(t => !applied.includes(t.id) && (!key || tagKey(t.name).includes(key))).slice(0, 8);
  }, [tags, applied, text]);
  const exact = tags.some(t => tagKey(t.name) === tagKey(text));
  function pick(tagId: string) { onPick(tagId); setText(""); }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (options[0] && (exact || !tagKey(text) || tagKey(options[0].name) === tagKey(text))) pick(options[0].id);
    else if (tagKey(text)) { onCreate(text); setText(""); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-text-muted hover:border-accent hover:text-text">+ Tag</button>;
  return (
    <div ref={box} className="relative">
      <input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder="Tag…" aria-label="Add a tag" maxLength={40}
        className="h-6 w-32 rounded-full border border-accent bg-surface px-2 text-xs outline-none" />
      {(options.length > 0 || (tagKey(text) && !exact)) && (
        <ul className="absolute left-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-overlay">
          {options.map(t => <li key={t.id}><button type="button" onClick={() => pick(t.id)} className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-surface-raised">#{t.name}</button></li>)}
          {tagKey(text) && !exact && <li><button type="button" onClick={() => { onCreate(text); setText(""); }} className="block w-full truncate px-3 py-1.5 text-left text-xs text-accent hover:bg-surface-raised">Create “{text.replace(/^#+/, "").trim()}”</button></li>}
        </ul>
      )}
    </div>
  );
}
