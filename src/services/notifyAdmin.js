export async function notifyAdmin(bot, message) {
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

  if (!ADMIN_CHAT_ID) {
    console.error("❌ ADMIN_CHAT_ID не задано в .env");
    return;
  }

  try {
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, message);
  } catch (err) {
    console.error(
      "❌ Не вдалося надіслати повідомлення адміну:",
      err.description || err.message || err
    );
  }
}
