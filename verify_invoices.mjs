import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

async function run() {
  loadEnvConfig(process.cwd());
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not found");

  await mongoose.connect(uri);
  
  const InvoiceSchema = new mongoose.Schema({}, { strict: false, collection: "invoices" });
  const Invoice = mongoose.model("Invoice", InvoiceSchema);

  const ids = ["6a05776178572564b401fd76", "6a01aaa8d82fd7d0b46e2d7f"];
  console.log("--- Specific Invoices ---");
  for (const id of ids) {
    try {
        const inv = await Invoice.findById(new mongoose.Types.ObjectId(id));
        if (inv) {
          console.log(`ID: ${id}, Number: ${inv.invoiceNumber}, Status: ${inv.status}, VoidedAt: ${inv.voidedAt}, VoidReason: ${inv.voidReason}`);
        } else {
          console.log(`ID: ${id} not found.`);
        }
    } catch (e) {
        console.log(`ID: ${id} - Error: ${e.message}`);
    }
  }

  console.log("\n--- Active Recruitment Duplicates ---");
  const activeStatuses = ["draft", "pending_approval", "issued", "sent", "paid", "partially_paid", "overdue"];
  const duplicates = await Invoice.aggregate([
    { $match: { status: { $in: activeStatuses }, type: "recruitment" } },
    { $group: {
        _id: { jobId: "$jobId", employerId: "$employerId" },
        count: { $sum: 1 },
        ids: { $push: "$_id" }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);
  console.log(`Duplicate groups count: ${duplicates.length}`);

  console.log("\n--- Indexes containing \"unique_active_recruitment_invoice_per_job_employer\" ---");
  const indexes = await Invoice.collection.indexes();
  indexes.filter(idx => idx.name.includes("unique_active_recruitment_invoice_per_job_employer"))
         .forEach(idx => console.log(idx.name));

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
