const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  cuisine: { type: String, required: true, trim: true, maxlength: 100 },
  priceLevel: { type: Number, required: true, min: 1, max: 4 },
  address: { type: String, required: true, trim: true, maxlength: 240 },
  city: { type: String, required: true, trim: true, maxlength: 80, index: true },
  state: { type: String, required: true, trim: true, maxlength: 80, index: true },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  imageUrl: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ["draft", "live", "archived"], default: "draft", index: true }
}, { timestamps: true });

module.exports = mongoose.models.Restaurant || mongoose.model("Restaurant", restaurantSchema);
