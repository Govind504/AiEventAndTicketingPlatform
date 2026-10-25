const express = require("express");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const { serializeEvent } = require("../lib/events");

const router = express.Router();
const categories = new Set(["music", "food", "art", "outdoors"]);

router.get("/", async (request, response) => {
  const query = { status: "live", startsAt: { $gte: new Date() } };
  const category = typeof request.query.category === "string" ? request.query.category : "";
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 80) : "";
  const sort = request.query.sort === "price-low" ? { priceCents: 1, startsAt: 1 } : { startsAt: 1 };

  if (category && category !== "all") {
    if (!categories.has(category)) return response.status(400).json({ error: "Unknown event category" });
    query.category = category;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = ["title", "categoryLabel", "venue", "city"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
  }

  const events = await Event.find(query).sort(sort).limit(100).lean();
  response.json({ events: events.map(serializeEvent) });
});

router.get("/:id", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ error: "Event not found" });
  const event = await Event.findOne({ _id: request.params.id, status: "live" }).lean();
  if (!event) return response.status(404).json({ error: "Event not found" });
  response.json({ event: serializeEvent(event) });
});

module.exports = router;