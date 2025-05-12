import { Markup } from "telegraf";
import { User } from "../models/User.js";

const coffeeTempState = new Map();

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
