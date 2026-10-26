const dashboardDialog = document.querySelector("#host-dialog");
const authView = document.querySelector("#host-auth-view");
const dashboard = document.querySelector("#host-dashboard");
const authForm = document.querySelector("#host-auth-form");
const dashboardHeaders = () => ({});
const hostEventForm = document.querySelector("#host-event-form");
let authMode = "register";
let organizerSignup = false;
let editingEventId = null;
let nextUsersPage = null;
let nextOrdersPage = null;

window.GatherAccount = null;

const hostAddressSearch = window.GatherAddressSearch.attach({
  input: document.querySelector("#host-event-address-search"),
  status: document.querySelector("#host-event-address-status"),
  suggestions: document.querySelector("#host-event-address-suggestions"),
  map: document.querySelector("#host-event-address-map"),
  selectButton: document.querySelector("#host-event-address-use"),
  onSelect: (place, location) => {
    hostEventForm.elements.address.value = place.display_name;
    hostEventForm.elements.addressSearch.value = place.display_name;
    hostEventForm.elements.city.value = location.city;
    hostEventForm.elements.state.value = location.state;
  }
});

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-host-mode]").forEach((button) => {
    const selected = button.dataset.hostMode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const name = document.querySelector("#host-name-field");
  const password = authForm.elements.password;
  name.hidden = mode !== "register";
  authForm.elements.name.required = mode === "register";
  password.minLength = mode === "register" ? 12 : 1;
  password.autocomplete = mode === "register" ? "new-password" : "current-password";
  document.querySelector("#host-auth-submit").firstChild.textContent = mode === "register" ? "Create account " : "Sign in ";
  document.querySelector("#host-auth-note").textContent = mode === "register" ? "Use at least 12 characters for your password." : "Sign in to open your dashboard.";
}

function renderMetricCards(target, metrics) {
  target.replaceChildren(...metrics.map(({ label, value }) => {
    const card = document.createElement("div");
    card.className = "dashboard-metric";
    const amount = document.createElement("strong");
    amount.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = label;
    card.append(amount, caption);
    return card;
  }));
}

function makeRow(title, description, trailing = "") {
  const row = document.createElement("div");
  row.className = "host-event-item";
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = description;
  content.append(heading, detail);
  const status = document.createElement("span");
  status.textContent = trailing;
  row.append(content, status);
  return row;
}

function money(cents) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((cents || 0) / 100);
}

function friendlyDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Date unavailable";
}

function isSupportedEventImage(value) {
  if (value === "/event-placeholder.svg") return true;
  try {
    const imageUrl = new URL(value);
    return imageUrl.protocol === "https:" && imageUrl.hostname === "images.unsplash.com";
  } catch {
    return false;
  }
}

function showRole(role) {
  document.querySelector("#client-dashboard").hidden = role !== "attendee";
  document.querySelector("#organizer-dashboard").hidden = role !== "organizer";
  document.querySelector("#admin-dashboard").hidden = role !== "admin";
  document.querySelector("#host-event-form").hidden = role === "attendee";
  document.querySelector("#dashboard-eyebrow").textContent = {
    attendee: "YOUR GATHER ACCOUNT",
    organizer: "GATHER HOST STUDIO",
    admin: "GATHER ADMIN CONSOLE"
  }[role];
}

async function loadClientDashboard() {
  const data = await requestJson("/api/account/dashboard", { headers: dashboardHeaders() });
  renderMetricCards(document.querySelector("#client-metrics"), [
    { label: "Bookings and requests", value: data.summary.bookingCount },
    { label: "Seats and tickets", value: data.summary.ticketsBooked },
    { label: "Total spent", value: money(data.summary.spentCents) }
  ]);
  const list = document.querySelector("#client-bookings");
  list.replaceChildren();
  if (data.bookings.length === 0) {
    list.append(makeRow("No bookings yet", "Your movie tickets, dining requests, and event tickets will appear here."));
    return;
  }
  for (const booking of data.bookings) {
    const venueAndDate = booking.type === "event" && booking.event
      ? `${booking.event.venue}, ${booking.event.city} · ${friendlyDate(booking.event.startsAt)}`
      : booking.type === "movie"
        ? `${booking.venue}, ${booking.city} · ${friendlyDate(booking.startsAt)} · Seats ${booking.seats.join(", ")}`
        : booking.type === "dining"
          ? `${booking.venue}, ${booking.city} · ${friendlyDate(booking.startsAt)} · Party of ${booking.partySize}`
          : "Booking details unavailable";
    const label = booking.status === "paid"
      ? booking.type === "movie"
        ? `${booking.seats.length} seats · ${money(booking.totalCents)}`
        : `${booking.quantity} ${booking.quantity === 1 ? "ticket" : "tickets"} · ${money(booking.totalCents)}`
      : booking.type === "dining" && booking.status === "requested"
        ? "Reservation request · No payment collected"
        : booking.status;
    const row = makeRow(booking.type === "event" ? booking.event?.title || "Event unavailable" : booking.title, venueAndDate, label);
    if (booking.ticketCode) {
      const code = document.createElement("small");
      code.textContent = `Booking code: ${booking.ticketCode}`;
      row.firstChild.append(code);
    }
    if (booking.type === "event" && booking.status === "paid") {
      try {
        const { tickets } = await requestJson(`/api/account/bookings/${encodeURIComponent(booking.id)}/tickets`, { headers: dashboardHeaders() });
        for (const ticket of tickets) {
          const ticketCard = document.createElement("div");
          ticketCard.className = "account-ticket-qr";
          const qr = document.createElement("img");
          qr.src = ticket.qrCode;
          qr.alt = `QR code for ticket ${ticket.number}`;
          const number = document.createElement("small");
          number.textContent = `Ticket ${ticket.number}${ticket.checkedInAt ? " · Already used" : ""}`;
          ticketCard.append(qr, number);
          row.firstChild.append(ticketCard);
        }
      } catch (error) {
        const qrError = document.createElement("small");
        qrError.textContent = `Ticket QR unavailable: ${error.message}`;
        row.firstChild.append(qrError);
      }
    }
    list.append(row);
  }
}

async function loadOrganizerDashboard() {
  const data = await requestJson("/api/organizer/dashboard", { headers: dashboardHeaders() });
  renderMetricCards(document.querySelector("#organizer-metrics"), [
    { label: "Your events", value: data.summary.eventCount },
    { label: "Tickets sold", value: data.summary.ticketsSold },
    { label: "Ticket revenue", value: money(data.summary.revenueCents) }
  ]);
  const list = document.querySelector("#host-event-list");
  list.replaceChildren();
  if (!data.events.length) list.append(makeRow("No events yet", "Create an event below to get started."));
  data.events.forEach((event) => {
    list.append(makeRow(event.title, `${event.ticketsSold} of ${event.capacity} tickets sold · ${money(event.revenueCents)}`, event.status));
  });
}

async function loadAdminDashboard() {
  const [data, usersPage, ordersPage, catalog] = await Promise.all([
    requestJson("/api/admin/dashboard", { headers: dashboardHeaders() }),
    requestJson("/api/admin/users?page=1", { headers: dashboardHeaders() }),
    requestJson("/api/admin/orders?page=1", { headers: dashboardHeaders() }),
    requestJson("/api/admin/catalog", { headers: dashboardHeaders() })
  ]);
  renderMetricCards(document.querySelector("#admin-metrics"), [
    { label: "Accounts", value: data.summary.userCount },
    { label: "All events", value: data.summary.eventCount },
    { label: "Paid orders", value: data.summary.paidCount },
    { label: "Platform revenue", value: money(data.summary.revenueCents) }
  ]);
  const eventsList = document.querySelector("#admin-event-list");
  eventsList.replaceChildren();
  data.events.forEach((event) => {
    const owner = event.organizer ? `${event.organizer.name} · ${event.organizer.email}` : "No organizer assigned";
    const row = makeRow(event.title, `${owner} · ${event.ticketsSold}/${event.capacity} tickets · ${money(event.priceCents)}`, event.status);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => beginEventEdit(event));
    row.append(edit);
    eventsList.append(row);
  });
  const usersList = document.querySelector("#admin-users");
  usersList.replaceChildren();
  usersPage.users.forEach((user) => usersList.append(makeRow(user.name, `${user.email} · Joined ${friendlyDate(user.createdAt)}`, user.role)));
  nextUsersPage = usersPage.nextPage;
  document.querySelector("#admin-users-more").hidden = nextUsersPage === null;
  const ordersList = document.querySelector("#admin-orders");
  ordersList.replaceChildren();
  if (!ordersPage.orders.length) ordersList.append(makeRow("No orders yet", "Bookings will appear here."));
  ordersPage.orders.forEach((order) => ordersList.append(makeRow(order.eventTitle, `${order.email} · ${friendlyDate(order.createdAt)} · ${order.quantity} ticket(s) · ${money(order.totalCents)}`, order.status)));
  nextOrdersPage = ordersPage.nextPage;
  document.querySelector("#admin-orders-more").hidden = nextOrdersPage === null;
  renderAdminCatalog(catalog);
}

function addCatalogAction(row, label, handler) {
  const button = document.createElement("button");
  button.className = "text-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  row.append(button);
}

function showAdminCatalogMessage(message) {
  const target = document.querySelector("#dashboard-error");
  target.textContent = message;
  target.hidden = !message;
}

function renderAdminCatalog(data) {
  showAdminCatalogMessage("");
  const bookingList = document.querySelector("#admin-movie-bookings");
  bookingList.replaceChildren();
  if (!data.bookings.length) bookingList.append(makeRow("No movie bookings", "Confirmed and pending movie seat bookings will appear here."));
  for (const booking of data.bookings) {
    bookingList.append(makeRow(
      booking.movie,
      `${booking.email} · ${booking.cinema} · ${booking.startsAt ? friendlyDate(booking.startsAt) : "Showtime unavailable"} · Seats ${booking.seats.join(", ")} · ${money(booking.totalCents)}`,
      booking.status
    ));
  }
  const movieList = document.querySelector("#admin-movies");
  movieList.replaceChildren();
  if (!data.movies.length) movieList.append(makeRow("No movies listed", "Add a movie below to start your catalog."));
  for (const movie of data.movies) {
    const row = makeRow(movie.title, `${movie.languages.join(", ")} · ${movie.durationMinutes} min`, movie.status);
    addCatalogAction(row, "Edit", () => {
      const form = document.querySelector("#admin-movie-form");
      form.elements.movieId.value = movie.id;
      form.elements.title.value = movie.title;
      form.elements.description.value = movie.description;
      form.elements.genres.value = movie.genres.join(", ");
      form.elements.languages.value = movie.languages.join(", ");
      form.elements.durationMinutes.value = movie.durationMinutes;
      form.elements.certificate.value = movie.certificate;
      form.elements.posterUrl.value = movie.posterUrl;
      form.elements.status.value = movie.status;
      form.querySelector("h4").textContent = `Edit: ${movie.title}`;
      form.querySelector("button[type=submit]").textContent = "Save movie changes";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    movieList.append(row);
  }

  const movieSelect = document.querySelector("#admin-showtime-form").elements.movieId;
  const selectedMovieId = movieSelect.value;
  const selectableMovies = data.movies.filter((movie) => movie.status !== "archived");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.textContent = selectableMovies.length ? "Choose a movie" : "Add a movie first";
  movieSelect.replaceChildren(placeholder, ...selectableMovies.map((movie) => {
    const option = document.createElement("option");
    option.value = movie.id;
    option.textContent = movie.title;
    return option;
  }));
  if (data.movies.some((movie) => movie.id === selectedMovieId)) movieSelect.value = selectedMovieId;

  const showtimeList = document.querySelector("#admin-showtimes");
  showtimeList.replaceChildren();
  if (!data.showtimes.length) showtimeList.append(makeRow("No showtimes yet", "Create showtimes for published movies."));
  for (const showtime of data.showtimes) {
    const row = makeRow(showtime.movieTitle, `${showtime.cinema} · ${showtime.city} · ${friendlyDate(showtime.startsAt)} · ${showtime.bookedCount}/${showtime.seatCount} seats sold`, showtime.status);
    addCatalogAction(row, "Edit", () => {
      const form = document.querySelector("#admin-showtime-form");
      form.elements.showtimeId.value = showtime.id;
      form.elements.movieId.value = showtime.movieId;
      form.elements.cinema.value = showtime.cinema;
      form.elements.screen.value = showtime.screen;
      form.elements.address.value = showtime.address;
      form.elements.city.value = showtime.city;
      form.elements.state.value = showtime.state;
      const startsAt = new Date(showtime.startsAt);
      const localDate = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000);
      form.elements.startsAt.value = localDate.toISOString().slice(0, 16);
      form.elements.price.value = (showtime.priceCents / 100).toFixed(2);
      form.elements.seatLabels.value = showtime.seatLabels.join(", ");
      form.querySelector("h4").textContent = `Edit showtime: ${showtime.movieTitle}`;
      form.querySelector("button[type=submit]").textContent = "Save showtime changes";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    addCatalogAction(row, showtime.status === "live" ? "Cancel" : "Reopen", async () => {
      try {
        await requestJson(`/api/admin/catalog/showtimes/${encodeURIComponent(showtime.id)}/status`, {
          method: "PATCH",
          body: { status: showtime.status === "live" ? "cancelled" : "live" }
        });
        await loadAdminCatalog();
      } catch (error) {
        showAdminCatalogMessage(error.message);
      }
    });
    showtimeList.append(row);
  }

  const restaurantList = document.querySelector("#admin-restaurants");
  restaurantList.replaceChildren();
  if (!data.restaurants.length) restaurantList.append(makeRow("No restaurants listed", "Add a restaurant below to start taking requests."));
  for (const restaurant of data.restaurants) {
    const row = makeRow(restaurant.name, `${restaurant.cuisine} · ${restaurant.address}, ${restaurant.city}`, restaurant.status);
    addCatalogAction(row, "Edit", () => {
      const form = document.querySelector("#admin-restaurant-form");
      form.elements.restaurantId.value = restaurant.id;
      form.elements.name.value = restaurant.name;
      form.elements.description.value = restaurant.description;
      form.elements.cuisine.value = restaurant.cuisine;
      form.elements.priceLevel.value = restaurant.priceLevel;
      form.elements.address.value = restaurant.address;
      form.elements.city.value = restaurant.city;
      form.elements.state.value = restaurant.state;
      form.elements.phone.value = restaurant.phone || "";
      form.elements.imageUrl.value = restaurant.imageUrl;
      form.elements.status.value = restaurant.status;
      form.querySelector("h4").textContent = `Edit: ${restaurant.name}`;
      form.querySelector("button[type=submit]").textContent = "Save restaurant changes";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    restaurantList.append(row);
  }

  const reservationList = document.querySelector("#admin-dining-reservations");
  reservationList.replaceChildren();
  if (!data.reservations.length) reservationList.append(makeRow("No reservation requests", "New customer requests will show here."));
  for (const reservation of data.reservations) {
    const row = makeRow(`${reservation.restaurant} · ${reservation.name}`, `${reservation.partySize} guests · ${friendlyDate(reservation.requestedFor)} · ${reservation.email} · ${reservation.phone}${reservation.note ? ` · ${reservation.note}` : ""}`, reservation.status);
    if (reservation.status === "requested") {
      addCatalogAction(row, "Confirm", () => updateReservationStatus(reservation.id, "confirmed"));
      addCatalogAction(row, "Decline", () => updateReservationStatus(reservation.id, "declined"));
    }
    reservationList.append(row);
  }
}

async function loadAdminCatalog() {
  const catalog = await requestJson("/api/admin/catalog", { headers: dashboardHeaders() });
  renderAdminCatalog(catalog);
}

async function updateReservationStatus(id, status) {
  try {
    await requestJson(`/api/admin/catalog/dining-reservations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status }
    });
    await loadAdminCatalog();
  } catch (error) {
    showAdminCatalogMessage(error.message);
  }
}

function resetCatalogForm(form, title, submitLabel) {
  form.reset();
  form.elements[form.id === "admin-movie-form" ? "movieId" : "restaurantId"].value = "";
  form.querySelector("h4").textContent = title;
  form.querySelector("button[type=submit]").textContent = submitLabel;
}

document.querySelector("#admin-movie-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.movieId;
  const body = {
    title: values.title,
    description: values.description,
    genres: values.genres.split(",").map((value) => value.trim()).filter(Boolean),
    languages: values.languages.split(",").map((value) => value.trim()).filter(Boolean),
    durationMinutes: Number(values.durationMinutes),
    certificate: values.certificate,
    posterUrl: values.posterUrl,
    status: values.status
  };
  const note = document.querySelector("#admin-movie-note");
  try {
    await requestJson(id ? `/api/admin/catalog/movies/${encodeURIComponent(id)}` : "/api/admin/catalog/movies", {
      method: id ? "PATCH" : "POST",
      headers: dashboardHeaders(),
      body
    });
    note.textContent = "Movie saved.";
    resetCatalogForm(form, "Add a movie", "Save movie");
    await loadAdminCatalog();
  } catch (error) {
    note.textContent = error.message;
  }
});

document.querySelector("#admin-showtime-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.showtimeId;
  const note = document.querySelector("#admin-showtime-note");
  try {
    const body = {
      cinema: values.cinema,
      screen: values.screen,
      address: values.address,
      city: values.city,
      state: values.state,
      startsAt: new Date(values.startsAt).toISOString(),
      priceCents: Math.round(Number(values.price) * 100),
      seatLabels: values.seatLabels.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
    };
    if (!id) body.movieId = values.movieId;
    await requestJson(id ? `/api/admin/catalog/showtimes/${encodeURIComponent(id)}` : "/api/admin/catalog/showtimes", {
      method: id ? "PATCH" : "POST",
      headers: dashboardHeaders(),
      body
    });
    note.textContent = "Showtime saved.";
    form.reset();
    form.querySelector("h4").textContent = "Add a showtime";
    form.querySelector("button[type=submit]").textContent = "Save showtime";
    await loadAdminCatalog();
  } catch (error) {
    note.textContent = error.message;
  }
});

document.querySelector("#admin-restaurant-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.restaurantId;
  const note = document.querySelector("#admin-restaurant-note");
  try {
    await requestJson(id ? `/api/admin/catalog/restaurants/${encodeURIComponent(id)}` : "/api/admin/catalog/restaurants", {
      method: id ? "PATCH" : "POST",
      headers: dashboardHeaders(),
      body: {
        name: values.name,
        description: values.description,
        cuisine: values.cuisine,
        priceLevel: Number(values.priceLevel),
        address: values.address,
        city: values.city,
        state: values.state,
        phone: values.phone,
        imageUrl: values.imageUrl,
        status: values.status
      }
    });
    note.textContent = "Restaurant saved.";
    resetCatalogForm(form, "Add a restaurant", "Save restaurant");
    await loadAdminCatalog();
  } catch (error) {
    note.textContent = error.message;
  }
});

document.querySelectorAll("[data-cancel-catalog-edit]").forEach((button) => {
  button.addEventListener("click", () => {
    const type = button.dataset.cancelCatalogEdit;
    if (type === "showtime") {
      const form = document.querySelector("#admin-showtime-form");
      form.reset();
      form.querySelector("h4").textContent = "Add a showtime";
      form.querySelector("button[type=submit]").textContent = "Save showtime";
      return;
    }
    const isMovie = type === "movie";
    const form = document.querySelector(isMovie ? "#admin-movie-form" : "#admin-restaurant-form");
    resetCatalogForm(form, isMovie ? "Add a movie" : "Add a restaurant", isMovie ? "Save movie" : "Save restaurant");
  });
});

async function loadMoreAdminRows(type) {
  const isUsers = type === "users";
  const page = isUsers ? nextUsersPage : nextOrdersPage;
  if (!page) return;
  const result = await requestJson(`/api/admin/${type}?page=${page}`, { headers: dashboardHeaders() });
  const list = document.querySelector(isUsers ? "#admin-users" : "#admin-orders");
  if (isUsers) {
    result.users.forEach((user) => list.append(makeRow(user.name, `${user.email} · Joined ${friendlyDate(user.createdAt)}`, user.role)));
    nextUsersPage = result.nextPage;
    document.querySelector("#admin-users-more").hidden = nextUsersPage === null;
  } else {
    result.orders.forEach((order) => list.append(makeRow(order.eventTitle, `${order.email} · ${friendlyDate(order.createdAt)} · ${order.quantity} ticket(s) · ${money(order.totalCents)}`, order.status)));
    nextOrdersPage = result.nextPage;
    document.querySelector("#admin-orders-more").hidden = nextOrdersPage === null;
  }
}

function beginEventEdit(event) {
  editingEventId = event.id;
  const form = hostEventForm;
  ["title", "category", "venue", "address", "city", "state", "capacity", "status", "image", "alt"].forEach((name) => {
    form.elements[name].value = event[name] ?? "";
  });
  hostAddressSearch.setAddress(event.address || "");
  const startsAt = new Date(event.startsAt);
  const localDate = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000);
  form.elements.startsAt.value = localDate.toISOString().slice(0, 16);
  form.elements.price.value = (event.priceCents / 100).toFixed(2);
  form.elements.timeZone.value = event.timeZone;
  document.querySelector("#event-form-heading").textContent = `Editing: ${event.title}`;
  document.querySelector("#event-form-submit").firstChild.textContent = "Save event changes ";
  document.querySelector("#event-edit-cancel").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openDashboard() {
  let user;
  try {
    ({ user } = await requestJson("/api/auth/me", { headers: dashboardHeaders() }));
    if (organizerSignup && user.role === "attendee") {
      ({ user } = await requestJson("/api/auth/become-organizer", {
        method: "POST",
        body: {}
      }));
    }
  } catch (error) {
    if (error.status === 401) {
      window.GatherAccount = null;
      await window.gatherSetCurrentUser(null);
    }
    authView.hidden = false;
    dashboard.hidden = true;
    document.querySelector("#host-auth-note").textContent = error.message;
    dashboardDialog.showModal();
    return;
  }

  window.GatherAccount = user;
  await window.gatherSetCurrentUser(user);
  authView.hidden = true;
  dashboard.hidden = false;
  document.querySelector("#host-dashboard-title").textContent = `Hi, ${user.name.split(" ")[0]}`;
  showRole(user.role);
  const errorMessage = document.querySelector("#dashboard-error");
  errorMessage.hidden = true;
  try {
    if (user.role === "admin") await loadAdminDashboard();
    else if (user.role === "organizer") await loadOrganizerDashboard();
    else await loadClientDashboard();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
  dashboardDialog.showModal();
}

document.querySelectorAll("[data-open-host], [data-open-account]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    organizerSignup = button.hasAttribute("data-open-host");
    openDashboard();
  });
});

document.querySelectorAll("[data-host-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.hostMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(authForm));
  if (authMode === "login") delete values.name;
  try {
    await requestJson(`/api/auth/${authMode}`, { method: "POST", body: values });
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo === "/dashboard") {
      window.location.assign(returnTo);
      return;
    }
    authForm.reset();
    await openDashboard();
  } catch (error) {
    document.querySelector("#host-auth-note").textContent = error.message;
  }
});

hostEventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const categoryLabels = { music: "Live music", food: "Food & drink", art: "Art & culture", outdoors: "Outdoors" };
  const imageNeedsFallback = !isSupportedEventImage(values.image);
  const input = {
    title: values.title,
    category: values.category,
    categoryLabel: categoryLabels[values.category],
    startsAt: new Date(values.startsAt).toISOString(),
    timeZone: values.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
    venue: values.venue,
    address: values.address,
    city: values.city,
    state: values.state,
    priceCents: Math.round(Number(values.price) * 100),
    image: imageNeedsFallback ? "/event-placeholder.svg" : values.image,
    alt: imageNeedsFallback ? "Gather event placeholder image" : values.alt,
    capacity: Number(values.capacity),
    status: values.status
  };
  try {
    const editing = Boolean(editingEventId);
    const url = editing
      ? `${currentUser.role === "admin" ? "/api/admin" : "/api/organizer"}/events/${encodeURIComponent(editingEventId)}`
      : "/api/organizer/events";
    await requestJson(url, {
      method: editing ? "PATCH" : "POST",
      headers: dashboardHeaders(),
      body: input
    });
    document.querySelector("#host-event-note").textContent = imageNeedsFallback
      ? "Event saved with a placeholder image. Use a direct images.unsplash.com link to show your own photo."
      : "Event saved.";
    editingEventId = null;
    form.reset();
    hostAddressSearch.clear();
    document.querySelector("#event-form-heading").textContent = "Create an event";
    document.querySelector("#event-form-submit").firstChild.textContent = "Save event ";
    document.querySelector("#event-edit-cancel").hidden = true;
    if (currentUser.role === "admin") await loadAdminDashboard();
    else await loadOrganizerDashboard();
    if (window.gatherRefreshEvents) await window.gatherRefreshEvents();
  } catch (error) {
    document.querySelector("#host-event-note").textContent = error.message;
  }
});

document.querySelector("#event-edit-cancel").addEventListener("click", () => {
  editingEventId = null;
  hostEventForm.reset();
  hostAddressSearch.clear();
  document.querySelector("#event-form-heading").textContent = "Create an event";
  document.querySelector("#event-form-submit").firstChild.textContent = "Save event ";
  document.querySelector("#event-edit-cancel").hidden = true;
});

document.querySelector("#admin-users-more").addEventListener("click", async () => {
  try {
    await loadMoreAdminRows("users");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#admin-orders-more").addEventListener("click", async () => {
  try {
    await loadMoreAdminRows("orders");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#host-signout").addEventListener("click", async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST", body: {} });
    window.GatherAccount = null;
    await window.gatherSetCurrentUser(null);
    editingEventId = null;
    dashboard.hidden = true;
    authView.hidden = false;
    organizerSignup = false;
    setAuthMode("login");
  } catch (error) {
    const message = document.querySelector("#dashboard-error");
    message.textContent = error.message;
    message.hidden = false;
  }
});

document.querySelector(".host-dialog .dialog-close").addEventListener("click", () => dashboardDialog.close());
dashboardDialog.addEventListener("click", (event) => {
  if (event.target === dashboardDialog) dashboardDialog.close();
});

(function openRequestedAuthDialog() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("admin") === "1") {
    openDashboard();
    return;
  }
  if (params.get("signin") !== "1" && params.get("host") !== "1") return;
  organizerSignup = params.get("host") === "1";
  if (params.get("signin") === "1") setAuthMode("login");
  dashboardDialog.showModal();
})();

(async function restoreSignedInAccount() {
  try {
    const { user } = await requestJson("/api/auth/me");
    window.GatherAccount = user;
    await window.gatherSetCurrentUser(user);
  } catch (error) {
    if (error.status !== 401) showToast(error.message);
  }
})();
