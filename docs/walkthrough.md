# Interview Replay — walkthrough

Open the app (`npm run dev`, or serve this folder: `npx vite preview --outDir .` from the demo archive) and follow the steps. Every step is also an automated Playwright scenario (`test/e2e`), run at 1440 px and 360 px.

## 1. Import a recording

1. On an empty page choose **Import recording** and pick an audio or video file. A PDF is refused (“is not an audio or video file”); a file the browser can't measure is refused with a reason.
2. The dialog shows the file's length and size. **Import** stays disabled until the consent box is ticked: participant, the date they agreed, and the scope — *Review inside the team only* or *Clips may be shared outside the team*.
3. Untick **Keep a copy of the file in this browser** and import. The recording opens with the badge *This visit only*.
4. Reload. The page asks for the file. Choose a different recording: refused with both lengths. Choose the same file under another name: accepted and now *Kept in this browser*.
5. A file with the same length but other bytes (another export of the interview) asks **Use this version?** first.

| Case | Expected |
|---|---|
| Same file imported twice | refused, names the existing recording |
| No consent / no participant / date in the future | Import disabled / distinct error |
| File moved or renamed | recognised by fingerprint |
| Different recording | refused: “x.wav (0:20) isn't this recording: expected …” |

## 2. Notes on the timeline

1. **Try the sample study**, open *Basket checkout · Session 1* and press ▶ on the note at 0:18 — playback starts there, the note is highlighted while it plays.
2. Type a note while it plays. The time is the moment you started typing. End it with `#hesitation` and press Enter: the tag is applied and removed from the text.
3. Type `2:00` as the time: refused, past the end. Type `soon`: refused, not a time.
4. On the timeline: **+** / **−** / **Fit**, ‹ › to scroll, the overview strip to jump; focused, the arrows move the playhead by 5 s (Shift: 30 s), `0` fits the whole recording. ⌘/Ctrl + scroll zooms around the pointer.
5. Delete a note that a finding cites: the page asks first and the finding loses that support.

## 3. Tags and search

1. **Search** `SUBSTITUTIONS` — two notes in two interviews, the word highlighted.
2. `"delivery time" #checkout` combines a phrase and a tag; `#nothing` says no such tag exists; `jonas` finds every note of that participant. Results open the interview at the moment.
3. Tag a note `check-out`. The tag list offers to merge it into `#Checkout`.

## 4. Reels

1. **Reels** → *Slot anxiety at payment*: clip 1 is video from session 1, clip 2 audio from session 2. When clip 1 reaches its end, clip 2 starts.
2. Move clips with ↑ ↓, trim with From / to (a clip under a second is refused and the times are restored), edit captions.
3. **Download clip list** writes the shareable version: participants as codes, team-only clips left out and counted.

## 5. Findings

1. Each finding shows its support: *Pattern · 2 participants · 3 moments*, *One participant*, or *No evidence yet*.
2. ▶ on a cited moment plays just that moment in a dialog.
3. **Add evidence** searches every note; or, in an interview, **Use…** → *Evidence for a finding* / *Clip in a reel*.

## 6. Export and deletion

1. **Data** → the report preview, *For people outside the team* on by default: names become P1, P2…, the team-only interview isn't quoted, and each finding says how many moments were not quoted.
2. **Download study**, then in a fresh browser profile **Open a study file**: the recordings arrive as *File needed*; choosing the file (any name) reconnects it.
3. **Delete their data** for a participant: their recording, stored file, notes, clips and citations go, and their name is replaced in the team's remaining notes and findings.

| Edge case | Where it is checked |
|---|---|
| Moved or renamed media | `test/01-import.test.ts`, `test/e2e/import.spec.ts`, `test/e2e/data.spec.ts` |
| Hour-long recording, 3,000 notes | `test/02-notes.test.ts`, `test/06-export.test.ts` |
| Different versions (re-exported media, older and newer study files) | `test/01-import.test.ts`, `test/06-export.test.ts`, `test/e2e/import.spec.ts` |
| Personal data in exports | `test/06-export.test.ts`, `test/e2e/data.spec.ts` |
