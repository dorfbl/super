import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES } from "./categories.js";

const client = new Anthropic();

const ParsedItem = z.object({
  raw: z.string(),
  canonical_he: z.string(),
  canonical_en: z.string(),
  category: z.enum(CATEGORIES),
  note: z.string().nullable(),
});

const ParseResult = z.object({
  items: z.array(ParsedItem),
});

export type ParsedItemT = z.infer<typeof ParsedItem>;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string" },
          canonical_he: { type: "string" },
          canonical_en: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          note: { type: ["string", "null"] },
        },
        required: ["raw", "canonical_he", "canonical_en", "category", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM = `You categorize shopping list items for a Hebrew/English grocery bot.

For each input string (Hebrew, English, or transliterated, possibly with typos), return:
- raw: the exact original input string, unchanged
- canonical_he: a clean canonical Hebrew name (e.g. "חלב 3%", "לחם פרוס")
- canonical_en: a clean canonical English name (e.g. "Milk 3%", "Sliced bread")
- category: one of: ${CATEGORIES.join(", ")}
- note: optional extra detail (brand, quantity), or null

Categories:
- produce: fresh fruits, vegetables, herbs
- dairy: milk, cheese, yogurt, butter, eggs
- bakery: bread, rolls, pastries, pita, challah
- meat_fish: fresh/raw meat, poultry, fish
- frozen: anything frozen
- pantry: rice, pasta, oil, sugar, flour, cereal, canned goods, spices, sauces, condiments
- beverages: water, juice, soda, coffee, tea, beer, wine
- snacks: chips, candy, cookies, chocolate, ice cream
- household: cleaning supplies, paper goods, detergent, garbage bags
- personal: shampoo, soap, toothpaste, makeup, deodorant
- baby: diapers, formula, baby food, wipes
- other: anything that doesn't fit

Rules:
- Fix obvious typos ("mild" -> milk, "תפוחי אדמא" -> "תפוחי אדמה").
- Preserve meaningful specifics in the canonical name (fat %, organic, sliced).
- Put brand/quantity in note, not in the canonical name.
- If a single input string contains multiple distinct items run together (rare), split them.
- Always return the same number of items as inputs (one per input), unless splitting.`;

export async function categorizeItems(rawTexts: string[]): Promise<ParsedItemT[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Items to categorize:\n${rawTexts
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in Claude response");
  }
  const json = JSON.parse(textBlock.text);
  return ParseResult.parse(json).items;
}
