import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { EmptyState } from "../../components/empty-state/empty-state";
import { Input } from "../../components/input/input";
import { cn } from "../../lib/cn";
import { formatTime, type Ms } from "../../domain/01-import";
import { formatSegment, parseTime } from "../../domain/02-notes";
import { createReel, deleteReel, moveClip, nextPlayable, playbackPlan, reelDuration, reelPosition, removeClip, renameReel, trimClip, withheldClips, type Clip, type Reel } from "../../domain/04-reels";
import { reelMarkdown } from "../../domain/06-export";
import { download } from "../../app/download";
import { href } from "../../app/route";
import { newId, useStudy } from "../../app/study";
import { Player, type PlayerHandle } from "../02-review/Player";

export function ReelsPage({ reelId }: { reelId: string | null }) {
  const { workspace, apply } = useStudy();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reel = workspace.reels.find(r => r.id === reelId) ?? workspace.reels[0] ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    const id = newId();
    const refused = await apply(ws => { const made = createReel(ws, title, id, new Date()); return made.ok ? { ok: true, value: made.value.workspace } : made; });
    if (refused) { setError(refused.message); return; }
    setTitle(""); setError(null);
    location.hash = href.reels(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reels</h1>
        <p className="mt-1 max-w-xl text-sm text-text-muted">Moments from different interviews, played back to back — the quickest way to show a team what people actually said. Add clips from any note with “Use…”.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          <form onSubmit={create} className="flex gap-2">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="New reel" aria-label="New reel title" maxLength={80} />
            <Button type="submit" size="md" variant="outline" disabled={!title.trim()}>Create</Button>
          </form>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {workspace.reels.length > 0 && (
            <nav aria-label="Reels">
              <ul className="space-y-1">
                {workspace.reels.map(r => (
                  <li key={r.id}>
                    <a href={href.reels(r.id)} aria-current={r.id === reel?.id ? "page" : undefined} className={cn("block rounded-md px-3 py-2 text-sm hover:bg-surface-raised", r.id === reel?.id && "bg-accent/10 font-medium text-accent")}>
                      {r.title}
                      <span className="block text-xs font-normal text-text-muted">{r.clips.length} {r.clips.length === 1 ? "clip" : "clips"} · {formatTime(reelDuration(r))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        {reel ? <ReelView key={reel.id} reel={reel} /> : <EmptyState title="No reels yet" description="Create a reel here, then add moments to it from any note in an interview." />}
      </div>
    </div>
  );
}

function ReelView({ reel }: { reel: Reel }) {
  const { workspace, apply, mediaStatus } = useStudy();
  const confirm = useConfirm();
  const steps = useMemo(() => playbackPlan(workspace, reel, id => mediaStatus(id) !== "missing"), [workspace, reel, mediaStatus]);
  const [index, setIndex] = useState(() => Math.max(0, steps.findIndex(s => s.playable)));
  const [autoPlay, setAutoPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const time = useRef<Ms>(0);
  const player = useRef<PlayerHandle | null>(null);
  const [position, setPosition] = useState<Ms>(0);
  const step = steps[index] ?? null;
  const withheld = useMemo(() => new Set(withheldClips(workspace, reel).map(c => c.id)), [workspace, reel]);
  const total = reelDuration(reel);

  const onTime = useCallback((t: Ms) => { time.current = t; setPosition(reelPosition(steps, index, t)); }, [steps, index]);
  // A clip that played to its end hands over to the next one that can play.
  const onPlaying = useCallback((playing: boolean) => {
    const current = steps[index];
    if (playing || !current || time.current < current.clip.end - 150) return;
    const next = nextPlayable(steps, index);
    if (next !== null) { setAutoPlay(true); setIndex(next); }
  }, [steps, index]);

  const run = async (change: Parameters<typeof apply>[0]) => { const refused = await apply(change); setError(refused?.message ?? null); return refused?.message ?? null; };
  async function remove() {
    if (!(await confirm({ title: `Delete “${reel.title}”?`, description: "The clips go with it; the notes and recordings stay.", confirmLabel: "Delete reel", variant: "danger" }))) return;
    await apply(ws => deleteReel(ws, reel.id));
    location.hash = href.reels();
  }

  return (
    <section aria-label={reel.title} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input defaultValue={reel.title} key={reel.title} aria-label="Reel title" maxLength={80}
          onBlur={e => { const input = e.currentTarget; if (input.value.trim() !== reel.title) void apply(ws => renameReel(ws, reel.id, input.value)).then(refused => { if (refused) { input.value = reel.title; setError(refused.message); } }); }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="mr-auto min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight hover:border-border focus:border-accent focus:outline-none" />
        <Button size="sm" variant="outline" disabled={reel.clips.length === 0} onClick={() => download(`${slug(reel.title)}.md`, reelMarkdown(workspace, reel, { shareable: true }), "text/markdown;charset=utf-8")}>Download clip list</Button>
        <Button size="sm" variant="ghost" onClick={() => void remove()}>Delete</Button>
      </div>
      {reel.clips.length === 0 ? (
        <EmptyState title="This reel is empty" description="Open an interview, pick a note and choose “Use…” → Clip in a reel." action={<a href={href.library()} className="text-sm font-medium text-accent underline">Go to interviews</a>} />
      ) : (
        <>
          {step?.playable ? (
            <div className="space-y-2">
              <Player key={step.clip.id} recording={step.recording} startAt={step.clip.start} stopAt={step.clip.end} autoPlay={autoPlay} onTime={onTime} onPlaying={onPlaying} handle={player} compact />
              <p className="text-sm"><span className="font-medium">Clip {index + 1} of {steps.length}</span> <span className="text-text-muted">· {step.recording.consent.participant} · {step.recording.title} · {formatSegment(step.clip)}</span></p>
              {step.clip.caption && <p className="border-l-2 border-accent pl-3 text-sm italic">{step.clip.caption}</p>}
              <div className="flex items-center gap-2 text-xs text-text-muted tabular-nums">
                <span>{formatTime(position)}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="Reel progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={position}>
                  {steps.map(s => <span key={s.clip.id} className={cn("absolute top-0 bottom-0 border-r border-surface", s.playable ? "" : "bg-warning/40")} style={{ left: `${(s.offset / total) * 100}%`, width: `${((s.clip.end - s.clip.start) / total) * 100}%` }} />)}
                  <span className="absolute top-0 bottom-0 left-0 bg-accent" style={{ width: `${(position / total) * 100}%` }} />
                </div>
                <span>{formatTime(total)}</span>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-warning/50 bg-warning/5 p-4 text-sm">None of these clips can play here: their recordings' files aren't in this browser. Open each interview to choose its file.</p>
          )}
          <ol className="space-y-2" aria-label="Clips">
            {reel.clips.map((clip, i) => {
              const s = steps.find(x => x.clip.id === clip.id);
              return (
                <ClipRow key={`${clip.id}:${clip.start}:${clip.end}`} clip={clip} number={i + 1} last={i === reel.clips.length - 1} active={i === index}
                  participant={s?.recording.consent.participant ?? "?"} recordingTitle={s?.recording.title ?? ""} playable={s?.playable ?? false} withheld={withheld.has(clip.id)}
                  onPlay={() => { if (i === index) player.current?.seek(clip.start, true); else { setAutoPlay(true); setIndex(i); } }}
                  onMove={to => void run(ws => moveClip(ws, reel.id, clip.id, to))}
                  onTrim={patch => run(ws => trimClip(ws, reel.id, clip.id, patch))}
                  onRemove={() => void run(ws => removeClip(ws, reel.id, clip.id))} />
              );
            })}
          </ol>
          {withheld.size > 0 && <p className="text-xs text-text-muted">{withheld.size} {withheld.size === 1 ? "clip comes" : "clips come"} from participants who agreed to team review only; the downloaded clip list leaves {withheld.size === 1 ? "it" : "them"} out.</p>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function ClipRow({ clip, number, last, active, participant, recordingTitle, playable, withheld, onPlay, onMove, onTrim, onRemove }: {
  clip: Clip; number: number; last: boolean; active: boolean; participant: string; recordingTitle: string; playable: boolean; withheld: boolean;
  onPlay: () => void; onMove: (to: number) => void; onTrim: (patch: { start?: Ms; end?: Ms; caption?: string }) => Promise<string | null>; onRemove: () => void;
}) {
  const [start, setStart] = useState(formatTime(clip.start));
  const [end, setEnd] = useState(formatTime(clip.end));
  const [error, setError] = useState<string | null>(null);
  async function commit(which: "start" | "end", value: string) {
    const parsed = parseTime(value);
    if (!parsed.ok) { setError(parsed.error.message); return; }
    setError(null);
    if (await onTrim({ [which]: parsed.value })) { setStart(formatTime(clip.start)); setEnd(formatTime(clip.end)); }
  }
  return (
    <li className={cn("rounded-lg border p-3", active ? "border-accent" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-surface-raised text-xs font-medium tabular-nums">{number}</span>
        <span className="mr-auto min-w-0 text-sm"><span className="font-medium">{participant}</span> <span className="text-text-muted">· {recordingTitle}</span></span>
        {!playable && <Badge tone="warning">File needed</Badge>}
        {withheld && <Badge>Team only</Badge>}
        <Button size="sm" variant="ghost" onClick={onPlay} disabled={!playable} aria-label={`Play clip ${number}`}>▶</Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(number - 2)} disabled={number === 1} aria-label={`Move clip ${number} up`}>↑</Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(number)} disabled={last} aria-label={`Move clip ${number} down`}>↓</Button>
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove clip ${number}`}>Remove</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <label className="flex items-center gap-1">From <input value={start} onChange={e => setStart(e.target.value)} onBlur={e => void commit("start", e.target.value)} aria-label={`Clip ${number} start`} className="h-7 w-20 rounded-md border border-border bg-surface px-2 text-sm text-text tabular-nums" /></label>
        <label className="flex items-center gap-1">to <input value={end} onChange={e => setEnd(e.target.value)} onBlur={e => void commit("end", e.target.value)} aria-label={`Clip ${number} end`} className="h-7 w-20 rounded-md border border-border bg-surface px-2 text-sm text-text tabular-nums" /></label>
        <span className="tabular-nums">{formatTime(clip.end - clip.start)} long</span>
        <a href={href.review(clip.recordingId, clip.start)} className="text-accent underline">Open in interview</a>
      </div>
      <input defaultValue={clip.caption} key={clip.caption} onBlur={e => { if (e.target.value !== clip.caption) void onTrim({ caption: e.target.value }); }} aria-label={`Clip ${number} caption`} placeholder="Caption" maxLength={200}
        className="mt-2 h-8 w-full rounded-md border border-border bg-surface px-2 text-sm" />
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </li>
  );
}

export const slug = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
