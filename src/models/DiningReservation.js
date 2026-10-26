const mongoose = require("mongoose");

const diningReservationSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  partySize: { type: Number, required: true, min: 1, max: 20 },
  requestedFor: { type: Date, required: true, index: true },
  note: { type: String, trim: true, maxlength: 500, default: "" },
  status: { type: String, enum: ["requested", "confirmed", "declined", "cancelled"], default: "requested", index: true }
}, { timestamps: true });

module.exports = mongoose.models.DiningReservation || mongoose.model("DiningReservation", diningReservationSchema);
