import { Telegraf } from "telegraf";
import { BOT_TOKEN, ADMIN_CHAT_ID } from "../config/env.js";

const bot = new Telegraf(BOT_TOKEN);

export function notifyAdmin(message) {
  bot.telegram.sendMessage(ADMIN_CHAT_ID, `☕ ${message}`);
}
