import { createClient } from "@supabase/supabase-js";
import type { Category } from "./categories.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

export interface Item {
  id: number;
  canonical_he: string;
  canonical_en: string | null;
  category: Category;
  aliases: string[];
}

export interface ListItem {
  id: number;
  list_id: number;
  item_id: number;
  raw_text: string;
  note: string | null;
  added_by: string | null;
  bought: boolean;
  added_at: string;
  bought_at: string | null;
  item?: Item;
}

export async function ensureUser(phone: string): Promise<void> {
  await supabase.from("users").upsert({ phone }, { onConflict: "phone" });
}

export async function findItemByText(text: string): Promise<Item | null> {
  const t = text.trim();
  const lower = t.toLowerCase();

  const c1 = await supabase.from("items").select("*").eq("canonical_he", t).limit(1);
  if (c1.data?.[0]) return c1.data[0];

  const c2 = await supabase.from("items").select("*").ilike("canonical_en", t).limit(1);
  if (c2.data?.[0]) return c2.data[0];

  const c3 = await supabase.from("items").select("*").contains("aliases", [lower]).limit(1);
  return c3.data?.[0] ?? null;
}

export async function upsertItem(
  p: { canonical_he: string; canonical_en: string; category: Category },
  raw: string,
): Promise<Item> {
  const aliasLower = raw.trim().toLowerCase();

  const existing = await supabase
    .from("items")
    .select("*")
    .eq("canonical_he", p.canonical_he)
    .limit(1);

  if (existing.data?.[0]) {
    const item = existing.data[0] as Item;
    if (!item.aliases.includes(aliasLower)) {
      const newAliases = [...item.aliases, aliasLower];
      await supabase.from("items").update({ aliases: newAliases }).eq("id", item.id);
      item.aliases = newAliases;
    }
    return item;
  }

  const inserted = await supabase
    .from("items")
    .insert({
      canonical_he: p.canonical_he,
      canonical_en: p.canonical_en,
      category: p.category,
      aliases: [aliasLower],
    })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data as Item;
}

export async function getOrCreateActiveList(): Promise<{ id: number }> {
  const existing = await supabase
    .from("lists")
    .select("id")
    .eq("status", "active")
    .limit(1);
  if (existing.data?.[0]) return existing.data[0];
  const created = await supabase
    .from("lists")
    .insert({ status: "active" })
    .select()
    .single();
  if (created.error) throw created.error;
  return created.data;
}

export async function addToList(
  listId: number,
  itemId: number,
  rawText: string,
  addedBy: string,
): Promise<void> {
  const existing = await supabase
    .from("list_items")
    .select("id")
    .eq("list_id", listId)
    .eq("item_id", itemId)
    .eq("bought", false)
    .limit(1);
  if (existing.data?.[0]) return;
  await supabase.from("list_items").insert({
    list_id: listId,
    item_id: itemId,
    raw_text: rawText,
    added_by: addedBy,
  });
}

export async function getActiveListItems(): Promise<ListItem[]> {
  const list = await supabase
    .from("lists")
    .select("id")
    .eq("status", "active")
    .limit(1);
  if (!list.data?.[0]) return [];
  const items = await supabase
    .from("list_items")
    .select("*, item:items(*)")
    .eq("list_id", list.data[0].id)
    .order("added_at");
  return (items.data as ListItem[] | null) ?? [];
}

function matches(li: ListItem, lower: string): boolean {
  if (li.raw_text.toLowerCase().includes(lower)) return true;
  const item = li.item;
  if (!item) return false;
  if (item.canonical_he.toLowerCase().includes(lower)) return true;
  if (item.canonical_en?.toLowerCase().includes(lower)) return true;
  return item.aliases.some((a) => a.includes(lower));
}

export async function markBought(needle: string): Promise<ListItem | null> {
  const items = await getActiveListItems();
  const lower = needle.trim().toLowerCase();
  const found = items.find((i) => !i.bought && matches(i, lower));
  if (!found) return null;
  await supabase
    .from("list_items")
    .update({ bought: true, bought_at: new Date().toISOString() })
    .eq("id", found.id);
  return found;
}

export async function removeFromList(needle: string): Promise<ListItem | null> {
  const items = await getActiveListItems();
  const lower = needle.trim().toLowerCase();
  const found = items.find((i) => matches(i, lower));
  if (!found) return null;
  await supabase.from("list_items").delete().eq("id", found.id);
  return found;
}

export async function archiveActiveList(): Promise<{ archived: number }> {
  const list = await supabase
    .from("lists")
    .select("id")
    .eq("status", "active")
    .limit(1);
  if (!list.data?.[0]) return { archived: 0 };
  const listId = list.data[0].id as number;

  const items = await supabase
    .from("list_items")
    .select("item_id")
    .eq("list_id", listId);

  const rows = items.data ?? [];
  if (rows.length > 0) {
    await supabase.from("purchases").insert(
      rows.map((r) => ({ item_id: r.item_id, list_id: listId })),
    );
  }
  await supabase
    .from("lists")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", listId);

  return { archived: rows.length };
}

export async function getSuggestions(
  weeksBack = 8,
  threshold = 0.4,
): Promise<Item[]> {
  const since = new Date(
    Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const purchases = await supabase
    .from("purchases")
    .select("item_id, list_id")
    .gte("purchased_at", since);

  const rows = purchases.data ?? [];
  if (rows.length === 0) return [];

  const itemListSets = new Map<number, Set<number>>();
  const allLists = new Set<number>();
  for (const r of rows) {
    if (r.list_id == null) continue;
    allLists.add(r.list_id);
    let s = itemListSets.get(r.item_id);
    if (!s) {
      s = new Set();
      itemListSets.set(r.item_id, s);
    }
    s.add(r.list_id);
  }
  const totalLists = allLists.size;
  if (totalLists === 0) return [];

  const candidateIds = [...itemListSets.entries()]
    .filter(([, s]) => s.size / totalLists >= threshold)
    .map(([id]) => id);
  if (candidateIds.length === 0) return [];

  const active = await getActiveListItems();
  const activeIds = new Set(active.map((li) => li.item_id));
  const toFetch = candidateIds.filter((id) => !activeIds.has(id));
  if (toFetch.length === 0) return [];

  const items = await supabase.from("items").select("*").in("id", toFetch);
  return (items.data as Item[] | null) ?? [];
}
