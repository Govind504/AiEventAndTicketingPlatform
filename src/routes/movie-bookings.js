const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const MovieShowtime = require("../models/MovieShowtime");
const MovieBooking = require("../models/MovieBooking");
const { releaseExpiredMovieBookings, releaseMovieBooking, settleMovieBooking } = require("../lib/movie-bookings");
const { getCapturedPayment, getRazorpay, verifyPaymentSignature } = require("../lib/razorpay");
const { getRazorpayOrderAmountError } = require("../lib/payment-limits");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();
const bookingInput = z.object({
  showtimeId: z.string().refine(mongoose.isValidObjectId, "Invalid showtime"),
  seats: z.array(z.string().regex(/^[A-Z]{1,2}\d{1,2}$/)).min(1).max(8),
  email: z.string().trim().email().max(254)
}).strict();
const verificationInput = z.object({
  bookingId: z.string().refine(mongoose.isValidObjectId, "Invalid booking"),
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i)
}).strict();

router.post("/session", optionalAuth, async (request, response) => {
  const input = bookingInput.parse(request.body);
  const seats = [...new Set(input.seats)];
  if (seats.length !== input.seats.length) return response.status(400).json({ error: "Choose each seat only once" });
  if (request.user && input.email.toLowerCase() !== request.user.email) {
    return response.status(403).json({ error: "Use the email address on your signed-in account" });
  }
  const showtime = await MovieShowtime.findOne({ _id: input.showtimeId, status: "live", startsAt: { $gt: new Date() } }).populate("movie", "title status");
  if (!showtime || !showtime.movie || showtime.movie.status !== "live") return response.status(404).json({ error: "This showtime is no longer available" });
  const amountError = getRazorpayOrderAmountError(showtime.priceCents * seats.length);
  if (amountError) return response.status(400).json({ error: amountError });
  await releaseExpiredMovieBookings([showtime._id]);
  if (seats.some((seat) => !showtime.seatLabels.includes(seat))) return response.status(400).json({ error: "One or more selected seats are invalid" });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const booking = new MovieBooking({
    showtime: showtime._id,
    movie: showtime.movie._id,
    user: request.user?._id || null,
    email: input.email.toLowerCase(),
    seats,
    totalCents: showtime.priceCents * seats.length,
    expiresAt
  });
  try {
    await mongoose.connection.transaction(async (session) => {
      const held = await MovieShowtime.updateOne({
        _id: showtime._id,
        status: "live",
        startsAt: { $gt: new Date() },
        seatLabels: { $all: seats },
        reservedSeats: { $nin: seats },
        bookedSeats: { $nin: seats }
      }, { $addToSet: { reservedSeats: { $each: seats } } }, { session });
      if (held.modifiedCount !== 1) {
        const error = new Error("One or more selected seats are no longer available");
        error.status = 409;
        throw error;
      }
      await booking.save({ session });
    });
  } catch (error) {
    if (error.status === 409) return response.status(409).json({ error: error.message });
    throw error;
  }
  try {
    const razorpayOrder = await getRazorpay().orders.create({
      amount: booking.totalCents,
      currency: "INR",
      receipt: booking._id.toString(),
      notes: { movieId: showtime.movie._id.toString(), showtimeId: showtime._id.toString(), internalBookingId: booking._id.toString() }
    });
    booking.razorpayOrderId = razorpayOrder.id;
    await booking.save();
    response.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      bookingId: booking._id.toString(),
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      movieTitle: showtime.movie.title,
      cinema: showtime.cinema,
      startsAt: showtime.startsAt,
      seats,
      email: booking.email
    });
  } catch (error) {
    await releaseMovieBooking(booking._id, "failed");
    if (error.status === 503) return response.status(503).json({ error: error.message });
    throw error;
  }
});

router.post("/verify", optionalAuth, async (request, response) => {
  const input = verificationInput.parse(request.body);
  const booking = await MovieBooking.findById(input.bookingId).populate("movie", "title");
  if (!booking) return response.status(404).json({ error: "Movie booking not found" });
  if (request.user && booking.user?.toString() !== request.user._id.toString()) {
    return response.status(403).json({ error: "This booking belongs to a different account" });
  }
  if (booking.razorpayOrderId !== input.razorpay_order_id) return response.status(400).json({ error: "Payment does not match this movie booking" });
  if (booking.status === "paid") return response.json({ status: "paid", movieTitle: booking.movie.title, seats: booking.seats });
  if (booking.status !== "pending" || booking.expiresAt <= new Date()) {
    await releaseMovieBooking(booking._id, "expired");
    return response.status(409).json({ error: "This seat reservation has expired. Please choose seats again." });
  }
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    return response.status(400).json({ error: "Razorpay payment signature could not be verified" });
  }
  const payment = await getCapturedPayment(booking, input.razorpay_payment_id);
  if (payment.status !== "captured") return response.status(409).json({ error: "Payment has not been captured yet. Please try again shortly." });
  const paidBooking = await settleMovieBooking(booking._id, payment.id);
  if (!paidBooking) return response.status(409).json({ error: "Payment was received, but movie ticket confirmation is still processing." });
  response.json({ status: "paid", movieTitle: booking.movie.title, seats: booking.seats });
});

module.exports = router;
