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
const coffeeTempState = new Map();
const availableTimes = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];

const mainKeyboard = Markup.keyboard([
  ["☕ Замовити каву", "📝 Записатись на процедуру"],
  ["📅 Мої записи", "📞 Викликати адміністратора"],
  ["💬 Задати питання адміну"],
]).resize();

coffeeHandler(bot, userStates);

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

bot.hears("📝 Записатись на процедуру", async (ctx) => {
  try {
    userStates.set(ctx.from.id, "awaiting_procedure_selection");
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

bot.hears("📅 Мої записи", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const appointments = await Appointment.find({ telegramId });

    if (appointments.length === 0) {
      return await ctx.reply("📭 У вас немає записів.");
    }

    let response = "📋 Ваші записи:\n\n";
    appointments.forEach((a, i) => {
      response += `${i + 1}. ${a.procedure} — ${a.time}\n`;
    });

    await ctx.reply(response);
  } catch (err) {
    console.error("❌ fetch appointments error:", err.description || err);
  }
});

bot.action(/procedure_(.+)/, async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const selectionMap = {
      massage: "Масаж",
      cleaning: "Чистка",
      btl: "БТЛ",
      endosphere: "Ендосфера",
    };

    const chosenKey = ctx.match[1];
    const procedureName = selectionMap[chosenKey] || "Процедура";

    coffeeTempState.set(telegramId, { procedure: procedureName });
    userStates.set(telegramId, "awaiting_time_selection");

    await ctx.answerCbQuery();
    await ctx.editMessageText(`✅ Ви обрали: ${procedureName}`);

    const timeButtons = availableTimes.map((t) => [
      Markup.button.callback(t, `time_${t.replace(":", "")}`),
    ]);

    await ctx.reply(
      "🕒 Оберіть бажаний час:",
      Markup.inlineKeyboard(timeButtons)
    );
  } catch (err) {
    console.error("❌ procedure action error:", err.description || err);
  }
});

bot.action(/time_(\d{2})(\d{2})/, async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    const coffeeData = coffeeTempState.get(telegramId);

    if (!coffeeData || !coffeeData.procedure) {
      return await ctx.reply("😕 Щось пішло не так. Почніть знову.");
    }

    const timeStr = `${ctx.match[1]}:${ctx.match[2]}`;
    const existing = await Appointment.findOne({
      procedure: coffeeData.procedure,
      time: timeStr,
    });

    await ctx.answerCbQuery();

    if (existing) {
      return await ctx.reply("❌ Цей час уже зайнятий. Оберіть інший.");
    }

    const newAppointment = new Appointment({
      telegramId,
      procedure: coffeeData.procedure,
      time: timeStr,
    });

    await newAppointment.save();
    coffeeTempState.delete(telegramId);
    userStates.delete(telegramId);

    await ctx.editMessageText(
      `✅ Ви записались на ${coffeeData.procedure} о ${timeStr}`
    );

    if (user) {
      await notifyAdmin(
        bot,
        `🧾 ${user.firstName} (${user.phoneNumber}) записався на ${coffeeData.procedure} о ${timeStr}`
      );
    }
  } catch (err) {
    console.error("❌ time selection error:", err.description || err);
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
