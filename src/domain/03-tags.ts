import { fail, ok, type Recording, type Result } from "./01-import";
import type { Annotation } from "./02-notes";
import type { Workspace } from "./workspace";

export const TAG_COLORS = ["blue", "green", "amber", "red", "violet", "teal", "pink", "slate"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export interface Tag {
  readonly id: string;
  readonly name: string;
  readonly color: TagColor;
}
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 200;

/** Compares names as a reader would: case, accents, spacing, a leading # and separators don't make a new tag. */
export function tagKey(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/^#+/, "").replace(/[\s_\-–—./]+/g, " ").trim();
}
export function cleanTagName(name: string): string {
  return name.normalize("NFC").replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

export type TagError = "tag-empty" | "tag-too-long" | "tag-exists" | "too-many-tags" | "unknown-tag" | "unknown-note" | "same-tag";
function checkName(ws: Workspace, name: string, except?: string): Result<string, TagError> {
  const value = cleanTagName(name);
  if (!tagKey(value)) return fail("tag-empty", "Give the tag a name.");
  if (value.length > MAX_TAG_LENGTH) return fail("tag-too-long", `Tag names are limited to ${MAX_TAG_LENGTH} characters.`);
  const twin = ws.tags.find(t => t.id !== except && tagKey(t.name) === tagKey(value));
  if (twin) return fail("tag-exists", `There is already a tag “${twin.name}”.`);
  return ok(value);
}

export function createTag(ws: Workspace, name: string, id: string, color?: TagColor): Result<{ workspace: Workspace; tag: Tag }, TagError> {
  if (ws.tags.length >= MAX_TAGS) return fail("too-many-tags", `A workspace can hold up to ${MAX_TAGS} tags.`);
  const value = checkName(ws, name);
  if (!value.ok) return value;
  const tag: Tag = Object.freeze({ id, name: value.value, color: color ?? TAG_COLORS[ws.tags.length % TAG_COLORS.length] });
  return ok({ workspace: { ...ws, tags: [...ws.tags, tag] }, tag });
}
/** The tag with this name, or a new one — what typing a tag on a note does. */
export function ensureTag(ws: Workspace, name: string, id: string): Result<{ workspace: Workspace; tag: Tag }, TagError> {
  const existing = ws.tags.find(t => tagKey(t.name) === tagKey(name));
  return existing && tagKey(name) ? ok({ workspace: ws, tag: existing }) : createTag(ws, name, id);
}
export function renameTag(ws: Workspace, id: string, name: string): Result<Workspace, TagError> {
  if (!ws.tags.some(t => t.id === id)) return fail("unknown-tag", "That tag was deleted.");
  const value = checkName(ws, name, id);
  if (!value.ok) return value;
  return ok({ ...ws, tags: ws.tags.map(t => (t.id === id ? { ...t, name: value.value } : t)) });
}
export function recolorTag(ws: Workspace, id: string, color: TagColor): Result<Workspace, TagError> {
  if (!ws.tags.some(t => t.id === id)) return fail("unknown-tag", "That tag was deleted.");
  return ok({ ...ws, tags: ws.tags.map(t => (t.id === id ? { ...t, color } : t)) });
}
export function deleteTag(ws: Workspace, id: string): Result<Workspace, TagError> {
  if (!ws.tags.some(t => t.id === id)) return fail("unknown-tag", "That tag was already deleted.");
  return ok({
    ...ws,
    tags: ws.tags.filter(t => t.id !== id),
    notes: ws.notes.map(n => (n.tagIds.includes(id) ? { ...n, tagIds: n.tagIds.filter(t => t !== id) } : n)),
  });
}
/** Folds one tag into another: every note keeps a single copy of the surviving tag. */
export function mergeTags(ws: Workspace, fromId: string, intoId: string): Result<Workspace, TagError> {
  if (fromId === intoId) return fail("same-tag", "Choose two different tags to merge.");
  if (!ws.tags.some(t => t.id === fromId) || !ws.tags.some(t => t.id === intoId)) return fail("unknown-tag", "One of those tags was deleted.");
  return ok({
    ...ws,
    tags: ws.tags.filter(t => t.id !== fromId),
    notes: ws.notes.map(n => (n.tagIds.includes(fromId) ? { ...n, tagIds: [...new Set(n.tagIds.map(t => (t === fromId ? intoId : t)))] } : n)),
  });
}
export function toggleTag(ws: Workspace, noteId: string, tagId: string): Result<Workspace, TagError> {
  const note = ws.notes.find(n => n.id === noteId);
  if (!note) return fail("unknown-note", "That note was deleted.");
  if (!ws.tags.some(t => t.id === tagId)) return fail("unknown-tag", "That tag was deleted.");
  const tagIds = note.tagIds.includes(tagId) ? note.tagIds.filter(t => t !== tagId) : [...note.tagIds, tagId];
  return ok({ ...ws, notes: ws.notes.map(n => (n.id === noteId ? { ...n, tagIds } : n)) });
}

/**
 * Tags that look like spellings of one another — "check-out" and "Checkout", "pain point" and "pain points" —
 * which a team ends up with when several people tag. Offered for merging, never merged silently.
 */
export function similarTags(ws: Workspace): Array<[Tag, Tag]> {
  const squash = (t: Tag) => tagKey(t.name).replace(/\s+/g, "").replace(/(?:es|s)$/, "");
  const pairs: Array<[Tag, Tag]> = [];
  for (let i = 0; i < ws.tags.length; i++)
    for (let j = i + 1; j < ws.tags.length; j++)
      if (squash(ws.tags[i]) === squash(ws.tags[j])) pairs.push([ws.tags[i], ws.tags[j]]);
  return pairs;
}
export function tagCounts(ws: Workspace): Map<string, number> {
  const counts = new Map<string, number>(ws.tags.map(t => [t.id, 0]));
  for (const note of ws.notes) for (const id of note.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export interface Query {
  readonly terms: readonly string[];
  readonly tagIds: readonly string[];
  /** `#names` typed in the box that match no tag. */
  readonly unknownTags: readonly string[];
}
/** Splits the search box into words, "quoted phrases" and #tags. */
export function parseQuery(text: string, tags: readonly Tag[]): Query {
  const terms: string[] = [], tagIds: string[] = [], unknownTags: string[] = [];
  for (const match of text.matchAll(/#"([^"]+)"|#(\S+)|"([^"]+)"|(\S+)/g)) {
    const tagName = match[1] ?? match[2];
    if (tagName !== undefined) {
      const tag = tags.find(t => tagKey(t.name) === tagKey(tagName));
      if (tag) tagIds.push(tag.id); else unknownTags.push(tagName);
    } else {
      const term = fold(match[3] ?? match[4]);
      if (term) terms.push(term);
    }
  }
  return { terms, tagIds: [...new Set(tagIds)], unknownTags };
}

export interface SearchHit {
  readonly note: Annotation;
  readonly recording: Recording;
  /** [start, end) ranges in `note.text` to highlight. */
  readonly ranges: ReadonlyArray<readonly [number, number]>;
}
export interface SearchFilter {
  readonly tagIds?: readonly string[];
  readonly recordingIds?: readonly string[];
}
/**
 * Every note whose text (or tag, title or participant) has all the words, carrying all the chosen tags.
 * Accents and case are ignored, so "cafe" finds "Café". Results come per recording, in time order.
 */
export function search(ws: Workspace, query: Query, filter: SearchFilter = {}): SearchHit[] {
  const tagIds = [...new Set([...query.tagIds, ...(filter.tagIds ?? [])])];
  const recordings = new Map(ws.recordings.map(r => [r.id, r]));
  const tagNames = new Map(ws.tags.map(t => [t.id, fold(t.name)]));
  const order = new Map(ws.recordings.map((r, i) => [r.id, i]));
  const hits: SearchHit[] = [];
  for (const note of ws.notes) {
    const recording = recordings.get(note.recordingId);
    if (!recording) continue;
    if (filter.recordingIds?.length && !filter.recordingIds.includes(recording.id)) continue;
    if (!tagIds.every(id => note.tagIds.includes(id))) continue;
    const folded = foldWithMap(note.text);
    const context = [recording.title, recording.consent.participant, ...note.tagIds.map(id => tagNames.get(id) ?? "")].map(fold).join(" ");
    if (!query.terms.every(term => folded.text.includes(term) || context.includes(term))) continue;
    hits.push({ note, recording, ranges: highlight(folded, query.terms) });
  }
  return hits.sort((a, b) => (order.get(a.recording.id)! - order.get(b.recording.id)!) || a.note.start - b.note.start);
}

/** Lower-case, accent-free text for matching. */
export const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
/** The folded text plus, for each folded character, where it came from in the original — so highlights land on the original letters. */
function foldWithMap(text: string): { text: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = fold(char);
    for (let i = 0; i < part.length; i++) map.push(index);
    folded += part;
    index += char.length;
  }
  map.push(text.length);
  return { text: folded, map };
}
function highlight(folded: { text: string; map: number[] }, terms: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let at = folded.text.indexOf(term);
    while (at !== -1) {
      ranges.push([folded.map[at], folded.map[at + term.length] ?? folded.map[folded.map.length - 1]]);
      at = folded.text.indexOf(term, at + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([range[0], range[1]]);
  }
  return merged;
}
