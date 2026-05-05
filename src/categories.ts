export const CATEGORIES = [
  "produce",
  "dairy",
  "bakery",
  "meat_fish",
  "frozen",
  "pantry",
  "beverages",
  "snacks",
  "household",
  "personal",
  "baby",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL_HE: Record<Category, string> = {
  produce: "ירקות ופירות",
  dairy: "מוצרי חלב",
  bakery: "מאפיה",
  meat_fish: "בשר ודגים",
  frozen: "קפואים",
  pantry: "מזווה",
  beverages: "משקאות",
  snacks: "חטיפים",
  household: "בית וניקיון",
  personal: "טיפוח אישי",
  baby: "תינוקות",
  other: "אחר",
};

export const CATEGORY_LABEL_EN: Record<Category, string> = {
  produce: "Produce",
  dairy: "Dairy",
  bakery: "Bakery",
  meat_fish: "Meat & Fish",
  frozen: "Frozen",
  pantry: "Pantry",
  beverages: "Beverages",
  snacks: "Snacks",
  household: "Household",
  personal: "Personal Care",
  baby: "Baby",
  other: "Other",
};

export const CATEGORY_ORDER: Category[] = [
  "produce",
  "bakery",
  "dairy",
  "meat_fish",
  "frozen",
  "pantry",
  "beverages",
  "snacks",
  "household",
  "personal",
  "baby",
  "other",
];
