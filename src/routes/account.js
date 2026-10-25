const express = require("express");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Order = require("../models/Order");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/saved-events", requireAuth, async (request, response) => {
  const user = await request.user.populate("savedEvents", "_id");
  response.json({ eventIds: user.savedEvents.map((event) => event._id.toString()) });
});

router.put("/saved-events/:eventId", requireAuth, async (request, response) => {
  const { eventId } = request.params;
  if (!mongoose.isValidObjectId(eventId)) return response.status(404).json({ error: "Event not found" });
  if (!await Event.exists({ _id: eventId })) return response.status(404).json({ error: "Event not found" });
  await request.user.updateOne({ $addToSet: { savedEvents: eventId } });
  response.json({ saved: true, eventId });
});

router.delete("/saved-events/:eventId", requireAuth, async (request, response) => {
  const { eventId } = request.params;
  if (!mongoose.isValidObjectId(eventId)) return response.status(404).json({ error: "Event not found" });
  await request.user.updateOne({ $pull: { savedEvents: eventId } });
  response.json({ saved: false, eventId });
});

router.get("/dashboard", requireAuth, async (request, response) => {
  const orders = await Order.find({ user: request.user._id })
    .populate("event", "title startsAt venue city status")
    .sort({ createdAt: -1 })
    .lean();
  const paidOrders = orders.filter((order) => order.status === "paid");

  response.json({
    summary: {
      bookingCount: paidOrders.length,
      ticketsBooked: paidOrders.reduce((total, order) => total + order.quantity, 0),
      spentCents: paidOrders.reduce((total, order) => total + order.totalCents, 0)
    },
    bookings: orders.map((order) => ({
      id: order._id.toString(),
      event: order.event ? {
        title: order.event.title,
        startsAt: order.event.startsAt,
        venue: order.event.venue,
        city: order.event.city,
        status: order.event.status
      } : null,
      quantity: order.quantity,
      totalCents: order.totalCents,
      status: order.status,
      ticketCode: order.status === "paid" ? order.ticketCode : null,
      createdAt: order.createdAt
    }))
  });
});

module.exports = router;
