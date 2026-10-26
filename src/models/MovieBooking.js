const mongoose = require("mongoose");

const movieBookingSchema = new mongoose.Schema({
  showtime: { type: mongoose.Schema.Types.ObjectId, ref: "MovieShowtime", required: true, index: true },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  seats: { type: [String], required: true },
  totalCents: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending", "paid", "expired", "failed"], default: "pending", index: true },
  razorpayOrderId: { type: String, unique: true, sparse: true },
  paymentId: { type: String, default: undefined },
  expiresAt: { type: Date, required: true, index: true },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.MovieBooking || mongoose.model("MovieBooking", movieBookingSchema);
