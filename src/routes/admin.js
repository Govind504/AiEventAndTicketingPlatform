const express = require("express");
const { z } = require("zod");
const Event = require("../models/Event");
const Order = require("../models/Order");
const User = require("../models/User");
const { requireAdmin, requireAuth } = require("../middleware/auth");

const router = express.Router();
const pageInput = z.coerce.number().int().min(1).max(1000000).default(1);
const pageSize = 25;
const eventUpdate = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.enum(["music", "food", "art", "outdoors"]),
  categoryLabel: z.string().trim().min(2).max(60),
  startsAt: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(80),
  venue: z.string().trim().min(2).max(160),
  address: z.string().trim().max(240),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(0).max(100000000),
  image: z.string().url().refine((value) => value.startsWith("https://"), "Image URL must use HTTPS"),
  alt: z.string().trim().min(5).max(240),
  capacity: z.number().int().min(1).max(100000),
  status: z.enum(["draft", "live", "cancelled"])
}).strict();

router.use(requireAuth, requireAdmin);

router.get("/dashboard", async (request, response) => {
  const [events, userCount, orderSummary] = await Promise.all([
    Event.find().populate("organizer", "name email").sort({ startsAt: 1 }).lean(),
    User.countDocuments(),
    Order.aggregate([
      { $group: {
        _id: null,
        orderCount: { $sum: 1 },
        paidCount: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
        revenueCents: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$totalCents", 0] } }
      } }
    ])
  ]);
  response.json({
    summary: {
      userCount,
      eventCount: events.length,
      orderCount: orderSummary[0]?.orderCount || 0,
      paidCount: orderSummary[0]?.paidCount || 0,
      revenueCents: orderSummary[0]?.revenueCents || 0
    },
    events: events.map((event) => ({
      id: event._id.toString(),
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      timeZone: event.timeZone,
      category: event.category,
      categoryLabel: event.categoryLabel,
      venue: event.venue,
      address: event.address || "",
      city: event.city,
      state: event.state,
      ticketsSold: event.ticketsSold,
      capacity: event.capacity,
      priceCents: event.priceCents,
      image: event.image,
      alt: event.alt,
      organizer: event.organizer ? { name: event.organizer.name, email: event.organizer.email } : null
    })),
  });
});

router.get("/users", async (request, response) => {
  const page = pageInput.parse(request.query.page);
  const [users, total] = await Promise.all([
    User.find().select("name email role createdAt").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    User.countDocuments()
  ]);
  response.json({
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    })),
    nextPage: page * pageSize < total ? page + 1 : null
  });
});

router.get("/orders", async (request, response) => {
  const page = pageInput.parse(request.query.page);
  const [orders, total] = await Promise.all([
    Order.find().populate("event", "title").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Order.countDocuments()
  ]);
  response.json({
    orders: orders.map((order) => ({
      id: order._id.toString(),
      eventTitle: order.event?.title || "Event unavailable",
      email: order.email,
      quantity: order.quantity,
      totalCents: order.totalCents,
      status: order.status,
      createdAt: order.createdAt
    })),
    nextPage: page * pageSize < total ? page + 1 : null
  });
});

router.patch("/events/:id", async (request, response) => {
  const input = eventUpdate.partial().parse(request.body);
  if (Object.keys(input).length === 0) return response.status(400).json({ error: "Provide at least one event field to update" });
  const event = await Event.findById(request.params.id);
  if (!event) return response.status(404).json({ error: "Event not found" });
  const capacity = input.capacity ?? event.capacity;
  if (capacity < event.ticketsSold + event.ticketsReserved) {
    return response.status(409).json({ error: "Capacity cannot be less than sold and reserved tickets" });
  }
  for (const [key, value] of Object.entries(input)) event[key] = key === "startsAt" ? new Date(value) : value;
  await event.save();
  response.json({ event: { id: event._id.toString(), title: event.title, status: event.status } });
});

module.exports = router;
