import { Markup } from "telegraf";
import { User } from "../models/User.js";
import { Appointment } from "../models/Appointment.js";

const coffeeTempState = new Map();
const procedureTempState = new Map();

function getNextThreeDates() {
  const dates = [];
  const options = { day: "numeric", month: "long" };
  const today = new Date();

  for (let i = 0; i < 3; i++) {
    const future = new Date();
    future.setDate(today.getDate() + i);
    const formatted = future.toLocaleDateString("uk-UA", options);
    const iso = future.toISOString().split("T")[0];
    dates.push({ label: formatted, value: iso });
  }
  return dates;
}

export function coffeeHandler(bot, userStates, notifyAdmin) {
  bot.hears(/замовити\s*каву/i, async (ctx) => {
    console.log("🔥 Кнопка кави натиснута:", ctx.message.text);
    userStates.delete(ctx.from.id);
    coffeeTempState.delete(ctx.from.id);

    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });

    if (!user) {
      return ctx.reply("Будь ласка, авторизуйтесь.");
    }

    return showCoffeeOptions(ctx);
  });

  // Крок 1: Вибір типу
  bot.action(/coffee_(.+)/, async (ctx) => {
    const choice = ctx.match[1];
    const coffeeName =
      {
        espresso: "Еспресо",
        americano: "Американо",
        latte: "Лате",
        lungo: "Лунго",
      }[choice] || "Кава";

    const telegramId = ctx.from.id;
    coffeeTempState.set(telegramId, { type: coffeeName });

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `☕ Ви обрали ${coffeeName}. Тепер оберіть розмір:`
    );

    return ctx.telegram.sendMessage(
      ctx.chat.id,
      "📏 Оберіть розмір:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Маленька", "size_small")],
        [Markup.button.callback("Середня", "size_medium")],
        [Markup.button.callback("Велика", "size_large")],
      ])
    );
  });

  // Крок 2: Вибір розміру
  bot.action(/size_(.+)/, async (ctx) => {
    const sizeKey = ctx.match[1];
    const sizeName =
      {
        small: "Маленька",
        medium: "Середня",
        large: "Велика",
      }[sizeKey] || "Звичайна";

    const telegramId = ctx.from.id;
    const coffeeData = coffeeTempState.get(telegramId);

    if (!coffeeData) {
      return ctx.reply("Щось пішло не так. Спробуйте замовити ще раз.");
    }

    coffeeData.size = sizeName;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📏 Ви обрали розмір: ${sizeName}. Додати цукор?`
    );

    return ctx.telegram.sendMessage(
      ctx.chat.id,
      "🧂 Додати цукор?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Так", "sugar_yes")],
        [Markup.button.callback("Ні", "sugar_no")],
      ])
    );
  });

  // Крок 3: Вибір цукру
  bot.action(/sugar_(.+)/, async (ctx) => {
    const sugarChoice = ctx.match[1] === "yes" ? "з цукром" : "без цукру";
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    const coffeeData = coffeeTempState.get(telegramId);

    if (!coffeeData || !coffeeData.type || !coffeeData.size) {
      return ctx.reply("Дані замовлення не знайдено. Спробуйте ще раз.");
    }

    coffeeData.sugar = sugarChoice;

    await ctx.answerCbQuery();

    const finalText = `✅ Ви замовили ${coffeeData.type} (${coffeeData.size}, ${coffeeData.sugar}). Ваша кава готується!`;
    await ctx.editMessageText(finalText);

    if (user) {
      await notifyAdmin(
        bot,
        `☕ ${user.firstName} (${user.phoneNumber}) замовив(ла) ${coffeeData.type} (${coffeeData.size}, ${coffeeData.sugar})`
      );
    } else {
      await notifyAdmin(
        bot,
        `☕ ${ctx.from.first_name} замовив(ла) ${coffeeData.type} (${coffeeData.size}, ${coffeeData.sugar}) (номер невідомий)`
      );
    }

    coffeeTempState.delete(telegramId);

    setTimeout(() => {
      ctx.telegram.sendMessage(ctx.chat.id, `☕ Ваша кава вже в дорозі!`);
    }, 60 * 1000);
  });

  // Перегляд і скасування записів
  bot.hears("📅 Мої записи", async (ctx) => {
    const telegramId = ctx.from.id;
    const appointments = await Appointment.find({ telegramId });

    if (appointments.length === 0) {
      return await ctx.reply("📭 У вас немає записів.");
    }

    let response = "📋 Ваші записи:\n\n";
    appointments.forEach((a, i) => {
      response += `${i + 1}. ${a.procedure} — ${a.date} о ${a.time}\n`;
    });

    const buttons = [
      [Markup.button.callback("❌ Скасувати запис", "cancel_single")],
      [Markup.button.callback("❌ Скасувати всі записи", "cancel_all")],
    ];

    await ctx.reply(response, Markup.inlineKeyboard(buttons));
  });

  bot.action("cancel_all", async (ctx) => {
    const telegramId = ctx.from.id;
    await Appointment.deleteMany({ telegramId });
    await ctx.answerCbQuery();
    await ctx.editMessageText("🗑️ Всі записи скасовано.");
  });

  bot.action("cancel_single", async (ctx) => {
    const telegramId = ctx.from.id;
    const appointments = await Appointment.find({ telegramId });

    if (appointments.length === 0) {
      return ctx.reply("📭 У вас немає записів для скасування.");
    }

    const buttons = appointments.map((a) => [
      Markup.button.callback(
        `${a.procedure} — ${a.time}`,
        `cancel_${a._id.toString()}`
      ),
    ]);

    await ctx.answerCbQuery();
    return ctx.reply(
      "❌ Оберіть запис для скасування:",
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(/cancel_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await Appointment.findByIdAndDelete(id);
    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Запис скасовано.");
  });

  // ✅ Дата для процедури
  bot.action(/procedure_(.+)/, async (ctx) => {
    const chosenKey = ctx.match[1];
    const procedureMap = {
      massage: "Масаж",
      cleaning: "Чистка",
      btl: "БТЛ",
      endosphere: "Ендосфера",
    };
    const procedure = procedureMap[chosenKey] || "Процедура";
    const telegramId = ctx.from.id;

    procedureTempState.set(telegramId, { procedure });

    await ctx.answerCbQuery();
    await ctx.editMessageText(`✅ Ви обрали: ${procedure}`);

    const dates = getNextThreeDates();
    const buttons = dates.map((d) => [
      Markup.button.callback(d.label, `procdate_${d.value}`),
    ]);

    await ctx.telegram.sendMessage(
      ctx.chat.id,
      "📅 Оберіть дату:",
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(/procdate_(\d{4}-\d{2}-\d{2})/, async (ctx) => {
    const date = ctx.match[1];
    const telegramId = ctx.from.id;
    const data = procedureTempState.get(telegramId);

    if (!data) return ctx.reply("Щось пішло не так. Спробуйте ще раз.");

    data.date = date;
    procedureTempState.set(telegramId, data);

    const times = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];
    const buttons = times.map((t) => [
      Markup.button.callback(t, `proctime_${t.replace(":", "")}`),
    ]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(`📅 Ви обрали дату: ${date}`);
    await ctx.telegram.sendMessage(
      ctx.chat.id,
      "🕒 Оберіть час:",
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(/proctime_(\d{2})(\d{2})/, async (ctx) => {
    const hour = ctx.match[1];
    const minute = ctx.match[2];
    const time = `${hour}:${minute}`;
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    const data = procedureTempState.get(telegramId);

    if (!data || !data.procedure || !data.date) {
      return ctx.reply("Щось пішло не так. Спробуйте ще раз.");
    }

    const existing = await Appointment.findOne({
      date: data.date,
      time,
      procedure: data.procedure,
    });

    await ctx.answerCbQuery();

    if (existing) {
      return ctx.reply("❌ Цей час уже зайнятий. Оберіть інший.");
    }

    const newAppointment = new Appointment({
      telegramId,
      procedure: data.procedure,
      date: data.date,
      time,
    });

    await newAppointment.save();
    procedureTempState.delete(telegramId);

    await ctx.editMessageText(
      `✅ Ви записались на ${data.procedure} — ${data.date} о ${time}`
    );

    if (user) {
      await notifyAdmin(
        bot,
        `🧾 ${user.firstName} (${user.phoneNumber}) записався на ${data.procedure} — ${data.date} о ${time}`
      );
    }
  });
}

function showCoffeeOptions(ctx) {
  return ctx.reply(
    "☕ Оберіть каву:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Еспресо", "coffee_espresso")],
      [Markup.button.callback("Американо", "coffee_americano")],
      [Markup.button.callback("Лате", "coffee_latte")],
      [Markup.button.callback("Лунго", "coffee_lungo")],
    ])
  );
}
