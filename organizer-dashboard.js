const loading = document.querySelector("#dashboard-loading");
const content = document.querySelector("#dashboard-content");
const errorMessage = document.querySelector("#dashboard-error");
const editDialog = document.querySelector("#edit-event-dialog");
const editForm = document.querySelector("#edit-event-form");
let currentUser;
let dashboardEvents = [];
let selectedScanEventId;
let cameraStream;
let scanAnimationFrame;
let scanBusy = false;
let detector;

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
    actions.className = "organizer-event-actions";
    const status = document.createElement("p");
    status.className = "event-status";
    status.textContent = event.status;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "Edit event";
    edit.addEventListener("click", () => openEditForm(event));
    const scan = document.createElement("button");
    scan.type = "button";
    scan.className = "text-button";
    scan.textContent = "Scan tickets";
    scan.addEventListener("click", () => openTicketScanner(event));
    actions.append(status, edit, scan);
    card.append(image, details, actions);
    list.append(card);
  }
}

async function renderAccountBookings(bookings) {
  const list = document.querySelector("#account-bookings");
  list.replaceChildren();
  if (bookings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dashboard-message";
    empty.textContent = "No bookings found for this account. Tickets purchased while signed out will not appear here.";
    list.append(empty);
    return;
  }

  const cards = await Promise.all(bookings.map(async (booking) => {
    const card = document.createElement("article");
    card.className = "account-booking";
    const title = document.createElement("h3");
    title.textContent = booking.event?.title || "Event details unavailable";
    const details = document.createElement("p");
    details.textContent = booking.event
      ? `${booking.event.venue}, ${booking.event.city} · ${dateTime(booking.event.startsAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}`
      : "Event details are unavailable.";
    const status = document.createElement("p");
    status.textContent = booking.status === "paid"
      ? `${booking.quantity} ${booking.quantity === 1 ? "ticket" : "tickets"} · ${money(booking.totalCents)} · Confirmed`
      : `Booking status: ${booking.status}`;
    card.append(title, details, status);

    if (booking.status === "paid") {
      const ticketList = document.createElement("div");
      ticketList.className = "account-booking-tickets";
      try {
        const { tickets } = await requestJson(`/api/account/bookings/${encodeURIComponent(booking.id)}/tickets`);
        for (const ticket of tickets) {
          const ticketCard = document.createElement("div");
          ticketCard.className = "account-booking-ticket";
          const image = document.createElement("img");
          image.src = ticket.qrCode;
          image.alt = `QR code for ticket ${ticket.number}`;
          const number = document.createElement("small");
          number.textContent = `Ticket ${ticket.number}${ticket.checkedInAt ? " · Already used" : ""}`;
          ticketCard.append(image, number);
          ticketList.append(ticketCard);
        }
      } catch (error) {
        const message = document.createElement("p");
        message.textContent = `Ticket QR unavailable: ${error.message}`;
        ticketList.append(message);
      }
      card.append(ticketList);
    }
    return card;
  }));
  list.append(...cards);
}

async function openTicketScanner(event) {
  scanBusy = false;
  selectedScanEventId = event._id;
  document.querySelector("#scanner-event-title").textContent = `Scan tickets · ${event.title}`;
  const result = document.querySelector("#ticket-scanner-result");
  result.dataset.state = "";
  result.textContent = "Starting camera…";
  document.querySelector("#scan-next-ticket").hidden = true;
  document.querySelector("#stop-ticket-scanner").hidden = false;
  document.querySelector("#ticket-scanner-dialog").showModal();

  if (!("BarcodeDetector" in window)) {
    result.dataset.state = "error";
    result.textContent = "QR scanning is not supported by this browser. Use a recent Chrome browser on a phone or laptop.";
    document.querySelector("#stop-ticket-scanner").hidden = true;
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    result.dataset.state = "error";
    result.textContent = "Camera access requires HTTPS and browser camera permission.";
    document.querySelector("#stop-ticket-scanner").hidden = true;
    return;
  }

  try {
    detector = new BarcodeDetector({ formats: ["qr_code"] });
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    if (!document.querySelector("#ticket-scanner-dialog").open) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      return;
    }
    const video = document.querySelector("#ticket-scanner-video");
    video.srcObject = cameraStream;
    await video.play();
    result.textContent = "Camera ready. Point it at a Gather ticket QR code.";
    scanForTicket();
  } catch (error) {
    result.dataset.state = "error";
    result.textContent = error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in your browser and try again."
      : "Could not open the camera. Check camera permission and try again.";
    stopCamera();
  }
}

function stopCamera() {
  cancelAnimationFrame(scanAnimationFrame);
  scanAnimationFrame = null;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = document.querySelector("#ticket-scanner-video");
  video.pause();
  video.srcObject = null;
}

function scanForTicket() {
  const video = document.querySelector("#ticket-scanner-video");
  const detectNext = async () => {
    if (!cameraStream) return;
    if (!scanBusy && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const [barcode] = await detector.detect(video);
        if (barcode?.rawValue) {
          scanBusy = true;
          await submitTicketScan(barcode.rawValue);
        }
      } catch {
        const result = document.querySelector("#ticket-scanner-result");
        result.dataset.state = "error";
        result.textContent = "Could not read that QR code. Center it in the camera and try scanning again.";
      }
    }
    scanAnimationFrame = requestAnimationFrame(detectNext);
  };
  scanAnimationFrame = requestAnimationFrame(detectNext);
}

async function submitTicketScan(payload) {
  const result = document.querySelector("#ticket-scanner-result");
  try {
    const data = await requestJson(`/api/organizer/events/${encodeURIComponent(selectedScanEventId)}/scan`, {
      method: "POST",
      body: { ticket: payload }
    });
    result.dataset.state = "success";
    result.textContent = `Successful entry · Ticket ${data.ticketNumber} · ${data.eventTitle}`;
  } catch (error) {
    result.dataset.state = "error";
    result.textContent = error.message;
  }
  document.querySelector("#scan-next-ticket").hidden = false;
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
    const { bookings } = await requestJson("/api/account/dashboard");
    await renderAccountBookings(bookings);
    return;
  }
  if (user.role !== "organizer") {
    throw new Error("This dashboard is for organizer accounts. Use the admin console from your account workspace.");
  }

  document.querySelector("#dashboard-subtitle").textContent = "Manage your events, ticket sales, and earnings.";
  const [dashboard, allEvents, accountDashboard] = await Promise.all([
    requestJson("/api/organizer/dashboard"),
    requestJson("/api/organizer/events"),
    requestJson("/api/account/dashboard")
  ]);
  dashboardEvents = allEvents.events;
  const salesById = new Map(dashboard.events.map((event) => [event.id, event]));
  renderMetrics(dashboard.summary);
  renderEvents(dashboardEvents, salesById);
  await renderAccountBookings(accountDashboard.bookings);
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

document.querySelector("#scan-next-ticket").addEventListener("click", () => {
  scanBusy = false;
  document.querySelector("#scan-next-ticket").hidden = true;
  const result = document.querySelector("#ticket-scanner-result");
  result.dataset.state = "";
  result.textContent = "Ready. Scan the next ticket.";
});

document.querySelector("#stop-ticket-scanner").addEventListener("click", () => {
  stopCamera();
  document.querySelector("#ticket-scanner-dialog").close();
});
document.querySelector("#close-scanner-dialog").addEventListener("click", () => {
  stopCamera();
  document.querySelector("#ticket-scanner-dialog").close();
});
document.querySelector("#ticket-scanner-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    stopCamera();
    event.currentTarget.close();
  }
});
document.querySelector("#ticket-scanner-dialog").addEventListener("close", stopCamera);

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
