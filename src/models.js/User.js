import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: String,
  lastName: String,
  phoneNumber: { type: String, required: true },
  floor: { type: Number, default: null }, // 🛠 ОБОВ'ЯЗКОВО!
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model("User", userSchema);
