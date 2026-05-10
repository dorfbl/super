import * as db from "./db.js";
import { categorizeItems } from "./ai.js";
import {
  CATEGORIES,
  CATEGORY_LABEL_EN,
  CATEGORY_LABEL_HE,
  CATEGORY_ORDER,
  type Category,
} from "./categories.js";

function isHebrew(s: string): boolean {
  return /[֐-׿]/.test(s);
}

async function getLang(text: string): Promise<"he" | "en"> {
  const setting = await db.getSetting("lang");
  if (setting === "he") return "he";
  if (setting === "en") return "en";
  return isHebrew(text) ? "he" : "en";
}

const HELP_HE = `פקודות (טקסט חופשי או /):
- שלח/י פריטים (אחד לשורה או מופרדים בפסיק) — מוסיף לרשימה
- "רשימה" — להציג את הרשימה
- "סיימתי" / 🚩 / 🔴 — סיום ארכוב הרשימה
- "קניתי X" — סמן/י כנקנה
- "מחק X" — הסרה מהרשימה
- "הצעות" — מה אולי שכחת

פקודות נוספות:
- /btw <טקסט> — להתעלם משורה זו
- /quiet on|off — מצב שקט (ללא אישורי הוספה)
- /undo — בטל את הפריט האחרון שנוסף
- /clear — נקה את הרשימה ללא ארכוב
- /category <קטגוריה> <פריט> — שייך מחדש
- /rename <ישן> | <חדש> — שנה שם פריט
- /lang he|en|auto — שפת תגובות
- /who <פריט> — מי הוסיף את הפריט
- /freq <פריט> — שכיחות קנייה ב-8 שבועות אחרונים
- /snooze <פריט> [שבועות] — הסתר מהצעות (ברירת מחדל: 4)
- /help — הודעה זו`;

const HELP_EN = `Commands (free text or /):
- Send items (one per line or comma-separated) — adds to list
- "list" — show current list
- "done" / 🚩 / 🔴 — finish shopping (archive list)
- "bought X" — mark X as purchased
- "remove X" — remove X from list
- "suggest" — items you might have forgotten

More:
- /btw <text> — ignore this line
- /quiet on|off — quiet mode (no 'added' confirmations)
- /undo — undo the last added item
- /clear — wipe the active list without archiving
- /category <cat> <item> — recategorize
- /rename <old> | <new> — rename an item
- /lang he|en|auto — reply language
- /who <item> — who added this item
- /freq <item> — purchase frequency over the last 8 weeks
- /snooze <item> [weeks] — hide from suggestions (default 4)
- /help — this message`;

const ARCHIVE_TRIGGERS = ["done", "סיימתי", "סיים", "finished", "🚩", "🔴"];
const LIST_TRIGGERS = ["list", "רשימה", "הרשימה"];
const SUGGEST_TRIGGERS = ["suggest", "הצעות", "ideas", "רעיונות"];
const HELP_TRIGGERS = ["help", "עזרה", "?"];

export async function handleMessage(
  text: string,
  fromPhone: string,
): Promise<string | null> {
  await db.ensureUser(fromPhone);

  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    return handleSlash(trimmed, fromPhone);
  }

  const lang = await getLang(trimmed);
  const heb = lang === "he";
  const lower = trimmed.toLowerCase();

  if (HELP_TRIGGERS.includes(lower)) return heb ? HELP_HE : HELP_EN;

  if (ARCHIVE_TRIGGERS.some((t) => lower === t || trimmed === t)) {
    const result = await db.archiveActiveList();
    return heb
      ? `סיימתי. ${result.archived} פריטים נשמרו לארכיון.`
      : `Done. ${result.archived} items archived.`;
  }

  if (LIST_TRIGGERS.includes(lower)) return formatList(heb);
  if (SUGGEST_TRIGGERS.includes(lower)) return formatSuggestions(heb);

  const boughtMatch = trimmed.match(/^(?:bought|קניתי|✓|✔)\s+(.+)$/iu);
  if (boughtMatch) {
    const item = await db.markBought(boughtMatch[1]);
    if (!item) {
      return heb
        ? `לא נמצא: ${boughtMatch[1]}`
        : `Not found: ${boughtMatch[1]}`;
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
      return heb
        ? `לא נמצא: ${removeMatch[1]}`
        : `Not found: ${removeMatch[1]}`;
    }
    const name = heb
      ? item.item?.canonical_he ?? item.raw_text
      : item.item?.canonical_en ?? item.raw_text;
    return heb ? `הוסר: ${name}` : `Removed: ${name}`;
  }

  return addItems(trimmed, fromPhone, heb);
}

async function handleSlash(
  text: string,
  fromPhone: string,
): Promise<string | null> {
  const m = text.match(/^\/(\S+)(?:\s+(.*))?$/su);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const args = (m[2] ?? "").trim();
  const lang = await getLang(text);
  const heb = lang === "he";

  switch (cmd) {
    case "btw":
      return null;
    case "quiet":
    case "silent":
      return cmdQuiet(args, heb);
    case "undo":
      return cmdUndo(heb);
    case "clear":
      return cmdClear(heb);
    case "category":
    case "cat":
      return cmdCategory(args, heb);
    case "rename":
      return cmdRename(args, heb);
    case "lang":
      return cmdLang(args);
    case "who":
      return cmdWho(args, heb);
    case "freq":
      return cmdFreq(args, heb);
    case "snooze":
      return cmdSnooze(args, heb);
    case "help":
      return heb ? HELP_HE : HELP_EN;
    case "list":
      return formatList(heb);
    case "suggest":
      return formatSuggestions(heb);
    case "done":
    case "archive": {
      const result = await db.archiveActiveList();
      return heb
        ? `סיימתי. ${result.archived} פריטים נשמרו לארכיון.`
        : `Done. ${result.archived} items archived.`;
    }
    case "bought": {
      const item = await db.markBought(args);
      if (!item) return heb ? `לא נמצא: ${args}` : `Not found: ${args}`;
      const name = heb
        ? item.item?.canonical_he ?? item.raw_text
        : item.item?.canonical_en ?? item.raw_text;
      return heb ? `סומן כנקנה: ${name}` : `Marked bought: ${name}`;
    }
    case "remove": {
      const item = await db.removeFromList(args);
      if (!item) return heb ? `לא נמצא: ${args}` : `Not found: ${args}`;
      const name = heb
        ? item.item?.canonical_he ?? item.raw_text
        : item.item?.canonical_en ?? item.raw_text;
      return heb ? `הוסר: ${name}` : `Removed: ${name}`;
    }
    default:
      return heb
        ? `פקודה לא ידועה: /${cmd}. נסה/י /help`
        : `Unknown command: /${cmd}. Try /help`;
  }
}

async function cmdQuiet(arg: string, heb: boolean): Promise<string> {
  const a = arg.trim().toLowerCase();
  if (["on", "true", "1", "yes"].includes(a)) {
    await db.setSetting("quiet", "1");
    return heb
      ? "מצב שקט פעיל. אין יותר אישורי הוספה."
      : "Quiet mode on. No more 'added' confirmations.";
  }
  if (["off", "false", "0", "no"].includes(a)) {
    await db.setSetting("quiet", "0");
    return heb ? "מצב שקט כבוי." : "Quiet mode off.";
  }
  const cur = await db.getSetting("quiet");
  const on = cur === "1";
  return heb
    ? `מצב שקט: ${on ? "פעיל" : "כבוי"}. שימוש: /quiet on | off`
    : `Quiet: ${on ? "on" : "off"}. Usage: /quiet on | off`;
}

async function cmdUndo(heb: boolean): Promise<string> {
  const item = await db.undoLastItem();
  if (!item) return heb ? "אין מה לבטל." : "Nothing to undo.";
  const name = heb
    ? item.item?.canonical_he ?? item.raw_text
    : item.item?.canonical_en ?? item.raw_text;
  return heb ? `בוטל: ${name}` : `Undone: ${name}`;
}

async function cmdClear(heb: boolean): Promise<string> {
  const n = await db.clearActiveList();
  return heb
    ? `הרשימה נוקתה (${n} פריטים, ללא ארכוב).`
    : `List cleared (${n} items, not archived).`;
}

async function cmdCategory(args: string, heb: boolean): Promise<string> {
  const parts = args.split(/\s+/);
  const cat = (parts.shift() ?? "").toLowerCase();
  const item = parts.join(" ").trim();
  if (!cat || !item) {
    return heb
      ? `שימוש: /category <קטגוריה> <פריט>\nקטגוריות: ${CATEGORIES.join(", ")}`
      : `Usage: /category <cat> <item>\nCategories: ${CATEGORIES.join(", ")}`;
  }
  if (!(CATEGORIES as readonly string[]).includes(cat)) {
    return heb
      ? `קטגוריה לא חוקית. אפשרויות: ${CATEGORIES.join(", ")}`
      : `Invalid category. Options: ${CATEGORIES.join(", ")}`;
  }
  const updated = await db.setItemCategory(item, cat as Category);
  if (!updated) return heb ? `לא נמצא: ${item}` : `Not found: ${item}`;
  const name = heb
    ? updated.canonical_he
    : updated.canonical_en ?? updated.canonical_he;
  return heb ? `${name} → ${cat}` : `${name} → ${cat}`;
}

async function cmdRename(args: string, heb: boolean): Promise<string> {
  const parts = args.split("|").map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return heb
      ? "שימוש: /rename <שם ישן> | <שם חדש>"
      : "Usage: /rename <old> | <new>";
  }
  const updated = await db.renameItem(parts[0], parts[1]);
  if (!updated) return heb ? `לא נמצא: ${parts[0]}` : `Not found: ${parts[0]}`;
  return heb
    ? `שונה: ${updated.canonical_he}`
    : `Renamed: ${updated.canonical_en ?? updated.canonical_he}`;
}

async function cmdLang(arg: string): Promise<string> {
  const a = arg.trim().toLowerCase();
  if (!["he", "en", "auto"].includes(a)) {
    return "Usage: /lang he | en | auto";
  }
  if (a === "auto") await db.deleteSetting("lang");
  else await db.setSetting("lang", a);
  return a === "he"
    ? "השפה נקבעה לעברית."
    : a === "en"
      ? "Language set to English."
      : "Language: auto-detect.";
}

async function cmdWho(args: string, heb: boolean): Promise<string> {
  if (!args) return heb ? "שימוש: /who <פריט>" : "Usage: /who <item>";
  const li = await db.getWhoAdded(args);
  if (!li) return heb ? `לא נמצא: ${args}` : `Not found: ${args}`;
  const name = heb
    ? li.item?.canonical_he ?? li.raw_text
    : li.item?.canonical_en ?? li.raw_text;
  const by = li.added_by ?? "?";
  return heb ? `${name} — נוסף ע"י ${by}` : `${name} — added by ${by}`;
}

async function cmdFreq(args: string, heb: boolean): Promise<string> {
  if (!args) return heb ? "שימוש: /freq <פריט>" : "Usage: /freq <item>";
  const r = await db.getItemFreq(args);
  if (!r) return heb ? `לא נמצא: ${args}` : `Not found: ${args}`;
  const name = heb
    ? r.item.canonical_he
    : r.item.canonical_en ?? r.item.canonical_he;
  if (r.total === 0) {
    return heb
      ? `${name}: אין היסטוריה ב-8 שבועות אחרונים`
      : `${name}: no history in the last 8 weeks`;
  }
  const pct = Math.round((r.lists / r.total) * 100);
  return heb
    ? `${name}: נקנה ב-${r.lists}/${r.total} מהרשימות האחרונות (${pct}%)`
    : `${name}: bought in ${r.lists}/${r.total} recent lists (${pct}%)`;
}

async function cmdSnooze(args: string, heb: boolean): Promise<string> {
  if (!args)
    return heb
      ? "שימוש: /snooze <פריט> [שבועות]"
      : "Usage: /snooze <item> [weeks]";
  const tokens = args.split(/\s+/);
  let weeks = 4;
  let needle = args;
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && /^\d+$/.test(last)) {
    weeks = parseInt(last, 10);
    needle = tokens.slice(0, -1).join(" ").trim();
  }
  if (!needle)
    return heb
      ? "שימוש: /snooze <פריט> [שבועות]"
      : "Usage: /snooze <item> [weeks]";
  if (weeks < 1 || weeks > 52) {
    return heb ? "שבועות חייב להיות 1–52." : "weeks must be 1–52.";
  }
  const item = await db.snoozeItem(needle, weeks);
  if (!item) return heb ? `לא נמצא: ${needle}` : `Not found: ${needle}`;
  const name = heb
    ? item.canonical_he
    : item.canonical_en ?? item.canonical_he;
  return heb
    ? `${name} מושתק ל-${weeks} שבועות.`
    : `${name} snoozed for ${weeks} weeks.`;
}

async function addItems(
  text: string,
  fromPhone: string,
  heb: boolean,
): Promise<string | null> {
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
    const byRaw = new Map(parsed.map((p) => [p.raw.trim(), p]));
    for (const raw of unknown) {
      const r = byRaw.get(raw.trim());
      if (r) {
        const item = await db.upsertItem(
          {
            canonical_he: r.canonical_he,
            canonical_en: r.canonical_en,
            category: r.category,
          },
          r.raw,
        );
        known.set(raw, item);
      } else {
        // Claude dropped this input. Don't lose it: fall back to the raw
        // text as canonical_he/en in the "other" category. The user can
        // /category and /rename it later.
        console.warn(`[ai] Claude omitted input, fallback: ${JSON.stringify(raw)}`);
        const item = await db.upsertItem(
          { canonical_he: raw, canonical_en: raw, category: "other" },
          raw,
        );
        known.set(raw, item);
      }
    }
  }

  const list = await db.getOrCreateActiveList();
  for (const [raw, item] of known) {
    await db.addToList(list.id, item.id, raw, fromPhone);
  }

  const quiet = (await db.getSetting("quiet")) === "1";
  if (quiet) return null;

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
  if (items.length === 0) return heb ? "הרשימה ריקה." : "List is empty.";

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
    (it) =>
      `- ${heb ? it.canonical_he : it.canonical_en ?? it.canonical_he}`,
  );
  return (
    (heb ? "הצעות (לפי הרגלים):\n" : "Suggestions (based on your habits):\n") +
    lines.join("\n")
  );
}
