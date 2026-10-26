const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, enum: ["music", "food", "art", "outdoors"] },
  categoryLabel: { type: String, required: true, trim: true, maxlength: 60 },
  startsAt: { type: Date, required: true, index: true },
  timeZone: { type: String, required: true, default: "America/Los_Angeles" },
  venue: { type: String, required: true, trim: true, maxlength: 160 },
  address: { type: String, default: "", trim: true, maxlength: 240 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, required: true, trim: true, maxlength: 40 },
  priceCents: { type: Number, required: true, min: 0, max: 50000000 },
  currency: { type: String, required: true, default: "inr", lowercase: true, enum: ["inr"] },
  image: { type: String, required: true },
  alt: { type: String, required: true, trim: true, maxlength: 240 },
  capacity: { type: Number, required: true, min: 1, max: 100000 },
  ticketsSold: { type: Number, default: 0, min: 0 },
  ticketsReserved: { type: Number, default: 0, min: 0 },
  status: { type: String, required: true, enum: ["draft", "live", "cancelled"], default: "draft", index: true },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

eventSchema.index({ status: 1, startsAt: 1 });
eventSchema.index({ category: 1, status: 1, startsAt: 1 });

module.exports = mongoose.models.Event || mongoose.model("Event", eventSchema);