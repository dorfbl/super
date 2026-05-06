# בוט רשימת קניות בוואטסאפ

> WhatsApp shopping-list bot for two users with Hebrew + English support, automatic categorization via Claude, and habit-based suggestions. Documentation in Hebrew.

בוט וואטסאפ פרטי לזוג, שמנהל את רשימת הקניות השבועית, מסווג פריטים אוטומטית למחלקות (חלב, ירקות, מזווה וכו'), ולומד עם הזמן מה אתם נוטים לקנות כדי להציע לכם פריטים שאולי שכחתם.

## תכונות

- שליחת פריטים בעברית, אנגלית או ערבוב — זיהוי שגיאות כתיב והשלמות
- סיווג אוטומטי למחלקות באמצעות Claude
- רשימה משותפת אחת לזוג, פעילה + ארכיון
- "סיימתי" / 🚩 / 🔴 — סוגר את הרשימה ומוסיף לארכיון
- הצעות אוטומטיות על בסיס היסטוריית קניות (8 שבועות)
- פקודות `/` להגדרות מתקדמות (מצב שקט, ביטול, החלפת קטגוריה וכו')
- עובד דרך קבוצת וואטסאפ — שניכם בקבוצה, שניכם יכולים להוסיף

## ארכיטקטורה

| שכבה | טכנולוגיה |
|---|---|
| ריצה | Node.js + TypeScript |
| WhatsApp | Baileys (חיבור כמכשיר מקושר ל-WhatsApp Web) |
| מסד נתונים | Supabase (Postgres) |
| בינה מלאכותית | Claude Haiku 4.5 (סיווג + תיקון כתיב) |
| אחסון | Fly.io (מכונה תמידית עם נפח מתמיד) |

עלות שוטפת: 0$. רק ה-Claude API נצרך, וברמת שימוש של זוג זה כמה סנטים בחודש.

## התקנה

### 1. יצירת פרויקט Supabase

1. הירשמו ב-[supabase.com](https://supabase.com), צרו פרויקט חדש (חינמי).
2. SQL Editor → הדביקו את התוכן של `schema.sql` → Run.
3. Project Settings → API → העתיקו את `URL` ואת מפתח ה-`service_role` (לא ה-`anon`).

### 2. מפתח Claude

[console.anthropic.com](https://console.anthropic.com) → API Keys → צרו מפתח חדש. מומלץ לטעון $5 ב-Plans & Billing — מספיק לשנים רבות בקצב שימוש של זוג.

### 3. הכנת קובץ `.env`

צרו קובץ בשם `.env` בתיקייה הראשית (אל תשתפו אותו, יש בו סודות):

```
WHATSAPP_GROUP_JIDS=
WHATSAPP_ALLOWED_JIDS=
AUTH_DIR=./auth
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-...
```

`WHATSAPP_GROUP_JIDS` נשאיר ריק לעת עתה — נמלא אחרי שלב הזיווג.

### 4. ריצה ראשונה וזיווג WhatsApp

```bash
npm install
npm run dev
```

בהפעלה הראשונה הבוט יציג קוד QR בטרמינל. ב-WhatsApp בטלפון: הגדרות → מכשירים מקושרים → קישור מכשיר → סרקו את הקוד.

> **חשוב:** המספר שתסרקו איתו הופך ל"חשבון של הבוט". כל פעולה תיעשה דרכו. אפשר לקשר למספר האישי שלכם — או, מומלץ יותר, למספר ייעודי (סים נוסף, WhatsApp Business כאפליקציה שנייה).

### 5. הגדרת קבוצת הבוט

1. בוואטסאפ צרו קבוצה חדשה ("רשימת קניות") עם החשבון שמקושר לבוט והוסיפו אליה את כל מי שצריך לכתוב לרשימה.
2. בטרמינל, מיד אחרי `Connected.`, יודפסו כל הקבוצות שהחשבון חבר בהן:
   ```
   Groups visible to this account (3):
     120363041234567890@g.us  משפחה
     120363129876543210@g.us  עבודה
     120363421594092447@g.us  רשימת קניות   ← זאת
   ```
3. העתיקו את ה-JID של קבוצת הקניות לשורה `WHATSAPP_GROUP_JIDS=` בקובץ `.env`.
4. הפעילו מחדש (Ctrl-C ואז `npm run dev`).

### 6. בדיקה

מישהו בקבוצה שולח `עזרה` — הבוט עונה עם רשימת הפקודות. שליחת `חלב, לחם, ביצים` מוסיפה אותם לרשימה ומציגה סיכום. שליחת `רשימה` מציגה את הרשימה הנוכחית, מסודרת לפי מחלקות.

## דיפלוי ל-Fly.io

```bash
brew install flyctl                    # או: curl -L https://fly.io/install.sh | sh
fly auth signup
fly launch --no-deploy                 # אשרו את fly.toml הקיים, בחרו אזור (fra/cdg)
fly volumes create auth_data --size 1 --region fra
fly secrets set \
  WHATSAPP_GROUP_JIDS="..." \
  SUPABASE_URL="..." \
  SUPABASE_SERVICE_KEY="..." \
  ANTHROPIC_API_KEY="..."
fly deploy
fly logs                               # סרקו את ה-QR פעם אחת, וזהו
```

נפח אימות (`auth_data`) שומר את הזיווג בין דיפלויים. סריקת QR צריך לעשות פעם אחת בלבד.

## פקודות

### טקסט חופשי

| שלח/י | תוצאה |
|---|---|
| פריטים מופרדים בפסיק או בשורות | הוספה לרשימה |
| `רשימה` / `list` | הצגת הרשימה לפי מחלקות |
| `סיימתי` / `🚩` / `🔴` / `done` | ארכוב הרשימה |
| `קניתי X` / `bought X` | סימון פריט כנקנה |
| `מחק X` / `remove X` | הסרה מהרשימה |
| `הצעות` / `suggest` | פריטים שאולי שכחת מההרגלים שלך |
| `עזרה` / `help` | הצגת כל הפקודות |

### פקודות `/` מתקדמות

| פקודה | תיאור |
|---|---|
| `/btw <טקסט>` | שיחה רגילה בקבוצה — הבוט מתעלם |
| `/quiet on\|off` | מצב שקט: לא מציג "נוספו N פריטים" אחרי הוספה |
| `/undo` | מבטל את הפריט האחרון שנוסף |
| `/clear` | מנקה את הרשימה ללא ארכוב (לא נספר בהיסטוריה) |
| `/category <קטגוריה> <פריט>` | משייך פריט מחדש (אם Claude טעה) |
| `/rename <ישן> \| <חדש>` | שינוי השם הקנוני של הפריט |
| `/lang he\|en\|auto` | קביעת שפת תגובות (ברירת מחדל: זיהוי אוטומטי) |
| `/who <פריט>` | מי הוסיף את הפריט |
| `/freq <פריט>` | באיזו תדירות נקנה ב-8 השבועות האחרונים |
| `/snooze <פריט> [שבועות]` | מסתיר מההצעות לזמן מוגבל (ברירת מחדל: 4 שבועות) |

קטגוריות זמינות עבור `/category`:
`produce, dairy, bakery, meat_fish, frozen, pantry, beverages, snacks, household, personal, baby, other`.

## מבנה הקוד

```
src/
├── index.ts        חיבור Baileys + ניתוב הודעות
├── handlers.ts     פירוק פקודות (חופשי + /), נתיב לוגיקה
├── ai.ts           אינטגרציית Claude (סיווג + JSON Schema)
├── db.ts           שאילתות Supabase + לוגיקת הצעות
└── categories.ts   רשימת מחלקות + תוויות בעברית/אנגלית
schema.sql          מיגרציות הטבלאות (ריצה חוזרת בטוחה)
Dockerfile, fly.toml, .env.example, .dockerignore
```

## פתרון בעיות

**`Connection closed (code 405)`**
גרסת פרוטוקול ה-WhatsApp Web המובנית של Baileys מיושנת. הקוד כבר מושך גרסה חיה ב-`fetchLatestBaileysVersion`. אם זה עדיין קורה: עדכנו את `@whiskeysockets/baileys` ל-`latest`.

**`Bad MAC` / `No matching sessions found` בלולאה**
שגיאות פיענוח של Signal עבור צ'אטים אחרים שמסונכרנים דרך המכשיר המקושר. לא משפיע על הבוט. הוסתר ברירת מחדל באמצעות `logger: P({ level: "silent" })`. אם רוצים לראות שוב — שנו ל-`"warn"`.

**`Invalid PreKey ID`**
ה-session של Signal הסתאב במהלך הזיווג. תיקון: עצרו את הבוט, מחקו את התיקייה `auth/`, הפעילו שוב, סרקו QR חדש.

**`401 invalid x-api-key`**
מפתח Claude שגוי או הוחלף. ודאו שב-`.env` יש את המפתח הנוכחי מ-console.anthropic.com.

**`Your credit balance is too low`**
טענו קרדיט בחשבון Anthropic ב-Plans & Billing.

**`new row violates row-level security policy`**
המפתח של Supabase ב-`.env` הוא `anon` ולא `service_role`. החליפו ל-`service_role` (Settings → API → Reveal).

**הודעה לא מתקבלת בקבוצה**
- ודאו ש-`WHATSAPP_GROUP_JIDS` מכיל בדיוק את ה-JID של הקבוצה (`120363...@g.us`).
- אם המסמך מציג רק `[cmd]` עם קבוצה אחרת או בלי בכלל — בדקו שהקבוצה שלכם ברשימת הקבוצות שמודפסת בעת ההפעלה.

## אבטחה

- אין לשתף את `.env`. הוא מוגדר ב-`.gitignore` ולא נשלח ל-git.
- מפתח `service_role` של Supabase = שליטה מלאה במסד. אם דלף — ב-Supabase: Settings → API → Reset.
- מפתח Claude = חיוב לחשבון. אם דלף — ב-console.anthropic.com מחקו וצרו חדש.
- רשימת JID-ים מאפשרת רק לקבוצה הספציפית לפנות לבוט; שאר ההודעות נדחות אוטומטית.

## רישוי

קוד פרטי, לשימוש אישי בלבד.
