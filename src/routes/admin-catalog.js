const express = require("express");
const { z } = require("zod");
const Movie = require("../models/Movie");
const MovieShowtime = require("../models/MovieShowtime");
const Restaurant = require("../models/Restaurant");
const DiningReservation = require("../models/DiningReservation");
const MovieBooking = require("../models/MovieBooking");
const { requireAdmin, requireAuth } = require("../middleware/auth");

const router = express.Router();
const id = z.string().regex(/^[a-f\d]{24}$/i);
const httpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "images.unsplash.com";
}, "Image URL must be an HTTPS images.unsplash.com link");
const movieInput = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(3000),
  genres: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  durationMinutes: z.number().int().min(1).max(600),
  certificate: z.string().trim().min(1).max(10),
  posterUrl: httpsUrl,
  status: z.enum(["draft", "live", "archived"])
}).strict();
const showtimeInput = z.object({
  movieId: id,
  cinema: z.string().trim().min(1).max(160),
  screen: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({ offset: true }),
  priceCents: z.number().int().min(1).max(10000000),
  seatLabels: z.array(z.string().regex(/^[A-Z]{1,2}\d{1,2}$/)).min(1).max(300)
}).strict();
const restaurantInput = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(3000),
  cuisine: z.string().trim().min(1).max(100),
  priceLevel: z.number().int().min(1).max(4),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).default(""),
  imageUrl: httpsUrl,
  status: z.enum(["draft", "live", "archived"])
}).strict();

router.use(requireAuth, requireAdmin);

router.get("/", async (request, response) => {
  const [movies, showtimes, restaurants, reservations, bookings] = await Promise.all([
    Movie.find().sort({ title: 1 }).lean(),
    MovieShowtime.find().populate("movie", "title").sort({ startsAt: 1 }).limit(500).lean(),
    Restaurant.find().sort({ name: 1 }).lean(),
    DiningReservation.find().populate("restaurant", "name").sort({ createdAt: -1 }).limit(100).lean(),
    MovieBooking.find().populate("movie", "title").populate("showtime", "cinema startsAt").sort({ createdAt: -1 }).limit(100).lean()
  ]);
  response.json({
    movies: movies.map((movie) => ({ ...movie, id: movie._id.toString() })),
    showtimes: showtimes.map((showtime) => ({
      id: showtime._id.toString(),
      movieId: showtime.movie?._id.toString(),
      movieTitle: showtime.movie?.title || "Movie unavailable",
      cinema: showtime.cinema,
      screen: showtime.screen,
      address: showtime.address,
      city: showtime.city,
      state: showtime.state,
      startsAt: showtime.startsAt,
      priceCents: showtime.priceCents,
      seatLabels: showtime.seatLabels,
      seatCount: showtime.seatLabels.length,
      bookedCount: showtime.bookedSeats.length,
      status: showtime.status
    })),
    restaurants: restaurants.map((restaurant) => ({ ...restaurant, id: restaurant._id.toString() })),
    reservations: reservations.map((reservation) => ({
      id: reservation._id.toString(),
      restaurant: reservation.restaurant?.name || "Restaurant unavailable",
      name: reservation.name,
      email: reservation.email,
      phone: reservation.phone,
      partySize: reservation.partySize,
      requestedFor: reservation.requestedFor,
      note: reservation.note,
      status: reservation.status
    })),
    bookings: bookings.map((booking) => ({
      id: booking._id.toString(),
      movie: booking.movie?.title || "Movie unavailable",
      cinema: booking.showtime?.cinema || "Cinema unavailable",
      startsAt: booking.showtime?.startsAt || null,
      email: booking.email,
      seats: booking.seats,
      totalCents: booking.totalCents,
      status: booking.status,
      createdAt: booking.createdAt
    }))
  });
});

router.post("/movies", async (request, response) => {
  const input = movieInput.parse(request.body);
  const movie = await Movie.create({ ...input, genres: [...new Set(input.genres)], languages: [...new Set(input.languages)] });
  response.status(201).json({ id: movie._id.toString() });
});

router.patch("/movies/:id", async (request, response) => {
  const input = movieInput.partial().parse(request.body);
  if (!Object.keys(input).length) return response.status(400).json({ error: "Provide at least one movie field to update" });
  if (input.genres) input.genres = [...new Set(input.genres)];
  if (input.languages) input.languages = [...new Set(input.languages)];
  const movie = await Movie.findByIdAndUpdate(id.parse(request.params.id), input, { new: true, runValidators: true });
  if (!movie) return response.status(404).json({ error: "Movie not found" });
  response.json({ id: movie._id.toString(), status: movie.status });
});

router.post("/showtimes", async (request, response) => {
  const input = showtimeInput.parse(request.body);
  if (new Set(input.seatLabels).size !== input.seatLabels.length) return response.status(400).json({ error: "Seat labels must be unique" });
  if (new Date(input.startsAt) <= new Date()) return response.status(400).json({ error: "Showtime must be in the future" });
  const movie = await Movie.findById(input.movieId);
  if (!movie || movie.status === "archived") return response.status(404).json({ error: "Movie not found or archived" });
  const showtime = await MovieShowtime.create({
    movie: movie._id,
    cinema: input.cinema,
    screen: input.screen,
    address: input.address,
    city: input.city,
    state: input.state,
    startsAt: new Date(input.startsAt),
    priceCents: input.priceCents,
    seatLabels: input.seatLabels
  });
  response.status(201).json({ id: showtime._id.toString() });
});

router.patch("/showtimes/:id", async (request, response) => {
  const input = showtimeInput.omit({ movieId: true }).partial().parse(request.body);
  if (!Object.keys(input).length) return response.status(400).json({ error: "Provide at least one showtime field to update" });
  if (input.startsAt && new Date(input.startsAt) <= new Date()) return response.status(400).json({ error: "Showtime must be in the future" });
  if (input.seatLabels && new Set(input.seatLabels).size !== input.seatLabels.length) {
    return response.status(400).json({ error: "Seat labels must be unique" });
  }
  const showtime = await MovieShowtime.findById(id.parse(request.params.id));
  if (!showtime) return response.status(404).json({ error: "Showtime not found" });
  if (input.seatLabels && [...showtime.bookedSeats, ...showtime.reservedSeats].some((seat) => !input.seatLabels.includes(seat))) {
    return response.status(409).json({ error: "Cannot remove seats that are booked or currently held" });
  }
  for (const [key, value] of Object.entries(input)) showtime[key] = key === "startsAt" ? new Date(value) : value;
  await showtime.save();
  response.json({ id: showtime._id.toString(), status: showtime.status });
});

router.patch("/showtimes/:id/status", async (request, response) => {
  const input = z.object({ status: z.enum(["live", "cancelled"]) }).strict().parse(request.body);
  const showtime = await MovieShowtime.findByIdAndUpdate(id.parse(request.params.id), { $set: input }, { new: true });
  if (!showtime) return response.status(404).json({ error: "Showtime not found" });
  response.json({ id: showtime._id.toString(), status: showtime.status });
});

router.post("/restaurants", async (request, response) => {
  const restaurant = await Restaurant.create(restaurantInput.parse(request.body));
  response.status(201).json({ id: restaurant._id.toString() });
});

router.patch("/restaurants/:id", async (request, response) => {
  const input = restaurantInput.partial().parse(request.body);
  if (!Object.keys(input).length) return response.status(400).json({ error: "Provide at least one restaurant field to update" });
  const restaurant = await Restaurant.findByIdAndUpdate(id.parse(request.params.id), input, { new: true, runValidators: true });
  if (!restaurant) return response.status(404).json({ error: "Restaurant not found" });
  response.json({ id: restaurant._id.toString(), status: restaurant.status });
});

router.patch("/dining-reservations/:id", async (request, response) => {
  const input = z.object({ status: z.enum(["confirmed", "declined"]) }).strict().parse(request.body);
  const reservation = await DiningReservation.findByIdAndUpdate(
    id.parse(request.params.id),
    { $set: input },
    { new: true, runValidators: true }
  );
  if (!reservation) return response.status(404).json({ error: "Reservation not found" });
  response.json({ id: reservation._id.toString(), status: reservation.status });
});

module.exports = router;
