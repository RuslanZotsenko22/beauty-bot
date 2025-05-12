import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err);
  }
}
