import dotenv from "dotenv";
dotenv.config();

import { Telegraf, Markup } from "telegraf";
import { BOT_TOKEN } from "./config/env.js";
import { connectToDB } from "./services/db.js";
import { User } from "./models/User.js";
import { Appointment } from "./models/Appointment.js";
import { coffeeHandler } from "./handlers/coffeeHandler.js";
import { notifyAdmin } from "./services/notifyAdmin.js";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN не знайдено в .env файлі");

const bot = new Telegraf(BOT_TOKEN);

try {
  await connectToDB();
  console.log("✅ Підключено до бази даних");
} catch (error) {
  console.error("❌ Помилка підключення до бази:", error);
  process.exit(1);
}

const userStates = new Map();

const mainKeyboard = Markup.keyboard([
  ["☕ Замовити каву", "📝 Записатись на процедуру"],
  ["📅 Мої записи", "📞 Викликати адміністратора"],
  ["💬 Задати питання адміну"],
]).resize();

coffeeHandler(bot, userStates, notifyAdmin);

bot.start(async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const existingUser = await User.findOne({ telegramId });

    if (existingUser) {
      await ctx.reply("Привіт ще раз! Оберіть дію:", mainKeyboard);
    } else {
      await ctx.reply(
        "Поділіться, будь ласка, своїм номером телефону:",
        Markup.keyboard([
          [Markup.button.contactRequest("📱 Поділитись номером")],
        ])
          .resize()
          .oneTime()
      );
    }
  } catch (err) {
    console.error("❌ start error:", err.description || err);
  }
});

bot.on("contact", async (ctx) => {
  try {
    const contact = ctx.message.contact;

    const newUser = new User({
      telegramId: contact.user_id,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      phoneNumber: contact.phone_number,
      floor: null,
    });

    await newUser.save();
    await ctx.reply("Дякую! Ви авторизовані ✅ Оберіть дію:", mainKeyboard);
  } catch (err) {
    console.error("❌ contact error:", err.description || err);
  }
});

bot.hears("📞 Викликати адміністратора", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });

    if (user) {
      await notifyAdmin(
        bot,
        `📞 ${user.firstName} (${user.phoneNumber}) викликав адміністратора`
      );
    }

    await ctx.reply("✅ Адміністратор уже йде до вас");
  } catch (err) {
    console.error("❌ admin call error:", err.description || err);
  }
});

bot.hears("💬 Задати питання адміну", async (ctx) => {
  try {
    userStates.set(ctx.from.id, "waiting_for_question");
    await ctx.reply(
      "📝 Напишіть своє питання, і я передам його адміністратору."
    );
  } catch (err) {
    console.error("❌ admin question error:", err.description || err);
  }
});

// Додано обробку текстової кнопки "Записатись на процедуру"
bot.hears("📝 Записатись на процедуру", async (ctx) => {
  try {
    await ctx.reply(
      "🧾 Оберіть процедуру:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Масаж", "procedure_massage")],
        [Markup.button.callback("Чистка", "procedure_cleaning")],
        [Markup.button.callback("БТЛ", "procedure_btl")],
        [Markup.button.callback("Ендосфера", "procedure_endosphere")],
      ])
    );
  } catch (err) {
    console.error("❌ procedure selection error:", err.description || err);
  }
});

bot.action(/cancel_(.+)/, async (ctx) => {
  try {
    const id = ctx.match[1];
    const telegramId = ctx.from.id;
    const appointment = await Appointment.findById(id);
    const user = await User.findOne({ telegramId });

    if (!appointment) {
      await ctx.answerCbQuery();
      return ctx.editMessageText("⚠️ Запис не знайдено або вже скасовано.");
    }

    await Appointment.findByIdAndDelete(id);
    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Запис скасовано.");

    const message = `🚫 ${
      user ? `${user.firstName} (${user.phoneNumber})` : ctx.from.first_name
    } скасував(ла) запис на ${appointment.procedure} — ${appointment.date} о ${
      appointment.time
    }`;

    try {
      await notifyAdmin(bot, message);
    } catch (adminError) {
      console.error("❌ notifyAdmin error:", adminError);
    }
  } catch (err) {
    console.error("❌ cancel single error:", err.description || err);
  }
});

bot.on("text", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const state = userStates.get(telegramId);

    if (state === "waiting_for_question") {
      const user = await User.findOne({ telegramId });
      const question = ctx.message.text;

      if (user) {
        await notifyAdmin(
          bot,
          `❓ ${user.firstName} (${user.phoneNumber}) задав(ла) питання:\n"${question}"`
        );
      }

      userStates.delete(telegramId);
      await ctx.reply("✅ Ваше повідомлення надіслано адміністратору.");
    }
  } catch (err) {
    console.error("❌ text handler error:", err.description || err);
  }
});

bot.launch();
console.log("🚀 Bot is running");
