const dashboardDialog = document.querySelector("#host-dialog");
const authView = document.querySelector("#host-auth-view");
const dashboard = document.querySelector("#host-dashboard");
const authForm = document.querySelector("#host-auth-form");
const dashboardHeaders = () => ({});
let authMode = "register";
let organizerSignup = false;
let editingEventId = null;
let nextUsersPage = null;
let nextOrdersPage = null;

window.GatherAccount = null;

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
    { label: "Events booked", value: data.summary.bookingCount },
    { label: "Tickets booked", value: data.summary.ticketsBooked },
    { label: "Total spent", value: money(data.summary.spentCents) }
  ]);
  const list = document.querySelector("#client-bookings");
  list.replaceChildren();
  if (data.bookings.length === 0) {
    list.append(makeRow("No bookings yet", "Your event tickets will appear here."));
    return;
  }
  for (const booking of data.bookings) {
    const venueAndDate = booking.event ? `${booking.event.venue}, ${booking.event.city} · ${friendlyDate(booking.event.startsAt)}` : "Event details unavailable";
    const label = booking.status === "paid"
      ? `${booking.quantity} ${booking.quantity === 1 ? "ticket" : "tickets"} · ${money(booking.totalCents)}`
      : booking.status;
    const row = makeRow(booking.event?.title || "Event unavailable", venueAndDate, label);
    if (booking.ticketCode) {
      const code = document.createElement("small");
      code.textContent = `Booking code: ${booking.ticketCode}`;
      row.firstChild.append(code);
    }
    if (booking.status === "paid") {
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
  const [data, usersPage, ordersPage] = await Promise.all([
    requestJson("/api/admin/dashboard", { headers: dashboardHeaders() }),
    requestJson("/api/admin/users?page=1", { headers: dashboardHeaders() }),
    requestJson("/api/admin/orders?page=1", { headers: dashboardHeaders() })
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
}

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
  const form = document.querySelector("#host-event-form");
  ["title", "category", "venue", "city", "state", "capacity", "status", "image", "alt"].forEach((name) => {
    form.elements[name].value = event[name] ?? "";
  });
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

document.querySelector("#host-event-form").addEventListener("submit", async (event) => {
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
  document.querySelector("#host-event-form").reset();
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
