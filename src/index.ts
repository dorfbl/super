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
// Group chats where the bot accepts commands from anyone in the group,
// including the paired account itself (fromMe=true). Comma-separated JIDs
// like `120363...@g.us`.
const COMMAND_GROUPS = new Set(
  (process.env.WHATSAPP_GROUP_JIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const AUTH_DIR = process.env.AUTH_DIR ?? "./auth";

if (ALLOWED_JIDS.length === 0 && COMMAND_GROUPS.size === 0) {
  console.error(
    "Set at least one of WHATSAPP_ALLOWED_JIDS (DMs) or WHATSAPP_GROUP_JIDS (groups).",
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
      console.log(
        `Connected. DMs=[${ALLOWED_JIDS.join(", ") || "none"}] groups=[${[...COMMAND_GROUPS].join(", ") || "none"}]`,
      );
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
    // Skip the bot's own outgoing messages — they arrive here as fromMe=true
    // appends right after we send a reply, and we'd loop on ourselves.
    if (type === "append") return;

    for (const msg of messages) {
      const from = msg.key.remoteJid;
      if (!from || !msg.message) continue;

      const fromMe = msg.key.fromMe;
      const isGroup = from.endsWith("@g.us");
      const inCmdGroup = isGroup && COMMAND_GROUPS.has(from);

      // Group: accept any message in an allowlisted group, including ones
      // sent by the paired account itself.
      // DM: accept only inbound messages (fromMe=false) from allowlisted
      // contacts.
      let allowed = false;
      if (inCmdGroup) {
        allowed = true;
      } else if (!fromMe && !isGroup) {
        const fromUser = from.split("@")[0];
        allowed =
          ALLOWED_JIDS.includes(from) || ALLOWED_USERS.has(fromUser);
      }
      if (!allowed) continue;

      const text =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        "";
      if (!text.trim()) continue;

      // Attribute the command to the actual sender. In a group the sender
      // is the participant; in a DM it's the chat itself. For self-sent
      // messages in a group (fromMe=true) Baileys may omit participant —
      // fall back to a stable label.
      const sender = isGroup
        ? msg.key.participant ?? (fromMe ? "self@bot" : from)
        : from;

      console.log(`[cmd] chat=${from} sender=${sender}: ${text}`);

      try {
        const reply = await handleMessage(text, sender);
        await sock.sendMessage(from, { text: reply });
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
