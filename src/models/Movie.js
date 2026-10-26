const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  genres: { type: [String], required: true },
  languages: { type: [String], required: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 600 },
  certificate: { type: String, required: true, trim: true, maxlength: 10 },
  posterUrl: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ["draft", "live", "archived"], default: "draft", index: true }
}, { timestamps: true });

module.exports = mongoose.models.Movie || mongoose.model("Movie", movieSchema);
