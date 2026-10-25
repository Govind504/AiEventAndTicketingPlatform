const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["attendee", "organizer", "admin"], default: "attendee" },
  savedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }]
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);