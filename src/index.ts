import "dotenv/config";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import qrcode from "qrcode-terminal";
import { handleMessage } from "./handlers.js";

const ALLOWED_JIDS = (process.env.WHATSAPP_ALLOWED_JIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Allow matching by the user-portion of a JID too, so messages arriving with
// a different suffix (e.g. @lid instead of @s.whatsapp.net) still match if
// the phone-number prefix is the same.
const ALLOWED_USERS = new Set(
  ALLOWED_JIDS.map((j) => j.split("@")[0]).filter(Boolean),
);
const AUTH_DIR = process.env.AUTH_DIR ?? "./auth";

if (ALLOWED_JIDS.length === 0) {
  console.error(
    "WHATSAPP_ALLOWED_JIDS is required (comma-separated JIDs).",
  );
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is required.");
  process.exit(1);
}

async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA Web v${version.join(".")} (latest=${isLatest})`);
  const sock: WASocket = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    logger: P({ level: "warn" }) as never,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 10_000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(
        "Scan this QR with WhatsApp (Settings > Linked Devices > Link a Device):",
      );
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("Connected. Allowed:", ALLOWED_JIDS.join(", "));
    } else if (connection === "close") {
      const code = (lastDisconnect?.error as Boom | undefined)?.output
        ?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(
        `Connection closed (code ${code}). ${
          loggedOut
            ? "Logged out — delete the auth dir and restart to relink."
            : "Reconnecting..."
        }`,
      );
      if (!loggedOut) {
        setTimeout(() => {
          start().catch((e) => console.error("Restart failed:", e));
        }, 2000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[upsert] type=${type} count=${messages.length}`);
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const fromMe = msg.key.fromMe;
      const hasContent = !!msg.message;
      const fromUser = from?.split("@")[0] ?? "";
      const allowed =
        !!from &&
        (ALLOWED_JIDS.includes(from) || ALLOWED_USERS.has(fromUser));

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        msg.message?.imageMessage?.caption ??
        "";

      console.log(
        `[msg] from=${from} fromMe=${fromMe} hasContent=${hasContent} allowed=${allowed} text=${JSON.stringify(text)}`,
      );

      if (fromMe) continue;
      if (!msg.message) continue;
      if (!from || !allowed) continue;
      if (!text.trim()) {
        console.log(`[msg] no text payload, skipping`);
        continue;
      }

      try {
        const reply = await handleMessage(text, from);
        await sock.sendMessage(from, { text: reply });
        console.log(`[msg] reply sent`);
      } catch (e) {
        console.error("Handler error:", e);
        try {
          await sock.sendMessage(from, {
            text: "Error processing your message. / שגיאה בעיבוד הבקשה.",
          });
        } catch {}
      }
    }
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
