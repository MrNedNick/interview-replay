// Turns the relative-base build in artifacts/demo into a self-contained archive with the walkthrough and checksums.
import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve("artifacts/demo");
await cp("docs/walkthrough.md", join(root, "README.md"));
async function files(path, prefix = "") {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(path, entry.name), relative + "/"));
    else if (relative !== "SHA256SUMS") result.push(relative);
  }
  return result.sort();
}
const sums = await Promise.all((await files(root)).map(async file => `${createHash("sha256").update(await readFile(join(root, file))).digest("hex")}  ${file}`));
await writeFile(join(root, "SHA256SUMS"), sums.join("\n") + "\n");
const archive = resolve("artifacts/interview-replay-demo.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", root, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
console.log(`Demo: ${archive}`);
