import { useState } from "react";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { EmptyState } from "../../components/empty-state/empty-state";
import { useToast } from "../../components/toast/toast";
import { formatTime, type Recording } from "../../domain/01-import";
import { href } from "../../app/route";
import { newId, useStudy, type MediaStatus } from "../../app/study";
import { ImportDialog } from "./ImportDialog";
import { buildSample } from "./sample";

export const MEDIA_LABEL: Record<MediaStatus, { text: string; tone: "success" | "accent" | "warning" }> = {
  stored: { text: "Kept in this browser", tone: "success" },
  session: { text: "This visit only", tone: "accent" },
  missing: { text: "File needed", tone: "warning" },
};

export function Library() {
  const { workspace, replace, attachMedia, mediaStatus } = useStudy();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const hasSample = workspace.recordings.some(r => r.sample);

  async function trySample() {
    setLoadingSample(true);
    const sample = await buildSample(workspace, import.meta.env.BASE_URL, newId);
    setLoadingSample(false);
    if ("error" in sample) { toast.error(sample.error); return; }
    for (const { recordingId, blob } of sample.media) await attachMedia(recordingId, blob, true);
    await replace(sample.workspace);
    toast.success("Sample study added: two interviews, nine notes, three findings and a reel.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
          <p className="mt-1 max-w-xl text-sm text-text-muted">Note moments as you replay a recording, tag them, and back your findings with the moments that show them. Recordings stay on this device.</p>
        </div>
        {!hasSample && workspace.recordings.length > 0 && <Button variant="ghost" onClick={() => void trySample()} loading={loadingSample}>Add the sample study</Button>}
        <Button onClick={() => setImporting(true)}>Import recording</Button>
      </div>
      {workspace.recordings.length === 0 ? (
        <EmptyState title="No interviews yet"
          description="Import an audio or video recording with the participant's consent — or open the sample study: two short synthetic interviews about a grocery checkout, already annotated."
          action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setImporting(true)}>Import recording</Button><Button variant="outline" onClick={() => void trySample()} loading={loadingSample}>Try the sample study</Button></div>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workspace.recordings.map(r => <RecordingCard key={r.id} recording={r} notes={workspace.notes.filter(n => n.recordingId === r.id).length} media={mediaStatus(r.id)} />)}
        </ul>
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} onImported={(id, stored) => {
        setImporting(false);
        if (!stored) toast.info("The file is open for this visit only — after a reload the page will ask for it again.");
        location.hash = href.review(id);
      }} />
    </div>
  );
}

function RecordingCard({ recording, notes, media }: { recording: Recording; notes: number; media: MediaStatus }) {
  const label = MEDIA_LABEL[media];
  return (
    <li>
      <a href={href.review(recording.id)} className="block h-full rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/60">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">{recording.media.kind === "video" ? "▶" : "♪"}</span>
          <div className="min-w-0">
            <p className="font-medium break-words">{recording.title}</p>
            <p className="text-sm text-text-muted">{recording.consent.participant} · {formatTime(recording.media.durationMs)} · {notes} {notes === 1 ? "note" : "notes"}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone={label.tone}>{label.text}</Badge>
          <Badge>{recording.consent.scope === "share" ? "May be shared" : "Team only"}</Badge>
          {recording.sample && <Badge>Synthetic sample</Badge>}
        </div>
      </a>
    </li>
  );
}
