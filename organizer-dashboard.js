const loading = document.querySelector("#dashboard-loading");
const content = document.querySelector("#dashboard-content");
const errorMessage = document.querySelector("#dashboard-error");
const editDialog = document.querySelector("#edit-event-dialog");
const editForm = document.querySelector("#edit-event-form");
let currentUser;
let dashboardEvents = [];

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
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

function money(cents) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((cents || 0) / 100);
}

function dateTime(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function renderMetrics(summary) {
  const target = document.querySelector("#organizer-metrics");
  const metrics = [
    ["Events created", summary.eventCount],
    ["Tickets sold", summary.ticketsSold],
    ["Total earnings", money(summary.revenueCents)]
  ];
  target.replaceChildren(...metrics.map(([label, value]) => {
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

function renderEvents(events, salesById) {
  const list = document.querySelector("#organizer-events");
  list.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dashboard-message";
    empty.textContent = "You haven't created any events yet. Use “Create an event” to get started.";
    list.append(empty);
    return;
  }

  for (const event of events) {
    const sales = salesById.get(event._id) || { ticketsSold: 0, revenueCents: 0 };
    const card = document.createElement("article");
    card.className = "organizer-event";
    const image = document.createElement("img");
    image.src = event.image;
    image.alt = event.alt;
    image.loading = "lazy";

    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = event.title;
    const venue = document.createElement("p");
    venue.textContent = `${event.venue}, ${event.city}`;
    const startsAt = document.createElement("p");
    startsAt.textContent = dateTime(event.startsAt, event.timeZone);
    const metrics = document.createElement("div");
    metrics.className = "organizer-event-metrics";
    const ticketSales = document.createElement("span");
    ticketSales.innerHTML = `<strong>${sales.ticketsSold}</strong> / ${event.capacity} tickets sold`;
    const earnings = document.createElement("span");
    earnings.innerHTML = `<strong>${money(sales.revenueCents)}</strong> earned`;
    metrics.append(ticketSales, earnings);
    details.append(title, venue, startsAt, metrics);

    const actions = document.createElement("div");
    const status = document.createElement("p");
    status.className = "event-status";
    status.textContent = event.status;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "Edit event";
    edit.addEventListener("click", () => openEditForm(event));
    actions.append(status, edit);
    card.append(image, details, actions);
    list.append(card);
  }
}

function openEditForm(event) {
  editForm.elements.eventId.value = event._id;
  editForm.elements.title.value = event.title;
  editForm.elements.category.value = event.category;
  const startsAt = new Date(event.startsAt);
  const localTime = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000);
  editForm.elements.startsAt.value = localTime.toISOString().slice(0, 16);
  editForm.elements.timeZone.value = event.timeZone;
  editForm.elements.venue.value = event.venue;
  editForm.elements.city.value = event.city;
  editForm.elements.state.value = event.state;
  editForm.elements.price.value = (event.priceCents / 100).toFixed(2);
  editForm.elements.capacity.value = event.capacity;
  editForm.elements.status.value = event.status;
  editForm.elements.image.value = event.image === "/event-placeholder.svg" ? "" : event.image;
  editForm.elements.alt.value = event.alt;
  document.querySelector("#edit-event-message").textContent = "";
  editDialog.showModal();
}

async function loadDashboard() {
  const { user } = await requestJson("/api/auth/me");
  currentUser = user;
  document.querySelector("#dashboard-greeting").textContent = `Hi, ${user.name.split(" ")[0]}`;

  loading.hidden = true;
  content.hidden = false;
  if (user.role === "attendee") {
    document.querySelector("#organizer-view").hidden = true;
    document.querySelector("#attendee-view").hidden = false;
    document.querySelector(".dashboard-title-row > a").hidden = true;
    document.querySelector("#dashboard-subtitle").textContent = "Your account";
    document.querySelector("#dashboard-role-label").textContent = "YOUR GATHER ACCOUNT";
    return;
  }
  if (user.role !== "organizer") {
    throw new Error("This dashboard is for organizer accounts. Use the admin console from your account workspace.");
  }

  document.querySelector("#dashboard-subtitle").textContent = "Manage your events, ticket sales, and earnings.";
  const [dashboard, allEvents] = await Promise.all([
    requestJson("/api/organizer/dashboard"),
    requestJson("/api/organizer/events")
  ]);
  dashboardEvents = allEvents.events;
  const salesById = new Map(dashboard.events.map((event) => [event.id, event]));
  renderMetrics(dashboard.summary);
  renderEvents(dashboardEvents, salesById);
  document.querySelector("#organizer-view").hidden = false;
}

document.querySelector("#become-organizer").addEventListener("click", async () => {
  const button = document.querySelector("#become-organizer");
  button.disabled = true;
  try {
    await requestJson("/api/auth/become-organizer", { method: "POST", body: {} });
    window.location.reload();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    button.disabled = false;
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(editForm));
  const eventId = values.eventId;
  const eventRecord = dashboardEvents.find((item) => item._id === eventId);
  const labels = { music: "Live music", food: "Food & drink", art: "Art & culture", outdoors: "Outdoors" };
  let image = values.image.trim();
  let imageAlt = values.alt.trim();
  try {
    const imageUrl = new URL(image);
    if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "images.unsplash.com") image = "";
  } catch {
    image = "";
  }
  if (!image) {
    image = "/event-placeholder.svg";
    imageAlt = "Gather event placeholder image";
  }
  const input = {
    title: values.title,
    category: values.category,
    categoryLabel: labels[values.category],
    startsAt: new Date(values.startsAt).toISOString(),
    timeZone: values.timeZone || "America/Los_Angeles",
    venue: values.venue,
    city: values.city,
    state: values.state,
    priceCents: Math.round(Number(values.price) * 100),
    image,
    alt: imageAlt,
    capacity: Number(values.capacity),
    status: values.status
  };
  const message = document.querySelector("#edit-event-message");
  try {
    await requestJson(`/api/organizer/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: input
    });
    message.textContent = "Event updated.";
    editDialog.close();
    await loadDashboard();
  } catch (error) {
    if (eventRecord && input.capacity < eventRecord.ticketsSold + eventRecord.ticketsReserved) {
      message.textContent = error.message;
      return;
    }
    message.textContent = error.message;
  }
});

document.querySelector("#close-edit-dialog").addEventListener("click", () => editDialog.close());
editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) editDialog.close();
});

document.querySelector("#dashboard-signout").addEventListener("click", async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST", body: {} });
    window.location.href = "/";
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

loadDashboard().catch((error) => {
  loading.hidden = true;
  errorMessage.textContent = error.message === "Sign in to continue"
    ? "Sign in to view your dashboard."
    : error.message;
  errorMessage.hidden = false;
  if (error.message === "Sign in to continue") {
    const signIn = document.createElement("a");
    signIn.href = "/?signin=1&returnTo=%2Fdashboard";
    signIn.className = "text-button";
    signIn.textContent = "Sign in";
    errorMessage.append(" ", signIn);
  }
});
