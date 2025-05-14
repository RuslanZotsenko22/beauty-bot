import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  procedure: { type: String, required: true },
  date: { type: String, required: true }, // ОЙ! ТИ ПРОПУСТИВ date! Це також треба!
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// ДОДАЄМО індекс ПРАВИЛЬНО:
appointmentSchema.index({ procedure: 1, date: 1, time: 1 }, { unique: true });

export const Appointment = mongoose.model("Appointment", appointmentSchema);
