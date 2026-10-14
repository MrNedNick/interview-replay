import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "../../components/button/button";
import { cn } from "../../lib/cn";
import { formatTime, type Ms } from "../../domain/01-import";
import { clampViewport, fitViewport, markers, revealTime, ticks, timeToX, xToTime, zoomViewport, type Annotation, type Segment, type Viewport } from "../../domain/02-notes";

interface TimelineProps {
  durationMs: Ms;
  time: Ms;
  playing: boolean;
  notes: readonly Annotation[];
  selected: string | null;
  /** The note being written, shown as a pending mark. */
  draft: Segment | null;
  onSeek: (time: Ms) => void;
  onSelect: (noteId: string) => void;
}

/**
 * The recording as a strip: ruler, a mark per note (dense notes merge into one mark with a count), the playhead,
 * and an overview of the whole recording under it. An hour fits on screen and zooms down to a few seconds.
 */
export function Timeline({ durationMs, time, playing, notes, selected, draft, onSeek, onSelect }: TimelineProps) {
  const strip = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>(() => fitViewport(durationMs, 800));
  const fitted = useRef(true);

  // Follows the strip's width; a fitted view stays fitted.
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const resize = () => {
      const width = Math.max(1, Math.floor(element.clientWidth));
      setView(v => (fitted.current ? fitViewport(durationMs, width) : clampViewport({ ...v, width }, durationMs)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [durationMs]);

  // While playing, the window turns the page when the playhead leaves it.
  useEffect(() => { if (playing) setView(v => revealTime(v, time, durationMs)); }, [playing, time, durationMs]);

  const zoom = (factor: number, anchor = time) => { fitted.current = false; setView(v => zoomViewport(v, factor, anchor, durationMs)); };
  const fit = () => { fitted.current = true; setView(v => fitViewport(durationMs, v.width)); };
  const pan = (deltaMs: number) => { fitted.current = false; setView(v => clampViewport({ ...v, start: v.start + deltaMs }, durationMs)); };

  // ⌘/Ctrl + wheel zooms around the pointer; horizontal or Shift + wheel scrolls. Needs a non-passive listener.
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const x = event.clientX - element.getBoundingClientRect().left;
        fitted.current = false;
        setView(v => zoomViewport(v, event.deltaY < 0 ? 1.25 : 0.8, xToTime(v, x, durationMs), durationMs));
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
        event.preventDefault();
        const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        fitted.current = false;
        setView(v => clampViewport({ ...v, start: v.start + delta * v.msPerPx }, durationMs));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [durationMs]);

  const marks = useMemo(() => markers(notes, view), [notes, view]);
  const labels = useMemo(() => ticks(view, durationMs), [view, durationMs]);
  const overview = useMemo(() => markers(notes, fitViewport(durationMs, view.width), 2), [notes, durationMs, view.width]);
  const span = view.msPerPx * view.width;
  const playheadX = timeToX(view, time);
  const isFit = view.start === 0 && span >= durationMs;

  function onKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 30_000 : 5000;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => onSeek(Math.max(0, time - step)),
      ArrowRight: () => onSeek(Math.min(durationMs, time + step)),
      Home: () => onSeek(0),
      End: () => onSeek(durationMs),
      "+": () => zoom(2), "=": () => zoom(2), "-": () => zoom(0.5), "0": fit,
    };
    const action = keys[event.key];
    if (action) { event.preventDefault(); action(); }
  }
  function seekAt(event: PointerEvent<HTMLDivElement>) {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    onSeek(xToTime(view, x, durationMs));
  }
  const dragging = useRef(false);
  function centreOverview(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - rect.left) / rect.width) * durationMs;
    fitted.current = false;
    setView(v => clampViewport({ ...v, start: at - (v.msPerPx * v.width) / 2 }, durationMs));
  }

  return (
    <section aria-label="Timeline" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        <span className="mr-auto tabular-nums" aria-live="off">{isFit ? `Whole recording · ${formatTime(durationMs)}` : `${formatTime(view.start)} – ${formatTime(Math.min(durationMs, view.start + span))}`}</span>
        <Button variant="ghost" size="sm" onClick={() => pan(-span * 0.8)} disabled={view.start <= 0} aria-label="Earlier">‹</Button>
        <Button variant="ghost" size="sm" onClick={() => pan(span * 0.8)} disabled={view.start + span >= durationMs} aria-label="Later">›</Button>
        <Button variant="ghost" size="sm" onClick={() => zoom(0.5)} disabled={isFit} aria-label="Zoom out">−</Button>
        <Button variant="ghost" size="sm" onClick={() => zoom(2)} disabled={view.msPerPx <= 10} aria-label="Zoom in">+</Button>
        <Button variant="ghost" size="sm" onClick={fit} disabled={isFit}>Fit</Button>
      </div>
      <div
        ref={strip}
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(time / 1000)}
        aria-valuetext={`${formatTime(time)} of ${formatTime(durationMs)}`}
        aria-keyshortcuts="ArrowLeft ArrowRight Home End + - 0"
        onKeyDown={onKey}
        className="relative h-[72px] cursor-pointer touch-pan-y select-none overflow-hidden rounded-md border border-border bg-surface-raised"
        onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) return; seekAt(event); }}
      >
        <div className="absolute inset-x-0 top-0 h-5 border-b border-border" aria-hidden="true">
          {labels.map(t => (
            <span key={t} className="absolute top-0 h-full border-l border-border pl-1 text-[10px] leading-5 text-text-muted tabular-nums" style={{ left: timeToX(view, t) }}>{formatTime(t)}</span>
          ))}
        </div>
        {draft && (
          <div aria-hidden="true" className="absolute top-5 bottom-0 border-l-2 border-dashed border-warning bg-warning/15" style={{ left: timeToX(view, draft.start), width: Math.max(2, (draft.end - draft.start) / view.msPerPx) }} />
        )}
        {marks.map(mark => {
          const active = selected !== null && mark.noteIds.includes(selected);
          const first = notes.find(n => n.id === mark.noteIds[0])!;
          return (
            <button
              key={mark.noteIds[0]}
              type="button"
              tabIndex={-1}
              onClick={() => { onSelect(first.id); onSeek(first.start); }}
              aria-label={mark.noteIds.length > 1 ? `${mark.noteIds.length} notes from ${formatTime(first.start)}` : `Note at ${formatTime(first.start)}: ${first.text}`}
              title={mark.noteIds.length > 1 ? `${mark.noteIds.length} notes` : first.text}
              className={cn("absolute top-8 h-7 min-w-[6px] rounded-sm border transition-colors", active ? "border-accent bg-accent" : "border-accent/60 bg-accent/35 hover:bg-accent/60")}
              style={{ left: mark.x - 1, width: Math.max(6, mark.width) }}
            >
              {mark.noteIds.length > 1 && mark.width >= 4 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1 text-[9px] leading-3 text-on-accent">{mark.noteIds.length}</span>}
            </button>
          );
        })}
        {playheadX >= 0 && playheadX <= view.width && <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-danger" style={{ left: playheadX }} />}
      </div>
      <div
        aria-hidden="true"
        className="relative h-3 cursor-pointer touch-none rounded-sm bg-surface-raised"
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); centreOverview(event); }}
        onPointerMove={event => { if (dragging.current) centreOverview(event); }}
        onPointerUp={() => { dragging.current = false; }}
      >
        {overview.map(mark => <span key={mark.noteIds[0]} className="absolute top-0.5 bottom-0.5 w-px bg-accent/70" style={{ left: `${(mark.x / view.width) * 100}%` }} />)}
        <span className="absolute top-0 bottom-0 w-px bg-danger" style={{ left: `${(time / durationMs) * 100}%` }} />
        {!isFit && <span className="absolute top-0 bottom-0 rounded-sm border border-accent bg-accent/10" style={{ left: `${(view.start / durationMs) * 100}%`, width: `${Math.max(0.5, (span / durationMs) * 100)}%` }} />}
      </div>
    </section>
  );
}
