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

## דיפלוי ל-Fly.io — שלב אחר שלב

> שני דברים שכדאי לדעת מראש:
> - תיקיית הזיווג של Baileys על Fly היא session נפרד מהמקומית. אחרי הדיפלוי תסרקו QR חדש מתוך לוגי הענן, והזיווג נשמר בנפח התמידי שיצרנו. הזיווג המקומי ימשיך לעבוד עד שתסירו אותו ידנית מתוך WhatsApp → מכשירים מקושרים.
> - כל הסודות עוברים ל-Fly באמצעות `fly secrets set` — לא דרך `.env` ולא דרך הקוד. Fly מצפין אותם ומזריק כמשתני סביבה לקונטיינר בריצה.

### 1. התקנת `flyctl` ב-Windows

ב-PowerShell:
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```
**סגרו ופתחו מחדש את PowerShell** כדי שה-`PATH` יתעדכן. בדיקה:
```powershell
fly version
```

### 2. הרשמה / התחברות

```powershell
fly auth signup        # או fly auth login למי שכבר יש חשבון
```
פותח דפדפן. ב-Fly יש שכבת free tier שמספיקה למכונת `shared-cpu-1x` תמידית אחת ונפח של 1GB — כלומר הבוט שלנו רץ ללא חיוב.

### 3. בחירת שם אפליקציה ייחודי

קובץ `fly.toml` הראשי כולל `app = "shopping-bot"` — סביר שהשם הזה כבר תפוס בעולם של Fly. ערכו את `C:\super\super\fly.toml` ושנו את השורה הראשונה לשם ייחודי, למשל:
```toml
app = "dorfbl-shopping"
```
שמרו את הקובץ.

### 4. יצירת האפליקציה

```powershell
fly apps create dorfbl-shopping       # התאימו לשם שבחרתם
```
אם השם תפוס Fly יודיע — בחרו שם אחר, עדכנו את `fly.toml` בהתאם, ונסו שוב.

### 5. יצירת נפח תמידי לזיווג

```powershell
fly volumes create auth_data --size 1 --region fra --app dorfbl-shopping
```
1GB מספיק בהרבה — תיקיית הזיווג שוקלת כמה KB. הנפח חייב להיות באותו אזור שב-`primary_region` בתוך `fly.toml`. תופיע שאלה אם להשתמש בנפח יחיד (ללא יתירות) — ענו **כן**.

### 6. הגדרת הסודות

הריצו כפקודה אחת (השתמשו ב-` בסוף שורה לפיצול שורות ב-PowerShell):
```powershell
fly secrets set `
  WHATSAPP_GROUP_JIDS="120363XXXXXXXXXXXXX@g.us" `
  SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co" `
  SUPABASE_SERVICE_KEY="<service_role key>" `
  ANTHROPIC_API_KEY="<anthropic key>" `
  --app dorfbl-shopping
```
- אין צורך ב-`AUTH_DIR` — ה-Dockerfile מקבע אותו ל-`/data/auth`.
- אין צורך ב-`WHATSAPP_ALLOWED_JIDS` במצב קבוצה.
- ב-`SUPABASE_SERVICE_KEY` שימו את מפתח ה-`service_role`, לא ה-`anon`.

### 7. דיפלוי

```powershell
fly deploy --app dorfbl-shopping
```
לוקח 2-5 דקות בפעם הראשונה (build של ה-Docker image). בסיום `fly status` אמור להראות מכונה במצב `started`.

### 8. צפייה בלוגים וסריקת QR

```powershell
fly logs --app dorfbl-shopping
```
תראו את הבוט עולה, מושך את גרסת Baileys, ואז מדפיס קוד QR ב-ASCII. ב-WhatsApp בטלפון: הגדרות → מכשירים מקושרים → קישור מכשיר → סרקו.

**הקוד תקף ~30 שניות**. אם פספסתם — לא נורא, הבוט יתחבר מחדש וידפיס חדש.

אחרי סריקה אמורה להופיע השורה:
```
Connected. DMs=[none] groups=[120363...@g.us]
```
שלחו `עזרה` בקבוצה כדי לוודא שהוא עונה. `Ctrl-C` יוצא מהזרם של הלוגים אך הבוט ממשיך לרוץ.

### 9. בדיקה וניקיון

```powershell
fly status --app dorfbl-shopping
fly ssh console --app dorfbl-shopping  # רק אם צריך לדבג בפנים הקונטיינר
```

ברגע שהבוט בענן יציב:
- עצרו את ה-`npm run dev` המקומי.
- ב-WhatsApp → מכשירים מקושרים, יופיעו שני מכשירים (המחשב המקומי + Fly). הסירו את המקומי כדי שתוסר לכם תפוצה כפולה.

### תקלות אפשריות בעת דיפלוי

| תופעה | תיקון |
|---|---|
| `fly: command not found` אחרי התקנה | סגירה ופתיחה של PowerShell. אם עדיין לא — ריסטרט ל-Windows. |
| `App name has already been taken` | שם תפוס. בחרו שם אחר, עדכנו את `fly.toml`, חזרו לצעד 4. |
| `Volume must be in same region as app` | `--region` בצעד 5 חייב להיות זהה ל-`primary_region` ב-`fly.toml`. |
| QR לא מופיע בלוגים | בדקו את `fly logs` עבור שגיאות משתני סביבה. תיקון מהיר: `fly secrets set ...` שוב, ואז `fly machine restart --app ...`. |
| QR מופיע אבל סריקה נכשלת | פג תוקף. חכו שניה — הבוט יחזור עם QR חדש. |
| הבוט נכבה ועולה בלולאה | `fly logs` יראה למה. בדרך כלל סוד פגום (401 של Anthropic, RLS של Supabase). תיקון בסוד מבצע restart אוטומטי. |

נפח אימות (`auth_data`) שומר את הזיווג בין דיפלויים. סריקת QR נדרשת רק פעם אחת.

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
