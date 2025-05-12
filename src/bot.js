import dotenv from "dotenv";
dotenv.config();

import { Telegraf, Markup } from "telegraf";
import { BOT_TOKEN } from "./config/env.js";
import { connectToDB } from "./services/db.js";
import { User } from "./models/User.js";
import { Appointment } from "./models/Appointment.js";
import { coffeeHandler } from "./handlers/coffeeHandler.js";
import { notifyAdmin } from "./services/notifyAdmin.js";

// 🔐 Перевірка токена
if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN не знайдено в .env файлі");
}

const bot = new Telegraf(BOT_TOKEN);

// 🧠 Підключення до БД з перевіркою
try {
  await connectToDB();
  console.log("✅ Підключено до бази даних");
} catch (error) {
  console.error("❌ Помилка підключення до бази:", error);
  process.exit(1);
}

const userStates = new Map();
const coffeeTempState = new Map();

// 🕒 Варіанти доступного часу
const availableTimes = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];

// 🧾 Кнопкова клавіатура
const mainKeyboard = Markup.keyboard([
  ["☕ Замовити каву", "📝 Записатись на процедуру"],
  ["📅 Мої записи", "📞 Викликати адміністратора"],
  ["💬 Задати питання адміну"],
]).resize();

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const existingUser = await User.findOne({ telegramId });

  if (existingUser) {
    ctx.reply("Привіт ще раз! Оберіть дію:", mainKeyboard);
  } else {
    ctx.reply(
      "Поділіться, будь ласка, своїм номером телефону:",
      Markup.keyboard([[Markup.button.contactRequest("📱 Поділитись номером")]])
        .resize()
        .oneTime()
    );
  }
});

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;

  const newUser = new User({
    telegramId: contact.user_id,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
    phoneNumber: contact.phone_number,
    floor: null,
  });

  await newUser.save();

  ctx.reply("Дякую! Ви авторизовані ✅ Оберіть дію:", mainKeyboard);
});

bot.hears("📞 Викликати адміністратора", async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });

  if (user) {
    notifyAdmin(
      `📞 ${user.firstName} (${user.phoneNumber}) викликав адміністратора`
    );
  }

  ctx.reply("✅ Адміністратор уже йде до вас");
});

bot.hears("💬 Задати питання адміну", async (ctx) => {
  userStates.set(ctx.from.id, "waiting_for_question");
  ctx.reply("📝 Напишіть своє питання, і я передам його адміністратору.");
});

bot.hears("📝 Записатись на процедуру", async (ctx) => {
  userStates.set(ctx.from.id, "awaiting_procedure_selection");
  return ctx.reply(
    "🧾 Оберіть процедуру:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Масаж", "procedure_massage")],
      [Markup.button.callback("Чистка", "procedure_cleaning")],
      [Markup.button.callback("БТЛ", "procedure_btl")],
      [Markup.button.callback("Ендосфера", "procedure_endosphere")],
    ])
  );
});

bot.hears("📅 Мої записи", async (ctx) => {
  const telegramId = ctx.from.id;
  const appointments = await Appointment.find({ telegramId });

  if (appointments.length === 0) {
    return ctx.reply("📭 У вас немає записів.");
  }

  let response = "📋 Ваші записи:\n\n";
  appointments.forEach((a, i) => {
    response += `${i + 1}. ${a.procedure} — ${a.time}\n`;
  });

  ctx.reply(response);
});

// ✅ Обробка вибору процедури
bot.action(/procedure_(.+)/, async (ctx) => {
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
  ctx.reply("🕒 Оберіть бажаний час:", Markup.inlineKeyboard(timeButtons));
});

// ✅ Обробка вибору часу
bot.action(/time_(\d{2})(\d{2})/, async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegramId });
  const coffeeData = coffeeTempState.get(telegramId);

  if (!coffeeData || !coffeeData.procedure) {
    return ctx.reply("😕 Щось пішло не так. Почніть знову.");
  }

  const timeStr = `${ctx.match[1]}:${ctx.match[2]}`;

  const existing = await Appointment.findOne({
    procedure: coffeeData.procedure,
    time: timeStr,
  });

  await ctx.answerCbQuery();

  if (existing) {
    return ctx.reply("❌ Цей час уже зайнятий. Оберіть інший.");
  }

  const newAppointment = new Appointment({
    telegramId,
    procedure: coffeeData.procedure,
    time: timeStr,
  });

  await newAppointment.save();
  coffeeTempState.delete(telegramId);
  userStates.delete(telegramId);

  ctx.editMessageText(
    `✅ Ви записались на ${coffeeData.procedure} о ${timeStr}`
  );
  if (user) {
    notifyAdmin(
      `🧾 ${user.firstName} (${user.phoneNumber}) записався на ${coffeeData.procedure} о ${timeStr}`
    );
  }
});

// Кава хендлер
coffeeHandler(bot, userStates);

// Обробка питання адміну
bot.on("text", async (ctx) => {
  const telegramId = ctx.from.id;
  const state = userStates.get(telegramId);

  if (state === "waiting_for_question") {
    const user = await User.findOne({ telegramId });
    const question = ctx.message.text;

    if (user) {
      await notifyAdmin(
        `❓ ${user.firstName} (${user.phoneNumber}) задав(ла) питання:\n"${question}"`
      );
    }

    userStates.delete(telegramId);
    return ctx.reply("✅ Ваше повідомлення надіслано адміністратору.");
  }
});

bot.launch();
console.log("🚀 Bot is running");
