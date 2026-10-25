const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  number: { type: Number, required: true },
  checkedInAt: { type: Date, default: null },
  checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

ticketSchema.index({ order: 1, number: 1 }, { unique: true });

module.exports = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);
