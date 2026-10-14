import { useEffect, useRef, useState, type RefObject } from "react";
import { Skeleton } from "../../components/skeleton/skeleton";
import type { Ms, Recording } from "../../domain/01-import";
import { useStudy } from "../../app/study";

export interface PlayerHandle {
  seek: (time: Ms, play?: boolean) => void;
  toggle: () => void;
}

/**
 * The media element is the clock: its float seconds become whole milliseconds here, on every frame while
 * playing, and nowhere else. `startAt` is where to open (a moment link); `stopAt` pauses at the end of a clip.
 */
export function Player({ recording, startAt, stopAt, autoPlay = false, onTime, onPlaying, onFailed, handle, compact = false }: {
  recording: Recording;
  startAt?: Ms | null;
  stopAt?: Ms | null;
  autoPlay?: boolean;
  onTime: (time: Ms) => void;
  onPlaying?: (playing: boolean) => void;
  onFailed?: () => void;
  handle?: RefObject<PlayerHandle | null>;
  compact?: boolean;
}) {
  const { mediaUrl, mediaStatus, mediaRevision } = useStudy();
  const status = mediaStatus(recording.id);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const opened = useRef(false);
  const stop = useRef(stopAt ?? null);
  stop.current = stopAt ?? null;

  useEffect(() => {
    let live = true;
    setFailed(false);
    opened.current = false;
    void mediaUrl(recording.id).then(next => { if (live) setUrl(next); });
    return () => { live = false; };
  }, [recording.id, mediaUrl, status, mediaRevision]);

  useEffect(() => {
    if (!handle) return;
    handle.current = {
      seek: (time, play) => {
        const media = element.current;
        if (!media) return;
        media.currentTime = time / 1000;
        onTime(time);
        if (play) void media.play().catch(() => undefined);
      },
      toggle: () => { const media = element.current; if (media) { if (media.paused) void media.play().catch(() => undefined); else media.pause(); } },
    };
  }, [handle, onTime]);

  // Smooth playhead: one reading per animation frame while playing.
  useEffect(() => {
    const media = element.current;
    if (!media) return;
    let frame = 0;
    const read = () => {
      const ms = Math.round(media.currentTime * 1000);
      if (stop.current !== null && ms >= stop.current && !media.paused) { media.pause(); onTime(stop.current); return; }
      onTime(ms);
    };
    const loop = () => { read(); frame = requestAnimationFrame(loop); };
    const onPlay = () => { onPlaying?.(true); cancelAnimationFrame(frame); frame = requestAnimationFrame(loop); };
    const onPause = () => { onPlaying?.(false); cancelAnimationFrame(frame); read(); };
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("seeked", read);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("play", onPlay); media.removeEventListener("pause", onPause); media.removeEventListener("seeked", read); };
  }, [url, onTime, onPlaying]);

  if (status === "missing") return null;
  if (!url) return <Skeleton className={compact ? "h-12 w-full" : "aspect-video w-full"} />;
  const common = {
    ref: element,
    src: url,
    controls: true,
    preload: "metadata" as const,
    onError: () => { setFailed(true); onFailed?.(); },
    onLoadedMetadata: () => {
      const media = element.current;
      if (!media || opened.current) return;
      opened.current = true;
      if (startAt) { media.currentTime = startAt / 1000; onTime(startAt); }
      if (autoPlay) void media.play().catch(() => undefined);
    },
  };
  return (
    <div>
      {recording.media.kind === "video" ? (
        <video {...common} playsInline aria-label={`${recording.title} — video`} className={compact ? "max-h-64 w-full rounded-md bg-black" : "aspect-video max-h-[60vh] w-full rounded-lg bg-black"} />
      ) : (
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <p className="mb-2 text-xs text-text-muted">Audio · {recording.media.name}</p>
          <audio {...common} aria-label={`${recording.title} — audio`} className="w-full" />
        </div>
      )}
      {failed && <p role="alert" className="mt-2 text-sm text-danger">This browser can't play {recording.media.name}. Notes still work — choose a copy exported as MP4 or M4A below.</p>}
    </div>
  );
}
