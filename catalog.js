(() => {
const catalogModeButtons = [...document.querySelectorAll("[data-catalog-type]")];
const movieGrid = document.querySelector("#movie-grid");
const restaurantGrid = document.querySelector("#restaurant-grid");
const eventGrid = document.querySelector("#event-grid");
const catalogSearch = document.querySelector("#event-search");
const catalogResults = document.querySelector("#results-count");
const catalogEmpty = document.querySelector("#empty-state");
let catalogMode = "events";
let catalogMovies = [];
let catalogRestaurants = [];
let selectedMovie;
let selectedDiningRestaurant;
let selectedShowtime;
let selectedSeats = new Set();

async function catalogRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields = Array.isArray(data.fields)
      ? data.fields.map(({ field, message }) => `${field}: ${message}`).join("; ")
      : "";
    throw new Error(fields || data.error || "Request failed. Please try again.");
  }
  return data;
}

function catalogMoney(cents) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(cents / 100);
}

function catalogDate(value) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function setCatalogMode(mode) {
  catalogMode = mode;
  catalogModeButtons.forEach((button) => {
    const active = button.dataset.catalogType === mode;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelector(".category-list").hidden = mode !== "events";
  document.querySelector(".sort-label").hidden = mode !== "events";
  eventGrid.hidden = mode !== "events";
  movieGrid.hidden = mode !== "movies";
  restaurantGrid.hidden = mode !== "dining";
  document.querySelector("#events-title").innerHTML = {
    events: "What's happening<span class=\"heading-period\">.</span>",
    movies: "Now showing<span class=\"heading-period\">.</span>",
    dining: "Good tables<span class=\"heading-period\">.</span>"
  }[mode];
  catalogSearch.placeholder = `Search ${mode === "events" ? "events" : mode}`;
  document.querySelector(".search-box .sr-only").textContent = `Search ${mode === "events" ? "events" : mode}`;
  if (mode === "events" && window.gatherRefreshEvents) window.gatherRefreshEvents();
  if (mode === "movies") loadCatalogMovies();
  if (mode === "dining") loadCatalogRestaurants();
}

async function loadCatalogMovies() {
  catalogResults.textContent = "Finding movies…";
  try {
    const params = new URLSearchParams({ city: window.gatherLocation?.city || "Chandigarh" });
    const state = window.gatherLocation?.state;
    if (state) params.set("state", state);
    const { movies } = await catalogRequest(`/api/catalog/movies?${params}`);
    catalogMovies = movies;
    renderCatalogMovies();
  } catch (error) {
    catalogMovies = [];
    renderCatalogMovies(error.message);
  }
}

function renderCatalogMovies(error = "") {
  if (catalogMode !== "movies") return;
  const search = catalogSearch.value.trim().toLowerCase();
  const movies = catalogMovies.filter((movie) =>
    `${movie.title} ${movie.genres.join(" ")} ${movie.languages.join(" ")}`.toLowerCase().includes(search));
  catalogResults.textContent = `Showing ${movies.length} ${movies.length === 1 ? "movie" : "movies"}`;
  catalogEmpty.hidden = movies.length > 0;
  catalogEmpty.textContent = error || `No movies listed in ${window.gatherLocation?.city || "your city"} yet. Check back soon.`;
  movieGrid.replaceChildren(...movies.map((movie) => {
    const card = document.createElement("article");
    card.className = "catalog-card movie-card";
    const image = document.createElement("img");
    image.src = movie.posterUrl;
    image.alt = `${movie.title} poster`;
    image.loading = "lazy";
    const content = document.createElement("div");
    content.className = "catalog-card-content";
    const eyebrow = document.createElement("p");
    eyebrow.className = "event-category";
    eyebrow.textContent = `${movie.certificate} · ${movie.durationMinutes} min`;
    const title = document.createElement("h3");
    title.textContent = movie.title;
    const info = document.createElement("p");
    info.textContent = `${movie.genres.join(" · ")} · ${movie.languages.join(", ")}`;
    const description = document.createElement("p");
    description.textContent = movie.description;
    const showtimeSummary = document.createElement("p");
    showtimeSummary.className = "catalog-muted";
    showtimeSummary.textContent = movie.showtimes.length ? `${movie.showtimes.length} upcoming showtime${movie.showtimes.length === 1 ? "" : "s"}` : "Showtimes coming soon";
    const button = document.createElement("button");
    button.className = "event-book";
    button.type = "button";
    button.textContent = movie.showtimes.length ? "Choose seats ↗" : "Showtimes coming soon";
    button.disabled = movie.showtimes.length === 0;
    button.addEventListener("click", () => openMovieBooking(movie));
    content.append(eyebrow, title, info, description, showtimeSummary, button);
    card.append(image, content);
    return card;
  }));
}

async function loadCatalogRestaurants() {
  catalogResults.textContent = "Finding places…";
  try {
    const params = new URLSearchParams({ city: window.gatherLocation?.city || "Chandigarh" });
    const state = window.gatherLocation?.state;
    if (state) params.set("state", state);
    const { restaurants } = await catalogRequest(`/api/catalog/restaurants?${params}`);
    catalogRestaurants = restaurants;
    renderCatalogRestaurants();
  } catch (error) {
    catalogRestaurants = [];
    renderCatalogRestaurants(error.message);
  }
}

function renderCatalogRestaurants(error = "") {
  if (catalogMode !== "dining") return;
  const search = catalogSearch.value.trim().toLowerCase();
  const restaurants = catalogRestaurants.filter((restaurant) =>
    `${restaurant.name} ${restaurant.cuisine} ${restaurant.description}`.toLowerCase().includes(search));
  catalogResults.textContent = `Showing ${restaurants.length} ${restaurants.length === 1 ? "place" : "places"}`;
  catalogEmpty.hidden = restaurants.length > 0;
  catalogEmpty.textContent = error || `No restaurants listed in ${window.gatherLocation?.city || "your city"} yet. Check back soon.`;
  restaurantGrid.replaceChildren(...restaurants.map((restaurant) => {
    const card = document.createElement("article");
    card.className = "catalog-card restaurant-card";
    const image = document.createElement("img");
    image.src = restaurant.imageUrl;
    image.alt = restaurant.name;
    image.loading = "lazy";
    const content = document.createElement("div");
    content.className = "catalog-card-content";
    const eyebrow = document.createElement("p");
    eyebrow.className = "event-category";
    eyebrow.textContent = `${restaurant.cuisine} · ${"₹".repeat(restaurant.priceLevel)}`;
    const title = document.createElement("h3");
    title.textContent = restaurant.name;
    const address = document.createElement("p");
    address.textContent = `${restaurant.address}, ${restaurant.city}`;
    const description = document.createElement("p");
    description.textContent = restaurant.description;
    const button = document.createElement("button");
    button.className = "event-book";
    button.type = "button";
    button.textContent = "Request a table ↗";
    button.addEventListener("click", () => openDiningReservation(restaurant));
    content.append(eyebrow, title, address, description, button);
    card.append(image, content);
    return card;
  }));
}

function openMovieBooking(movie) {
  selectedMovie = movie;
  selectedSeats.clear();
  document.querySelector("#movie-dialog-title").textContent = movie.title;
  document.querySelector("#movie-dialog-meta").textContent = `${movie.certificate} · ${movie.durationMinutes} minutes · ${movie.languages.join(", ")}`;
  const showtimeSelect = document.querySelector("#movie-showtime");
  showtimeSelect.replaceChildren(...movie.showtimes.map((showtime) => {
    const option = document.createElement("option");
    option.value = showtime.id;
    option.textContent = `${catalogDate(showtime.startsAt)} · ${showtime.cinema} · ${catalogMoney(showtime.priceCents)}/seat`;
    return option;
  }));
  document.querySelector("#movie-booking-email").value = window.GatherAccount?.email || "";
  document.querySelector("#movie-booking-note").textContent = "Choose available seats. A 15-minute hold starts when you continue to payment.";
  document.querySelector("#movie-dialog .catalog-dialog-content").hidden = false;
  document.querySelector("#movie-confirmation").hidden = true;
  renderMovieSeats();
  document.querySelector("#movie-dialog").showModal();
}

function renderMovieSeats() {
  selectedShowtime = selectedMovie.showtimes.find((showtime) => showtime.id === document.querySelector("#movie-showtime").value);
  if (!selectedShowtime) return;
  selectedSeats.clear();
  const unavailable = new Set(selectedShowtime.unavailableSeats);
  const seatGrid = document.querySelector("#movie-seats");
  seatGrid.replaceChildren(...selectedShowtime.seatLabels.map((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "movie-seat";
    button.textContent = label;
    button.disabled = unavailable.has(label);
    button.setAttribute("aria-pressed", "false");
    if (button.disabled) button.classList.add("unavailable");
    button.addEventListener("click", () => {
      if (selectedSeats.has(label)) {
        selectedSeats.delete(label);
        button.classList.remove("selected");
      } else if (selectedSeats.size < 8) {
        selectedSeats.add(label);
        button.classList.add("selected");
      } else {
        document.querySelector("#movie-booking-note").textContent = "Choose up to 8 seats per booking.";
      }
      button.setAttribute("aria-pressed", String(selectedSeats.has(label)));
      updateMovieBookingDetails();
    });
    return button;
  }));
  updateMovieBookingDetails();
}

function updateMovieBookingDetails() {
  const selected = selectedMovie?.showtimes.find((showtime) => showtime.id === document.querySelector("#movie-showtime").value);
  selectedShowtime = selected;
  document.querySelector("#movie-showtime-details").textContent = selected
    ? `${selected.cinema}, ${selected.address} · ${catalogDate(selected.startsAt)} · ${selectedSeats.size} selected · ${catalogMoney(selected.priceCents * selectedSeats.size)}`
    : "";
}

async function loadCatalogRazorpay() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Secure checkout could not be loaded. Check your connection and try again."));
    document.head.append(script);
  });
}

async function startMovieCheckout() {
  const note = document.querySelector("#movie-booking-note");
  const button = document.querySelector("#movie-book-button");
  const email = document.querySelector("#movie-booking-email").value.trim();
  if (!selectedShowtime || !selectedSeats.size || !email) {
    note.textContent = "Choose at least one seat and enter your email.";
    return;
  }
  button.disabled = true;
  note.textContent = "Reserving seats…";
  try {
    const session = await catalogRequest("/api/movie-bookings/session", {
      method: "POST",
      body: { showtimeId: selectedShowtime.id, seats: [...selectedSeats], email }
    });
    await loadCatalogRazorpay();
    const checkout = new window.Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      name: "Gather",
      description: `${session.movieTitle} · ${session.seats.join(", ")}`,
      order_id: session.razorpayOrderId,
      prefill: { email: session.email },
      theme: { color: "#294d3d" },
      handler: async (payment) => {
        try {
          await catalogRequest("/api/movie-bookings/verify", {
            method: "POST",
            body: { bookingId: session.bookingId, ...payment }
          });
          document.querySelector("#movie-dialog .catalog-dialog-content").hidden = true;
          document.querySelector("#movie-confirmation-copy").textContent = `${session.movieTitle} · ${session.cinema} · Seats ${session.seats.join(", ")} · Booking reference ${session.bookingId}. Your booking is saved to your account when signed in.`;
          document.querySelector("#movie-confirmation").hidden = false;
          loadCatalogMovies();
        } catch (error) {
          note.textContent = error.message;
          button.disabled = false;
        }
      },
      modal: { ondismiss: () => { button.disabled = false; note.textContent = "Checkout closed. Your seat hold expires in 15 minutes."; } }
    });
    checkout.on("payment.failed", (event) => {
      note.textContent = event.error?.description || "Payment did not complete. Your seat hold will expire shortly.";
      button.disabled = false;
    });
    checkout.open();
    note.textContent = "Complete payment in the secure checkout window.";
  } catch (error) {
    note.textContent = error.message;
    button.disabled = false;
    loadCatalogMovies();
  }
}

function openDiningReservation(restaurant) {
  selectedDiningRestaurant = restaurant;
  document.querySelector("#dining-dialog-title").textContent = restaurant.name;
  document.querySelector("#dining-dialog-meta").textContent = `${restaurant.cuisine} · ${restaurant.address}, ${restaurant.city}`;
  const form = document.querySelector("#dining-reservation-form");
  form.elements.name.value = window.GatherAccount?.name || "";
  form.elements.email.value = window.GatherAccount?.email || "";
  form.reset();
  form.elements.name.value = window.GatherAccount?.name || "";
  form.elements.email.value = window.GatherAccount?.email || "";
  document.querySelector("#dining-reservation-note").textContent = "This sends a request to the restaurant. No advance payment is collected.";
  document.querySelector("#dining-dialog .catalog-dialog-content").hidden = false;
  document.querySelector("#dining-confirmation").hidden = true;
  document.querySelector("#dining-dialog").showModal();
}

document.querySelector("#movie-showtime").addEventListener("change", renderMovieSeats);
document.querySelector("#movie-book-button").addEventListener("click", startMovieCheckout);
document.querySelector("#dining-reservation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.querySelector("#dining-reservation-note");
  const button = form.querySelector("button[type=submit]");
  const fields = Object.fromEntries(new FormData(form));
  const body = {
    restaurantId: selectedDiningRestaurant.id,
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    partySize: Number(fields.partySize),
    requestedFor: new Date(fields.requestedFor).toISOString(),
    note: fields.note
  };
  button.disabled = true;
  note.textContent = "Sending your reservation request…";
  try {
    const result = await catalogRequest("/api/catalog/dining-reservations", { method: "POST", body });
    document.querySelector("#dining-dialog .catalog-dialog-content").hidden = true;
    document.querySelector("#dining-confirmation-copy").textContent = `${result.message} Reference: ${result.id}.`;
    document.querySelector("#dining-confirmation").hidden = false;
  } catch (error) {
    note.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

catalogModeButtons.forEach((button) => button.addEventListener("click", () => setCatalogMode(button.dataset.catalogType)));
catalogSearch.addEventListener("input", () => {
  if (catalogMode === "movies") renderCatalogMovies();
  if (catalogMode === "dining") renderCatalogRestaurants();
});

window.gatherRefreshCatalog = () => {
  if (catalogMode === "movies") return loadCatalogMovies();
  if (catalogMode === "dining") return loadCatalogRestaurants();
};
})();
