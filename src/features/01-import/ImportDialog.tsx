import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/button/button";
import { Checkbox, Radio } from "../../components/checkbox/checkbox";
import { Field } from "../../components/field/field";
import { Input } from "../../components/input/input";
import { Modal } from "../../components/modal/modal";
import { checkMediaFile, createRecording, formatBytes, formatTime, type ConsentScope, type MediaKind, type Ms } from "../../domain/01-import";
import { askToPersist } from "../../adapters/store";
import { fingerprint, probeDuration } from "../../adapters/media";
import { newId, useStudy } from "../../app/study";
import { today } from "../../app/download";

type Probe =
  | { status: "idle" }
  | { status: "reading"; file: File }
  | { status: "ready"; file: File; kind: MediaKind; durationMs: Ms; fingerprint: string }
  | { status: "error"; message: string };

export const MEDIA_ACCEPT = "audio/*,video/*,.m4a,.mp3,.wav,.aac,.flac,.ogg,.opus,.mp4,.m4v,.mov,.webm,.mkv";

/** Reads what the browser needs to know about a chosen file: is it media, how long, and its fingerprint. */
export async function probeFile(file: File): Promise<Exclude<Probe, { status: "idle" | "reading" }>> {
  const kind = checkMediaFile(file);
  if (!kind.ok) return { status: "error", message: kind.error.message };
  const [duration, print] = await Promise.all([probeDuration(file, kind.value), fingerprint(file)]);
  if (!duration.ok) return { status: "error", message: duration.error.message };
  return { status: "ready", file, kind: kind.value, durationMs: duration.value, fingerprint: print };
}

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (recordingId: string, stored: boolean) => void }) {
  const { workspace, apply, attachMedia } = useStudy();
  const [probe, setProbe] = useState<Probe>({ status: "idle" });
  const [title, setTitle] = useState("");
  const [participant, setParticipant] = useState("");
  const [date, setDate] = useState(today);
  const [scope, setScope] = useState<ConsentScope>("team");
  const [consent, setConsent] = useState(false);
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const scopeName = useId();

  function reset() {
    setProbe({ status: "idle" }); setTitle(""); setParticipant(""); setDate(today()); setScope("team"); setConsent(false); setKeep(true); setError(null);
  }
  function close() { reset(); onClose(); }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProbe({ status: "reading", file });
    const result = await probeFile(file);
    setProbe(result);
    if (result.status === "ready") setTitle(t => t || file.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (probe.status !== "ready") return;
    const id = newId();
    const input = { file: probe.file, kind: probe.kind, durationMs: probe.durationMs, fingerprint: probe.fingerprint, title, participant, consentGiven: consent, consentDate: date, scope };
    const checked = createRecording(input, workspace.recordings, id, new Date());
    if (!checked.ok) { setError(checked.error.message); return; }
    setBusy(true);
    const attached = await attachMedia(id, probe.file, keep);
    const refused = await apply(ws => {
      const made = createRecording(input, ws.recordings, id, new Date());
      return made.ok ? { ok: true, value: { ...ws, recordings: [...ws.recordings, made.value] } } : made;
    });
    setBusy(false);
    if (refused) { setError(refused.message); return; }
    if (keep) void askToPersist();
    reset();
    onImported(id, keep && attached);
  }

  const ready = probe.status === "ready";
  const who = participant.trim() || "The participant";
  return (
    <Modal open={open} onClose={close} title="Import a recording" size="lg"
      actions={<>
        <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
        <Button size="sm" type="submit" form="import-form" disabled={!ready || !consent} loading={busy}>Import</Button>
      </>}>
      <form id="import-form" onSubmit={submit} className="space-y-4" noValidate>
        <div
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]); }}
          className={`rounded-md border border-dashed px-4 py-5 text-center text-sm ${dragging ? "border-accent bg-accent/5" : "border-border"}`}
        >
          {probe.status === "reading" ? (
            <p aria-live="polite">Reading {probe.file.name}…</p>
          ) : ready ? (
            <p aria-live="polite"><span className="font-medium break-all">{probe.file.name}</span> <span className="text-text-muted">· {probe.kind} · {formatTime(probe.durationMs)} · {formatBytes(probe.file.size)}</span></p>
          ) : (
            <p className="text-text-muted">Drop an audio or video recording here, or choose one. It stays on this device.</p>
          )}
          <input ref={input} type="file" accept={MEDIA_ACCEPT} className="sr-only" aria-label="Recording file" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
          <Button variant="outline" size="sm" className="mt-3" onClick={() => input.current?.click()}>{ready ? "Choose another file" : "Choose file"}</Button>
          {probe.status === "error" && <p role="alert" className="mt-3 text-sm text-danger">{probe.message}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Checkout study · Session 3" maxLength={120} /></Field>
          <Field label="Participant" hint="A first name or an alias such as P4." required><Input value={participant} onChange={e => setParticipant(e.target.value)} maxLength={60} autoComplete="off" /></Field>
        </div>
        <fieldset className="space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium">Consent</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6" role="radiogroup" aria-label="What the participant agreed to">
            <Radio name={scopeName} checked={scope === "team"} onChange={() => setScope("team")} label="Review inside the team only" />
            <Radio name={scopeName} checked={scope === "share"} onChange={() => setScope("share")} label="Clips may be shared outside the team" />
          </div>
          <Field label="Date consent was given"><Input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className="sm:max-w-48" /></Field>
          <Checkbox checked={consent} onChange={e => setConsent(e.target.checked)} label={`${who} agreed to be recorded and to this use.`} />
        </fieldset>
        <Checkbox checked={keep} onChange={e => setKeep(e.target.checked)}
          label={<span>Keep a copy of the file in this browser{ready ? ` (${formatBytes(probe.file.size)})` : ""}<span className="block text-xs text-text-muted">Otherwise the page asks for the file again after a reload.</span></span>} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
