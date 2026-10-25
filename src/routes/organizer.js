const express = require("express");
const { z } = require("zod");
const Event = require("../models/Event");
const Order = require("../models/Order");
const { requireAuth, requireOrganizer } = require("../middleware/auth");

const router = express.Router();
const eventInput = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.enum(["music", "food", "art", "outdoors"]),
  categoryLabel: z.string().trim().min(2).max(60),
  startsAt: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(80).default("America/Los_Angeles"),
  venue: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(0).max(100000000),
  image: z.string().url().refine((value) => value.startsWith("https://"), "Image URL must use HTTPS"),
  alt: z.string().trim().min(5).max(240),
  capacity: z.number().int().min(1).max(100000),
  status: z.enum(["draft", "live"]).default("draft")
}).strict();

function slugify(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

router.use(requireAuth, requireOrganizer);

router.get("/dashboard", async (request, response) => {
  const events = await Event.find({ organizer: request.user._id }).sort({ startsAt: 1 }).lean();
  const eventIds = events.map((event) => event._id);
  const sales = await Order.aggregate([
    { $match: { event: { $in: eventIds }, status: "paid" } },
    { $group: { _id: "$event", tickets: { $sum: "$quantity" }, revenueCents: { $sum: "$totalCents" } } }
  ]);
  const salesByEvent = new Map(sales.map((sale) => [sale._id.toString(), sale]));
  const dashboardEvents = events.map((event) => {
    const sale = salesByEvent.get(event._id.toString());
    return {
      id: event._id.toString(),
      title: event.title,
      startsAt: event.startsAt,
      status: event.status,
      capacity: event.capacity,
      ticketsSold: sale?.tickets || 0,
      revenueCents: sale?.revenueCents || 0
    };
  });
  response.json({
    summary: {
      eventCount: events.length,
      ticketsSold: dashboardEvents.reduce((total, event) => total + event.ticketsSold, 0),
      revenueCents: dashboardEvents.reduce((total, event) => total + event.revenueCents, 0)
    },
    events: dashboardEvents
  });
});

router.get("/events", async (request, response) => {
  const events = await Event.find({ organizer: request.user._id }).sort({ startsAt: 1 }).lean();
  response.json({ events });
});

router.post("/events", async (request, response) => {
  const input = eventInput.parse(request.body);
  const slug = `${slugify(input.title)}-${Date.now().toString(36)}`;
  const event = await Event.create({ ...input, startsAt: new Date(input.startsAt), slug, organizer: request.user._id });
  response.status(201).json({ event: { id: event._id.toString(), slug: event.slug, title: event.title, status: event.status } });
});

router.patch("/events/:id", async (request, response) => {
  const input = eventInput.partial().strict().parse(request.body);
  if (Object.keys(input).length === 0) return response.status(400).json({ error: "Provide at least one event field to update" });
  const event = await Event.findOne({ _id: request.params.id, organizer: request.user._id });
  if (!event) return response.status(404).json({ error: "Event not found" });
  if (input.capacity !== undefined && input.capacity < event.ticketsSold + event.ticketsReserved) {
    return response.status(409).json({ error: "Capacity cannot be less than sold and reserved tickets" });
  }
  for (const [key, value] of Object.entries(input)) event[key] = key === "startsAt" ? new Date(value) : value;
  await event.save();
  response.json({ event: { id: event._id.toString(), slug: event.slug, title: event.title, status: event.status } });
});

router.delete("/events/:id", async (request, response) => {
  const event = await Event.findOneAndUpdate(
    { _id: request.params.id, organizer: request.user._id, status: { $ne: "cancelled" } },
    { $set: { status: "cancelled" } },
    { new: true }
  );
  if (!event) return response.status(404).json({ error: "Event not found" });
  response.json({ event: { id: event._id.toString(), status: event.status } });
});

module.exports = router;