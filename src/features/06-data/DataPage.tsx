import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Checkbox } from "../../components/checkbox/checkbox";
import { useConfirm } from "../../components/confirm-dialog/confirm-dialog";
import { useToast } from "../../components/toast/toast";
import { formatBytes, formatTime } from "../../domain/01-import";
import { buildReport, deleteParticipant, exportStudy, notesCsv, participants, readStudy } from "../../domain/06-export";
import { storageEstimate } from "../../adapters/store";
import { download, today } from "../../app/download";
import { useStudy } from "../../app/study";
import { MEDIA_LABEL } from "../01-import/Library";

/** Everything that leaves the browser or is removed from it: study files, reports, and a participant's data. */
export function DataPage() {
  const { workspace, replace, mediaStatus, eraseAll } = useStudy();
  const confirm = useConfirm();
  const toast = useToast();
  const [shareable, setShareable] = useState(true);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const people = useMemo(() => participants(workspace), [workspace]);
  const report = useMemo(() => buildReport(workspace, { shareable }, new Date()), [workspace, shareable]);
  useEffect(() => { void storageEstimate().then(setUsage); }, [workspace]);
  const empty = workspace.recordings.length === 0;

  async function openStudy(file: File | undefined) {
    if (!file) return;
    const read = readStudy(await file.text());
    if (!read.ok) { setOpenError(read.error.message); return; }
    setOpenError(null);
    const { workspace: next, repaired } = read.value;
    if (!empty && !(await confirm({ title: "Replace this study?", description: `${file.name} has ${next.recordings.length} recordings and ${next.notes.length} notes. It replaces everything here; stored files of recordings not in it are deleted. Download this study first if you need it.`, confirmLabel: "Replace", variant: "danger" }))) return;
    const keep = new Set(next.recordings.map(r => r.id));
    await replace(next, workspace.recordings.filter(r => !keep.has(r.id)).map(r => r.id));
    toast.success(`Opened ${file.name}.${repaired ? ` ${repaired} broken ${repaired === 1 ? "link was" : "links were"} dropped.` : ""} Choose each recording's file to play it.`);
  }
  async function forget(name: string) {
    const removal = deleteParticipant(workspace, name);
    if (!removal.ok) return;
    const { recordingIds, notes, clips, evidence } = removal.value;
    const ok = await confirm({
      title: `Delete all of ${name}'s data?`,
      description: `${recordingIds.length === 1 ? "Their recording and its stored file" : `Their ${recordingIds.length} recordings and the stored files`}, ${notes} ${notes === 1 ? "note" : "notes"}, ${clips} ${clips === 1 ? "clip" : "clips"} and ${evidence} ${evidence === 1 ? "citation" : "citations"} go, and their name is taken out of the team's remaining notes and findings. Findings stay. Exports you already downloaded aren't affected. This can't be undone.`,
      confirmLabel: "Delete everything about them",
      variant: "danger",
    });
    if (!ok) return;
    await replace(removal.value.workspace, recordingIds);
    toast.success(`${name}'s data was deleted from this browser.`);
  }
  async function eraseEverything() {
    if (!(await confirm({ title: "Delete everything?", description: "Every recording, stored file, note, tag, reel and finding in this browser. This can't be undone.", confirmLabel: "Delete everything", variant: "danger" }))) return;
    await eraseAll();
    toast.success("Everything was deleted from this browser.");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="mt-1 max-w-xl text-sm text-text-muted">Everything lives in this browser: {workspace.recordings.length} recordings, {workspace.notes.length} notes{usage ? ` · ${formatBytes(usage.usage)} used of ${formatBytes(usage.quota)} available` : ""}. Nothing is uploaded anywhere.</p>
      </div>

      <section aria-labelledby="study-file" className="space-y-3">
        <h2 id="study-file" className="text-lg font-semibold">Study file</h2>
        <p className="text-sm text-text-muted">The whole study — recordings' details, consent, notes, tags, reels, findings — in one JSON file, without the media. Open it in another browser and choose each recording's file there; it is recognised by its fingerprint even if renamed.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={empty} onClick={() => download(`interview-study-${today()}.json`, exportStudy(workspace, new Date()), "application/json")}>Download study</Button>
          <input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Study file to open" onChange={e => { void openStudy(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => input.current?.click()}>Open a study file</Button>
        </div>
        {openError && <p role="alert" className="text-sm text-danger">{openError}</p>}
      </section>

      <section aria-labelledby="report" className="space-y-3">
        <h2 id="report" className="text-lg font-semibold">Findings report</h2>
        <Checkbox checked={shareable} onChange={e => setShareable(e.target.checked)}
          label={<span>For people outside the team<span className="block text-xs text-text-muted">Names become P1, P2… everywhere, and moments from participants who agreed to team review only are left out.</span></span>} />
        {report.withheld > 0 && <p className="text-sm text-text-muted">{report.withheld} {report.withheld === 1 ? "moment isn’t" : "moments aren’t"} quoted: those participants agreed to team review only.</p>}
        <pre aria-label="Report preview" tabIndex={0} className="max-h-80 overflow-auto rounded-md border border-border bg-surface-raised p-3 text-xs whitespace-pre-wrap break-words">{report.markdown}</pre>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={empty} onClick={() => download(`findings-${shareable ? "shareable-" : ""}${today()}.md`, report.markdown, "text/markdown;charset=utf-8")}>Download report (.md)</Button>
          <Button variant="outline" disabled={empty} onClick={() => download(`notes-${shareable ? "shareable-" : ""}${today()}.csv`, "﻿" + notesCsv(workspace, { shareable }), "text/csv;charset=utf-8")}>Download notes (.csv)</Button>
        </div>
      </section>

      <section aria-labelledby="people" className="space-y-3">
        <h2 id="people" className="text-lg font-semibold">Participants</h2>
        <p className="text-sm text-text-muted">When someone withdraws consent, delete everything about them in one step.</p>
        {people.length === 0 ? <p className="text-sm text-text-muted">No participants yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {people.map(person => (
              <li key={person.name} className="flex flex-wrap items-center gap-2 p-3">
                <div className="mr-auto min-w-0">
                  <p className="font-medium">{person.name}</p>
                  <p className="text-xs text-text-muted">{person.recordings.map(r => `${r.title} (${formatTime(r.media.durationMs)}, consent ${r.consent.date})`).join(" · ")} · {person.notes} notes</p>
                  <div className="mt-1 flex flex-wrap gap-1">{person.recordings.map(r => <Badge key={r.id} tone={MEDIA_LABEL[mediaStatus(r.id)].tone}>{MEDIA_LABEL[mediaStatus(r.id)].text}</Badge>)}</div>
                </div>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => void forget(person.name)}>Delete their data</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="erase" className="space-y-3 border-t border-border pt-6">
        <h2 id="erase" className="text-lg font-semibold">Delete everything</h2>
        <Button variant="danger" disabled={empty && workspace.tags.length === 0} onClick={() => void eraseEverything()}>Delete everything in this browser</Button>
      </section>
    </div>
  );
}
