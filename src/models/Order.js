const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  quantity: { type: Number, required: true, min: 1, max: 8 },
  unitPriceCents: { type: Number, required: true, min: 0 },
  totalCents: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, default: "inr", lowercase: true, enum: ["inr"] },
  status: { type: String, enum: ["pending", "paid", "expired", "failed"], default: "pending", index: true },
  razorpayOrderId: { type: String, unique: true, sparse: true },
  paymentId: { type: String, default: undefined },
  ticketCode: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  expiresAt: { type: Date, required: true, index: true },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);