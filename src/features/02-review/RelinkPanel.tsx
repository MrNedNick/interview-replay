import { useRef, useState } from "react";
import { Button } from "../../components/button/button";
import { Checkbox } from "../../components/checkbox/checkbox";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { formatBytes, formatTime, matchMedia, ok, type Recording } from "../../domain/01-import";
import { useStudy } from "../../app/study";
import { MEDIA_ACCEPT, probeFile } from "../01-import/ImportDialog";

/**
 * Asks for a recording's file when it isn't in this browser — a reload without a stored copy, the study
 * opened elsewhere, the file moved. The same file is recognised by its fingerprint whatever its name now;
 * another export of the same interview is accepted after asking; a different recording is refused.
 */
export function RelinkPanel({ recording, unplayable = false }: { recording: Recording; unplayable?: boolean }) {
  const { attachMedia, apply } = useStudy();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { media } = recording;

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const probe = await probeFile(file);
    if (probe.status === "error") { setBusy(false); setError(probe.message); return; }
    const match = matchMedia(media, { name: file.name, fingerprint: probe.fingerprint, durationMs: probe.durationMs });
    if (!match.ok) { setBusy(false); setError(match.error.message); return; }
    if (match.value === "other-version" && !(await confirm({
      title: "Use this version?",
      description: `${file.name} isn't byte-for-byte the file you imported, but it is the same length (${formatTime(probe.durationMs)}) — probably another export of this interview. Notes keep their times; if the edit differs, they will point at the wrong moments.`,
      confirmLabel: "Use this file",
    }))) { setBusy(false); return; }
    await attachMedia(recording.id, file, keep);
    if (match.value !== "same") {
      // Remember the file as it is now, so it is recognised directly next time.
      await apply(ws => ok({ ...ws, recordings: ws.recordings.map(r => (r.id === recording.id ? { ...r, media: { ...r.media, name: file.name, type: file.type || r.media.type, size: file.size, fingerprint: probe.fingerprint, durationMs: probe.durationMs } } : r)) }));
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
      <p className="font-medium">{unplayable ? "Choose a playable copy of this recording" : "This recording's file isn't in this browser"}</p>
      <p className="mt-1 text-sm text-text-muted">
        Choose <span className="font-medium text-text break-all">{media.name}</span> ({formatBytes(media.size)}, {formatTime(media.durationMs)}) — even if it has been moved or renamed since.
        Your notes are kept either way.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept={MEDIA_ACCEPT} className="sr-only" aria-label={`File for ${recording.title}`} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
        <Button size="sm" onClick={() => input.current?.click()} loading={busy}>Choose file</Button>
        <Checkbox checked={keep} onChange={event => setKeep(event.target.checked)} label="Keep a copy in this browser" />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
