const mongoose = require("mongoose");

const movieShowtimeSchema = new mongoose.Schema({
  movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  cinema: { type: String, required: true, trim: true, maxlength: 160 },
  screen: { type: String, required: true, trim: true, maxlength: 80 },
  address: { type: String, required: true, trim: true, maxlength: 240 },
  city: { type: String, required: true, trim: true, maxlength: 80, index: true },
  state: { type: String, required: true, trim: true, maxlength: 80, index: true },
  startsAt: { type: Date, required: true, index: true },
  priceCents: { type: Number, required: true, min: 1, max: 10000000 },
  seatLabels: { type: [String], required: true },
  reservedSeats: { type: [String], default: [] },
  bookedSeats: { type: [String], default: [] },
  status: { type: String, enum: ["live", "cancelled"], default: "live", index: true }
}, { timestamps: true });

module.exports = mongoose.models.MovieShowtime || mongoose.model("MovieShowtime", movieShowtimeSchema);
