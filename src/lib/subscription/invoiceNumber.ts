/**
 * Atomic invoice number generator using a MongoDB counter collection.
 * Format: INV-YYYYMM-XXXXX (e.g., INV-202604-00001)
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/mongoose";

export async function generateInvoiceNumber(): Promise<string> {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database connection not available");

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = await db.collection<{ _id: string; seq: number }>("counters").findOneAndUpdate(
    { _id: `invoice_${yearMonth}` as unknown as never },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );

  const seq = String(result?.seq ?? 1).padStart(5, "0");
  return `INV-${yearMonth}-${seq}`;
}
