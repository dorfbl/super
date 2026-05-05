import * as db from "./db.js";
import { categorizeItems } from "./ai.js";
import {
  CATEGORY_LABEL_EN,
  CATEGORY_LABEL_HE,
  CATEGORY_ORDER,
  type Category,
} from "./categories.js";

function isHebrew(s: string): boolean {
  return /[֐-׿]/.test(s);
}

const HELP_HE = `פקודות:
- שלח/י פריטים (אחד לשורה או מופרדים בפסיק) — אוסיף לרשימה
- "רשימה" — להציג את הרשימה הנוכחית
- "סיימתי" / "🚩" / "🔴" — סיום קניות וארכוב הרשימה
- "קניתי X" — סמן/י X כנקנה
- "מחק X" — הסר/י X מהרשימה
- "הצעות" — מה אולי שכחת מהרגלים שלך
- "עזרה" — הודעה זו`;

const HELP_EN = `Commands:
- Send items (one per line or comma-separated) — I'll add them to the list
- "list" — show current list
- "done" / "🚩" / "🔴" — finish shopping and archive the list
- "bought X" — mark X as purchased
- "remove X" — remove X from the list
- "suggest" — items you might have forgotten based on your habits
- "help" — show this message`;

const ARCHIVE_TRIGGERS = ["done", "סיימתי", "סיים", "finished", "🚩", "🔴"];
const LIST_TRIGGERS = ["list", "רשימה", "הרשימה"];
const SUGGEST_TRIGGERS = ["suggest", "הצעות", "ideas", "רעיונות"];
const HELP_TRIGGERS = ["help", "עזרה", "?"];

export async function handleMessage(
  text: string,
  fromPhone: string,
): Promise<string> {
  await db.ensureUser(fromPhone);

  const trimmed = text.trim();
  if (!trimmed) return isHebrew(text) ? HELP_HE : HELP_EN;

  const lower = trimmed.toLowerCase();
  const heb = isHebrew(trimmed);

  if (HELP_TRIGGERS.includes(lower)) return heb ? HELP_HE : HELP_EN;

  if (ARCHIVE_TRIGGERS.some((t) => lower === t || trimmed === t)) {
    const result = await db.archiveActiveList();
    return heb
      ? `סיימתי. ${result.archived} פריטים נשמרו לארכיון.`
      : `Done. ${result.archived} items archived.`;
  }

  if (LIST_TRIGGERS.includes(lower)) {
    return formatList(heb);
  }

  if (SUGGEST_TRIGGERS.includes(lower)) {
    return formatSuggestions(heb);
  }

  const boughtMatch = trimmed.match(/^(?:bought|קניתי|✓|✔)\s+(.+)$/iu);
  if (boughtMatch) {
    const item = await db.markBought(boughtMatch[1]);
    if (!item) {
      return heb ? `לא נמצא: ${boughtMatch[1]}` : `Not found: ${boughtMatch[1]}`;
    }
    const name = heb
      ? item.item?.canonical_he ?? item.raw_text
      : item.item?.canonical_en ?? item.raw_text;
    return heb ? `סומן כנקנה: ${name}` : `Marked bought: ${name}`;
  }

  const removeMatch = trimmed.match(/^(?:remove|מחק|הסר)\s+(.+)$/iu);
  if (removeMatch) {
    const item = await db.removeFromList(removeMatch[1]);
    if (!item) {
      return heb ? `לא נמצא: ${removeMatch[1]}` : `Not found: ${removeMatch[1]}`;
    }
    const name = heb
      ? item.item?.canonical_he ?? item.raw_text
      : item.item?.canonical_en ?? item.raw_text;
    return heb ? `הוסר: ${name}` : `Removed: ${name}`;
  }

  return addItems(trimmed, fromPhone, heb);
}

async function addItems(
  text: string,
  fromPhone: string,
  heb: boolean,
): Promise<string> {
  const parts = text
    .split(/[,،\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return heb ? HELP_HE : HELP_EN;

  const known = new Map<string, db.Item>();
  const unknown: string[] = [];
  for (const p of parts) {
    const found = await db.findItemByText(p);
    if (found) known.set(p, found);
    else unknown.push(p);
  }

  if (unknown.length > 0) {
    const parsed = await categorizeItems(unknown);
    for (const r of parsed) {
      const item = await db.upsertItem(
        {
          canonical_he: r.canonical_he,
          canonical_en: r.canonical_en,
          category: r.category,
        },
        r.raw,
      );
      known.set(r.raw, item);
    }
  }

  const list = await db.getOrCreateActiveList();
  for (const [raw, item] of known) {
    await db.addToList(list.id, item.id, raw, fromPhone);
  }

  const lines = [...known.values()].map((it) => {
    const name = heb ? it.canonical_he : it.canonical_en ?? it.canonical_he;
    return `+ ${name}`;
  });
  return heb
    ? `נוספו ${known.size} פריטים:\n${lines.join("\n")}`
    : `Added ${known.size} items:\n${lines.join("\n")}`;
}

async function formatList(heb: boolean): Promise<string> {
  const items = await db.getActiveListItems();
  if (items.length === 0) {
    return heb ? "הרשימה ריקה." : "List is empty.";
  }

  const groups = new Map<Category, db.ListItem[]>();
  for (const li of items) {
    const cat = (li.item?.category ?? "other") as Category;
    let arr = groups.get(cat);
    if (!arr) {
      arr = [];
      groups.set(cat, arr);
    }
    arr.push(li);
  }

  const labels = heb ? CATEGORY_LABEL_HE : CATEGORY_LABEL_EN;
  const remaining = items.filter((i) => !i.bought).length;
  const header = heb
    ? `רשימת קניות (${remaining}/${items.length}):`
    : `Shopping list (${remaining}/${items.length}):`;
  const lines: string[] = [header];

  for (const cat of CATEGORY_ORDER) {
    const inCat = groups.get(cat);
    if (!inCat || inCat.length === 0) continue;
    lines.push("", labels[cat]);
    for (const li of inCat) {
      const name = heb
        ? li.item?.canonical_he ?? li.raw_text
        : li.item?.canonical_en ?? li.raw_text;
      lines.push(li.bought ? `[v] ${name}` : `- ${name}`);
    }
  }
  return lines.join("\n");
}

async function formatSuggestions(heb: boolean): Promise<string> {
  const items = await db.getSuggestions();
  if (items.length === 0) {
    return heb
      ? "אין הצעות עדיין. אסוף קצת היסטוריה של קניות קודם."
      : "No suggestions yet. Build up some shopping history first.";
  }
  const lines = items.map(
    (it) => `- ${heb ? it.canonical_he : it.canonical_en ?? it.canonical_he}`,
  );
  return (heb ? "הצעות (לפי הרגלים):\n" : "Suggestions (based on your habits):\n") + lines.join("\n");
}
