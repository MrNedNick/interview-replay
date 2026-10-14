// Builds the two synthetic sample interviews (macOS `say` voices + ffmpeg) and the line timings the sample study is seeded from.
// Run on macOS: node scripts/make-samples.mjs. Output: public/samples/*.mp4|m4a and src/sample/lines.json.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const INTERVIEWER = "Samantha";
const sessions = [
  {
    id: "maya", voice: "Moira", out: "basket-session-1.mp4", title: "Basket checkout · Session 1", video: true,
    lines: [
      ["I", "Thanks for joining, Maya. Can you tell me how you usually plan your weekly groceries?"],
      ["P", "Mostly on Sunday evening. I make a list on my phone, and then I order from whatever app has a free delivery slot."],
      ["I", "Let's look at the checkout. What did you expect to happen when you tapped Pay?"],
      ["P", "Honestly, I thought it would show me the delivery time first. Instead it jumped straight to the card form, and I wasn't sure if my slot was still reserved."],
      ["I", "How did that feel?"],
      ["P", "A bit stressful. Last month I lost a slot that way, so now I take a screenshot of the time before I pay."],
      ["I", "What about the substitutions step?"],
      ["P", "I skipped it. The word substitutions sounds like extra work. If it said, what should we do if something is out of stock, I would read it."],
      ["I", "If you could change one thing, what would it be?"],
      ["P", "Show the delivery slot and the total on the same screen, right next to the pay button."],
    ],
  },
  {
    id: "jonas", voice: "Daniel", out: "basket-session-2.m4a", title: "Basket checkout · Session 2", video: false,
    lines: [
      ["I", "Thanks, Jonas. How often do you order groceries online?"],
      ["P", "Every week, usually on my lunch break, so I have about ten minutes."],
      ["I", "Walk me through the checkout you just did."],
      ["P", "It was fine until the payment page. I couldn't see when the delivery would arrive, so I scrolled back up to check the slot. That cost me a minute."],
      ["I", "Did anything else slow you down?"],
      ["P", "The substitutions question. I didn't understand it, so I left the default. Later I got oat milk instead of regular milk, which was annoying."],
      ["I", "What would make you trust the checkout more?"],
      ["P", "A clear summary. Time, address, total. One screen. Then I would just press pay."],
    ],
  },
];

const GAP = 0.6; // seconds of silence between turns
const ffprobe = file => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
const work = mkdtempSync(join(tmpdir(), "interview-samples-"));
const outDir = resolve("public/samples");
mkdirSync(outDir, { recursive: true });
mkdirSync(resolve("src/sample"), { recursive: true });
const timings = {};
try {
  for (const session of sessions) {
    const parts = [];
    let clock = 0.8;
    const lines = [];
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.8", join(work, "lead.wav")]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", String(GAP), join(work, "gap.wav")]);
    parts.push(join(work, "lead.wav"));
    session.lines.forEach(([speaker, text], index) => {
      const aiff = join(work, `${session.id}-${index}.aiff`);
      const wav = join(work, `${session.id}-${index}.wav`);
      execFileSync("say", ["-v", speaker === "I" ? INTERVIEWER : session.voice, "-r", "185", "-o", aiff, text]);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-ar", "22050", "-ac", "1", wav]);
      const length = ffprobe(wav);
      lines.push({ speaker: speaker === "I" ? "Interviewer" : "Participant", text, start: Math.round(clock * 1000), end: Math.round((clock + length) * 1000) });
      clock += length + GAP;
      parts.push(wav, join(work, "gap.wav"));
    });
    const list = join(work, `${session.id}.txt`);
    writeFileSync(list, parts.map(p => `file '${p}'`).join("\n"));
    const audio = join(work, `${session.id}-all.wav`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", audio]);
    const target = join(outDir, session.out);
    if (session.video) {
      const font = "/System/Library/Fonts/Helvetica.ttc";
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", audio, "-filter_complex",
        `[0:a]showwaves=s=640x200:mode=cline:rate=15:colors=#5b86ff:draw=full,format=rgba[w];color=c=0x14171c:s=640x360:r=15,format=rgba[bg];[bg][w]overlay=0:110:shortest=1,drawtext=fontfile=${font}:text='${session.title}':fontcolor=0xeef1f5:fontsize=22:x=24:y=28,drawtext=fontfile=${font}:text='Synthetic sample · no real participant':fontcolor=0x9aa4b2:fontsize=15:x=24:y=60,format=yuv420p[v]`,
        "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "slow", "-crf", "34", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", target]);
    } else {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", audio, "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", target]);
    }
    timings[session.id] = { file: session.out, title: session.title, durationMs: Math.round(ffprobe(target) * 1000), lines };
    console.log(`${session.out}: ${timings[session.id].durationMs} ms`);
  }
  writeFileSync(resolve("src/sample/lines.json"), JSON.stringify(timings, null, 2) + "\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
