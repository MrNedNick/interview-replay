import { describe, expect, it } from "vitest";
import { createTag, deleteTag, ensureTag, mergeTags, parseQuery, renameTag, search, similarTags, tagCounts, tagKey, toggleTag } from "../src/domain/03-tags";
import type { Workspace } from "../src/domain/workspace";
import { study } from "./fixtures/study";

function tagged(): Workspace {
  let ws = study();
  for (const [id, name] of [["t1", "Checkout"], ["t2", "Substitutions"], ["t3", "check-out"]]) {
    const made = createTag(ws, name, id);
    if (!made.ok) throw new Error(made.error.message);
    ws = made.value.workspace;
  }
  for (const [note, tag] of [["n1", "t1"], ["n2", "t2"], ["n3", "t3"], ["n4", "t2"]]) {
    const next = toggleTag(ws, note, tag);
    if (!next.ok) throw new Error(next.error.message);
    ws = next.value;
  }
  return ws;
}

describe("tags contract", () => {
  it("treats case, accents, # and separators as the same tag", () => {
    expect(tagKey("#Café  Flow")).toBe(tagKey("cafe-flow"));
    const ws = tagged();
    expect(createTag(ws, "#substitutions", "x")).toMatchObject({ ok: false, error: { code: "tag-exists" } });
    expect(createTag(ws, " # ", "x")).toMatchObject({ ok: false, error: { code: "tag-empty" } });
    expect(createTag(ws, "x".repeat(41), "x")).toMatchObject({ ok: false, error: { code: "tag-too-long" } });
    expect(ensureTag(ws, "SUBSTITUTIONS", "x")).toMatchObject({ ok: true, value: { tag: { id: "t2" } } });
  });
  it("renames, deletes from every note, and toggles", () => {
    const ws = tagged();
    expect(renameTag(ws, "t2", "Checkout")).toMatchObject({ ok: false, error: { code: "tag-exists" } });
    const deleted = deleteTag(ws, "t2");
    expect(deleted.ok && deleted.value.notes.every(n => !n.tagIds.includes("t2"))).toBe(true);
    const off = toggleTag(ws, "n1", "t1");
    expect(off.ok && off.value.notes.find(n => n.id === "n1")?.tagIds).toEqual([]);
  });
  it("offers spellings of one tag for merging and merges without duplicates", () => {
    const ws = tagged();
    expect(similarTags(ws).map(([a, b]) => [a.name, b.name])).toEqual([["Checkout", "check-out"]]);
    const withBoth = toggleTag(ws, "n3", "t1");
    if (!withBoth.ok) throw new Error();
    const merged = mergeTags(withBoth.value, "t3", "t1");
    expect(merged.ok && merged.value.notes.find(n => n.id === "n3")?.tagIds).toEqual(["t1"]);
    expect(merged.ok && tagCounts(merged.value).get("t1")).toBe(2);
    expect(mergeTags(ws, "t1", "t1")).toMatchObject({ ok: false, error: { code: "same-tag" } });
  });
});

describe("search", () => {
  const ws = tagged();
  it("splits words, phrases and #tags and reports unknown tags", () => {
    expect(parseQuery('slot #checkout "extra work" #missing', ws.tags)).toEqual({ terms: ["slot", "extra work"], tagIds: ["t1"], unknownTags: ["missing"] });
  });
  it("finds notes across interviews by words, ignoring case and accents, in time order", () => {
    const hits = search(ws, parseQuery("SUBSTITUTIONS", ws.tags));
    expect(hits.map(h => h.note.id)).toEqual(["n2", "n4"]);
    expect(hits[0].ranges).toEqual([[8, 21]]);
    const accented = { ...ws, notes: ws.notes.map(n => (n.id === "n3" ? { ...n, text: "Résumé of the slot" } : n)) };
    const found = search(accented, parseQuery("resume", ws.tags));
    expect(found.map(h => h.note.id)).toEqual(["n3"]);
    expect(found[0].ranges).toEqual([[0, 6]]);
  });
  it("filters by tags and recordings, and matches participant names", () => {
    expect(search(ws, parseQuery("#substitutions", ws.tags), { recordingIds: ["r2"] }).map(h => h.note.id)).toEqual(["n4"]);
    expect(search(ws, parseQuery("jonas", ws.tags)).map(h => h.note.id)).toEqual(["n3", "n4"]);
    expect(search(ws, parseQuery("nothing-like-this", ws.tags))).toEqual([]);
  });
});
