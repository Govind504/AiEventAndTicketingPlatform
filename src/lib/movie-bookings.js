const mongoose = require("mongoose");
const MovieShowtime = require("../models/MovieShowtime");
const MovieBooking = require("../models/MovieBooking");

async function settleMovieBooking(bookingId, paymentId) {
  return mongoose.connection.transaction(async (session) => {
    const booking = await MovieBooking.findById(bookingId).session(session);
    if (!booking) return null;
    if (booking.status === "paid") return booking;
    if (booking.status !== "pending" || booking.expiresAt <= new Date()) return null;
    const heldSeats = await MovieShowtime.updateOne({
      _id: booking.showtime,
      reservedSeats: { $all: booking.seats },
      bookedSeats: { $nin: booking.seats }
    }, {
      $pull: { reservedSeats: { $in: booking.seats } },
      $addToSet: { bookedSeats: { $each: booking.seats } }
    }, { session });
    if (heldSeats.modifiedCount !== 1) return null;
    booking.status = "paid";
    booking.paymentId = paymentId;
    booking.paidAt = new Date();
    await booking.save({ session });
    return booking;
  });
}

async function releaseMovieBooking(bookingId, status) {
  return mongoose.connection.transaction(async (session) => {
    const booking = await MovieBooking.findOneAndUpdate(
      { _id: bookingId, status: "pending" },
      { $set: { status } },
      { new: true, session }
    );
    if (!booking) return false;
    await MovieShowtime.updateOne(
      { _id: booking.showtime },
      { $pull: { reservedSeats: { $in: booking.seats } } },
      { session }
    );
    return true;
  });
}

async function releaseExpiredMovieBookings(showtimeIds) {
  const expired = await MovieBooking.find({
    showtime: { $in: showtimeIds },
    status: "pending",
    expiresAt: { $lte: new Date() }
  }).select("_id").limit(100).lean();
  let released = 0;
  for (const booking of expired) {
    if (await releaseMovieBooking(booking._id, "expired")) released += 1;
  }
  return released;
}

module.exports = { releaseExpiredMovieBookings, releaseMovieBooking, settleMovieBooking };
