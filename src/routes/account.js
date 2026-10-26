const express = require("express");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Order = require("../models/Order");
const MovieBooking = require("../models/MovieBooking");
const DiningReservation = require("../models/DiningReservation");
const { ticketPresentations } = require("../lib/tickets");
const { settlePaidOrder } = require("../lib/orders");
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
  const [orders, movieBookings, diningReservations] = await Promise.all([
    Order.find({ user: request.user._id }).populate("event", "title startsAt venue city status").sort({ createdAt: -1 }).lean(),
    MovieBooking.find({ user: request.user._id }).populate("movie", "title").populate("showtime", "cinema startsAt city").sort({ createdAt: -1 }).lean(),
    DiningReservation.find({ user: request.user._id }).populate("restaurant", "name city").sort({ createdAt: -1 }).lean()
  ]);
  const paidOrders = orders.filter((order) => order.status === "paid");
  const paidMovieBookings = movieBookings.filter((booking) => booking.status === "paid");

  response.json({
    summary: {
      bookingCount: paidOrders.length + paidMovieBookings.length + diningReservations.length,
      ticketsBooked: paidOrders.reduce((total, order) => total + order.quantity, 0) + paidMovieBookings.reduce((total, booking) => total + booking.seats.length, 0),
      spentCents: paidOrders.reduce((total, order) => total + order.totalCents, 0) + paidMovieBookings.reduce((total, booking) => total + booking.totalCents, 0)
    },
    bookings: [
      ...orders.map((order) => ({
      id: order._id.toString(),
      type: "event",
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
      })),
      ...movieBookings.map((booking) => ({
        id: booking._id.toString(),
        type: "movie",
        title: booking.movie?.title || "Movie unavailable",
        venue: booking.showtime?.cinema || "Cinema unavailable",
        city: booking.showtime?.city || "",
        startsAt: booking.showtime?.startsAt || null,
        seats: booking.seats,
        totalCents: booking.totalCents,
        status: booking.status,
        createdAt: booking.createdAt
      })),
      ...diningReservations.map((reservation) => ({
        id: reservation._id.toString(),
        type: "dining",
        title: reservation.restaurant?.name || "Restaurant unavailable",
        venue: "Reservation request",
        city: reservation.restaurant?.city || "",
        startsAt: reservation.requestedFor,
        partySize: reservation.partySize,
        status: reservation.status,
        createdAt: reservation.createdAt
      }))
    ].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  });
});

router.get("/bookings/:orderId/tickets", requireAuth, async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.orderId)) {
    return response.status(404).json({ error: "Booking not found" });
  }
  const order = await Order.findOne({
    _id: request.params.orderId,
    user: request.user._id,
    status: "paid"
  }).select("_id");
  if (!order) return response.status(404).json({ error: "Booking not found" });
  await settlePaidOrder(order._id);
  response.json({ tickets: await ticketPresentations(order._id) });
});

module.exports = router;
