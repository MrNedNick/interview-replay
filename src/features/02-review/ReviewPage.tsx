import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { EmptyState } from "../../components/empty-state/empty-state";
import { formatTime, type Ms } from "../../domain/01-import";
import { currentNote, notesFor, type Segment } from "../../domain/02-notes";
import { deleteRecording } from "../../domain/06-export";
import { href, replaceHash } from "../../app/route";
import { useStudy } from "../../app/study";
import { MEDIA_LABEL } from "../01-import/Library";
import { NoteComposer } from "./NoteComposer";
import { NoteList } from "./NoteList";
import { Player, type PlayerHandle } from "./Player";
import { RelinkPanel } from "./RelinkPanel";
import { Timeline } from "./Timeline";

export function ReviewPage({ recordingId, time: linkedTime }: { recordingId: string; time: Ms | null }) {
  const { workspace, mediaStatus, replace } = useStudy();
  const confirm = useConfirm();
  const recording = workspace.recordings.find(r => r.id === recordingId);
  const notes = useMemo(() => notesFor(workspace, recordingId), [workspace, recordingId]);
  const [time, setTime] = useState<Ms>(linkedTime ?? 0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Segment | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [unplayable, setUnplayable] = useState(false);
  const player = useRef<PlayerHandle | null>(null);
  const status = recording ? mediaStatus(recording.id) : "missing";

  // A moment link (#/r/<id>?t=…) opened while already on the page jumps there.
  useEffect(() => { if (linkedTime !== null) { setTime(linkedTime); player.current?.seek(linkedTime); } }, [linkedTime]);
  useEffect(() => { setUnplayable(false); }, [recordingId, status]);

  const seek = useCallback((target: Ms, play = false) => {
    setTime(target);
    player.current?.seek(target, play);
    replaceHash(href.review(recordingId, target));
  }, [recordingId]);
  const play = useCallback((target: Ms) => seek(target, true), [seek]);
  const onPlaying = useCallback((now: boolean) => { setPlaying(now); }, []);
  const current = useMemo(() => currentNote(notes, time)?.id ?? null, [notes, time]);

  // Space / K play or pause, J / L jump 5 s, N writes a note — whenever focus isn't in a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.closest("input, textarea, select, [contenteditable], dialog, button, [role=slider]")) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") { event.preventDefault(); player.current?.toggle(); }
      else if (key === "j") seek(Math.max(0, time - 5000));
      else if (key === "l" && recording) seek(Math.min(recording.media.durationMs, time + 5000));
      else if (key === "n") { event.preventDefault(); setFocusKey(k => k + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, time, recording]);

  if (!recording) {
    return <EmptyState title="This recording isn't here" description="It may have been deleted, or the link comes from another browser — studies live in the browser they were made in." action={<a className="text-sm font-medium text-accent underline" href={href.library()}>Back to interviews</a>} />;
  }
  async function remove() {
    const removal = deleteRecording(workspace, recording!.id);
    if (!removal.ok) return;
    const { notes: n, clips, evidence } = removal.value;
    if (!(await confirm({ title: `Delete “${recording!.title}”?`, description: `This removes the recording, its stored file and ${n} ${n === 1 ? "note" : "notes"}, ${clips} ${clips === 1 ? "clip" : "clips"} and ${evidence} ${evidence === 1 ? "citation" : "citations"} in findings. It can't be undone.`, confirmLabel: "Delete recording", variant: "danger" }))) return;
    await replace(removal.value.workspace, removal.value.recordingIds);
    location.hash = href.library();
  }
  const label = MEDIA_LABEL[status];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="mr-auto min-w-0">
          <a href={href.library()} className="text-sm text-text-muted hover:text-text">← Interviews</a>
          <h1 className="mt-1 text-xl font-semibold tracking-tight break-words">{recording.title}</h1>
          <p className="text-sm text-text-muted">{recording.consent.participant} · {formatTime(recording.media.durationMs)} · {notes.length} {notes.length === 1 ? "note" : "notes"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={label.tone}>{label.text}</Badge>
          <Badge>{recording.consent.scope === "share" ? "May be shared" : "Team only"} · consent {recording.consent.date}</Badge>
          {recording.sample && <Badge>Synthetic sample</Badge>}
          <Button variant="ghost" size="sm" onClick={() => void remove()}>Delete</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {status === "missing" || unplayable ? <RelinkPanel recording={recording} unplayable={unplayable && status !== "missing"} /> : null}
          <Player key={recording.id} recording={recording} startAt={linkedTime} onTime={setTime} onPlaying={onPlaying} onFailed={() => setUnplayable(true)} handle={player} />
          <Timeline durationMs={recording.media.durationMs} time={time} playing={playing} notes={notes} selected={selected} draft={draft} onSeek={seek} onSelect={setSelected} />
          <p className="hidden text-xs text-text-muted sm:block">Space plays or pauses · J and L jump 5 s · N writes a note · on the timeline: arrows move, + and − zoom, ⌘/Ctrl + scroll zooms</p>
          <NoteComposer recording={recording} playhead={time} onDraft={setDraft} focusKey={focusKey} />
        </div>
        <NoteList notes={notes} current={playing ? current : null} selected={selected} onPlay={play} onSelect={setSelected} />
      </div>
    </div>
  );
}
