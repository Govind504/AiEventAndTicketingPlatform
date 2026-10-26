const express = require("express");
const { rateLimit } = require("express-rate-limit");
const mongoose = require("mongoose");
const { z } = require("zod");
const Movie = require("../models/Movie");
const MovieShowtime = require("../models/MovieShowtime");
const Restaurant = require("../models/Restaurant");
const DiningReservation = require("../models/DiningReservation");
const { releaseExpiredMovieBookings } = require("../lib/movie-bookings");
const { optionalAuth, requireAuth } = require("../middleware/auth");

const router = express.Router();
const reservationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const cityInput = z.string().trim().min(1).max(80).optional();
const stateInput = z.string().trim().max(80).optional();
const idInput = (value) => typeof value === "string" && mongoose.isValidObjectId(value);

router.get("/movies", async (request, response) => {
  const city = cityInput.parse(request.query.city);
  const state = stateInput.parse(request.query.state);
  const showtimeFilter = {
    status: "live",
    startsAt: { $gt: new Date() }
  };
  if (city) showtimeFilter.city = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (state) showtimeFilter.state = new RegExp(`^${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  let showtimes = await MovieShowtime.find(showtimeFilter).sort({ startsAt: 1 }).limit(500).lean();
  if (showtimes.length) {
    await releaseExpiredMovieBookings(showtimes.map((showtime) => showtime._id));
    showtimes = await MovieShowtime.find(showtimeFilter).sort({ startsAt: 1 }).limit(500).lean();
  }
  const movieIds = [...new Set(showtimes.map((showtime) => showtime.movie.toString()))];
  const movies = await Movie.find({ _id: { $in: movieIds }, status: "live" }).sort({ title: 1 }).limit(100).lean();
  response.json({
    movies: movies.map((movie) => ({
      id: movie._id.toString(),
      title: movie.title,
      description: movie.description,
      genres: movie.genres,
      languages: movie.languages,
      durationMinutes: movie.durationMinutes,
      certificate: movie.certificate,
      posterUrl: movie.posterUrl,
      showtimes: showtimes.filter((showtime) => showtime.movie.toString() === movie._id.toString()).map((showtime) => ({
        id: showtime._id.toString(),
        cinema: showtime.cinema,
        screen: showtime.screen,
        address: showtime.address,
        startsAt: showtime.startsAt,
        priceCents: showtime.priceCents,
        seatLabels: showtime.seatLabels,
        unavailableSeats: [...showtime.reservedSeats, ...showtime.bookedSeats]
      }))
    }))
  });
});

router.get("/restaurants", async (request, response) => {
  const city = cityInput.parse(request.query.city);
  const state = stateInput.parse(request.query.state);
  const filter = { status: "live" };
  if (city) filter.city = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (state) filter.state = new RegExp(`^${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const restaurants = await Restaurant.find(filter).sort({ name: 1 }).limit(100).lean();
  response.json({
    restaurants: restaurants.map((restaurant) => ({
      id: restaurant._id.toString(),
      name: restaurant.name,
      description: restaurant.description,
      cuisine: restaurant.cuisine,
      priceLevel: restaurant.priceLevel,
      address: restaurant.address,
      city: restaurant.city,
      state: restaurant.state,
      phone: restaurant.phone,
      imageUrl: restaurant.imageUrl
    }))
  });
});

router.post("/dining-reservations", reservationLimiter, optionalAuth, async (request, response) => {
  const input = z.object({
    restaurantId: z.string().refine(idInput, "Invalid restaurant"),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(30),
    partySize: z.number().int().min(1).max(20),
    requestedFor: z.string().datetime({ offset: true }),
    note: z.string().trim().max(500).default("")
  }).strict().parse(request.body);
  if (request.user && input.email.toLowerCase() !== request.user.email) {
    return response.status(403).json({ error: "Use the email address on your signed-in account" });
  }
  const requestedFor = new Date(input.requestedFor);
  if (requestedFor <= new Date()) return response.status(400).json({ error: "Choose a future reservation time" });
  const restaurant = await Restaurant.findOne({ _id: input.restaurantId, status: "live" }).select("_id");
  if (!restaurant) return response.status(404).json({ error: "Restaurant not found" });
  const reservation = await DiningReservation.create({
    restaurant: restaurant._id,
    user: request.user?._id || null,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    partySize: input.partySize,
    requestedFor,
    note: input.note
  });
  response.status(201).json({ id: reservation._id.toString(), status: reservation.status, message: "Reservation request sent. The restaurant will confirm your table." });
});

router.get("/dining-reservations", requireAuth, async (request, response) => {
  const pageInput = z.coerce.number().int().min(1).max(10000).default(1);
  if (request.user.role !== "admin") return response.status(403).json({ error: "Administrator access required" });
  const page = pageInput.parse(request.query.page);
  const reservations = await DiningReservation.find().populate("restaurant", "name city").sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).lean();
  response.json({ reservations: reservations.map((item) => ({
    id: item._id.toString(),
    restaurant: item.restaurant?.name || "Restaurant unavailable",
    city: item.restaurant?.city || "",
    name: item.name,
    email: item.email,
    phone: item.phone,
    partySize: item.partySize,
    requestedFor: item.requestedFor,
    note: item.note,
    status: item.status
  })) });
});

module.exports = router;
