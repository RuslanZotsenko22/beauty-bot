import dotenv from "dotenv";
dotenv.config();

console.log("BOT_TOKEN:", process.env.BOT_TOKEN);
console.log("MONGO_URI:", process.env.MONGO_URI);

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
export const MONGO_URI = process.env.MONGO_URI;
