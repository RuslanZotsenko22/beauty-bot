import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  procedure: { type: String, required: true },
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Appointment = mongoose.model("Appointment", appointmentSchema);
