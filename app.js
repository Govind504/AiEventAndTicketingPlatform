let events = [];

const eventGrid = document.querySelector("#event-grid");
const searchInput = document.querySelector("#event-search");
const sortSelect = document.querySelector("#sort-events");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const dialog = document.querySelector("#ticket-dialog");
const toast = document.querySelector("#toast");
const savedEvents = new Set();
let legacySavedEventIds = [];
try {
  const storedIds = JSON.parse(localStorage.getItem("gather-saved-events") || "[]");
  if (Array.isArray(storedIds)) legacySavedEventIds = storedIds.filter((id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id));
} catch {
  legacySavedEventIds = [];
}
sessionStorage.removeItem("gather-host-token");
let activeCategory = "all";
let savedOnly = false;
let selectedEvent = null;
let quantity = 1;
let toastTimer;
let currentUser = null;

function formatPrice(priceCents, currency = "INR") {
  if (priceCents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2
  }).format(priceCents / 100);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldErrors = Array.isArray(data.fields)
      ? data.fields.map(({ field, message }) => `${field ? `${field}: ` : ""}${message}`).join("; ")
      : "";
    const error = new Error(fieldErrors || data.error || "Request failed. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

window.gatherSetCurrentUser = async (user) => {
  currentUser = user;
  savedEvents.clear();
  if (user) {
    try {
      if (legacySavedEventIds.length) {
        for (const id of legacySavedEventIds) {
          try {
            await requestJson(`/api/account/saved-events/${encodeURIComponent(id)}`, { method: "PUT" });
          } catch (error) {
            if (error.status !== 404) throw error;
          }
        }
        try {
          localStorage.removeItem("gather-saved-events");
        } catch {
          showToast("Saved events were synced, but the old browser copy could not be cleared.");
        }
        legacySavedEventIds = [];
      }
      const data = await requestJson("/api/account/saved-events");
      data.eventIds.forEach((id) => savedEvents.add(id));
    } catch (error) {
      showToast(error.message);
    }
  }
  renderEvents();
};

function filteredEvents() {
  const query = searchInput.value.trim().toLowerCase();
  const results = events.filter((event) => {
    const matchesCategory = activeCategory === "all" || event.category === activeCategory;
    const searchable = `${event.title} ${event.categoryLabel} ${event.venue}`.toLowerCase();
    return matchesCategory && searchable.includes(query) && (!savedOnly || savedEvents.has(event.id));
  });

  if (sortSelect.value === "price-low") results.sort((first, second) => first.priceCents - second.priceCents);
  return results;
}

function renderEvents() {
  const results = filteredEvents();
  resultsCount.textContent = `Showing ${results.length} ${results.length === 1 ? "plan" : "plans"}`;
  emptyState.hidden = results.length > 0;
  emptyState.textContent = savedOnly ? "No saved plans yet. Save an event to keep it here." : "No plans found. Try another search or category.";
  eventGrid.innerHTML = results.map((event, index) => `
    <article class="event-card" style="animation-delay:${Math.min(index * 45, 270)}ms">
      <div class="event-image-wrap">
        <img class="event-image" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.alt)}" loading="lazy">
        <div class="event-date"><span>${escapeHtml(event.date)}</span><small>${escapeHtml(event.month)}</small></div>
        <button class="save-event${savedEvents.has(event.id) ? " saved" : ""}" type="button" data-save-id="${escapeHtml(event.id)}" aria-label="${savedEvents.has(event.id) ? "Unsave" : "Save"} ${escapeHtml(event.title)}" aria-pressed="${savedEvents.has(event.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8Z"/></svg></button>
      </div>
      <div class="event-info">
        <div class="event-topline"><span class="event-category">${escapeHtml(event.categoryLabel)}</span><span>${escapeHtml(event.time.split(",")[0])}</span></div>
        <h3>${escapeHtml(event.title)}</h3>
        <div class="event-meta"><span>${escapeHtml(event.venue)}</span><span>${formatPrice(event.priceCents, event.currency)}</span></div>
        <button class="event-book" type="button" data-book-id="${escapeHtml(event.id)}">Get tickets <span aria-hidden="true">↗</span></button>
      </div>
    </article>`).join("");
}

async function loadEvents() {
  try {
    const data = await requestJson("/api/events");
    events = data.events;
    renderEvents();
  } catch {
    events = [];
    renderEvents();
    emptyState.textContent = "Events could not be loaded. Check the backend connection and refresh.";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
}

function openReservation(event) {
  selectedEvent = event;
  quantity = 1;
  document.querySelector("#dialog-title").textContent = event.title;
  document.querySelector("#dialog-meta").textContent = `${event.time} · ${event.venue}`;
  document.querySelector("#dialog-image").style.backgroundImage = `url("${event.image}")`;
  document.querySelector("#ticket-unit-price").textContent = `${formatPrice(event.priceCents, event.currency)} per person`;
  document.querySelector("#ticket-quantity").textContent = quantity;
  document.querySelector("#reservation-email").value = currentUser?.email || "";
  document.querySelector("#dialog-content").hidden = false;
  document.querySelector("#confirmation").hidden = true;
  updateTotal();
  dialog.showModal();
}

function updateTotal() {
  document.querySelector("#ticket-quantity").textContent = quantity;
  document.querySelector("#reservation-total").textContent = formatPrice((selectedEvent?.priceCents ?? 0) * quantity, selectedEvent?.currency);
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded. Check your internet connection and try again."));
    document.head.append(script);
  });
}

document.querySelectorAll(".category-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll(".category-chip").forEach((chip) => {
      const selected = chip === button;
      chip.classList.toggle("selected", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
    renderEvents();
  });
});

searchInput.addEventListener("input", renderEvents);
sortSelect.addEventListener("change", renderEvents);

document.querySelector(".saved-link").addEventListener("click", (event) => {
  savedOnly = !savedOnly;
  event.currentTarget.setAttribute("aria-pressed", String(savedOnly));
  event.currentTarget.querySelector("span").textContent = savedOnly ? "All events" : "Saved";
  renderEvents();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

eventGrid.addEventListener("click", async (event) => {
  const bookButton = event.target.closest("[data-book-id]");
  if (bookButton) {
    const selected = events.find((item) => item.id === bookButton.dataset.bookId);
    if (selected) openReservation(selected);
    return;
  }

  const saveButton = event.target.closest("[data-save-id]");
  if (!saveButton) return;
  if (!currentUser) {
    showToast("Sign in to save events to your account.");
    document.querySelector("[data-open-account]").click();
    return;
  }
  const id = saveButton.dataset.saveId;
  try {
    if (savedEvents.has(id)) {
      await requestJson(`/api/account/saved-events/${encodeURIComponent(id)}`, { method: "DELETE" });
      savedEvents.delete(id);
      showToast("Removed from your saved plans");
    } else {
      await requestJson(`/api/account/saved-events/${encodeURIComponent(id)}`, { method: "PUT" });
      savedEvents.add(id);
      showToast("Saved to your account");
    }
    renderEvents();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll("[data-event-id]").forEach((button) => {
  button.addEventListener("click", () => {
    const event = events.find((item) => item.id === button.dataset.eventId);
    if (event) openReservation(event);
  });
});

document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

document.querySelectorAll("[data-quantity-change]").forEach((button) => {
  button.addEventListener("click", () => {
    quantity = Math.min(8, Math.max(1, quantity + Number(button.dataset.quantityChange)));
    updateTotal();
  });
});

document.querySelector("#reservation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedEvent) return;
  const button = event.currentTarget.querySelector("button[type='submit']");
  const email = document.querySelector("#reservation-email").value;
  button.disabled = true;
  button.firstChild.textContent = "Opening secure checkout... ";
  try {
    const checkout = await requestJson("/api/checkout/session", {
      method: "POST",
      body: { eventId: selectedEvent.id, email, quantity }
    });
    if (checkout.free) {
      showOrderConfirmation(checkout);
      return;
    }
    await loadRazorpayCheckout();
    const razorpayCheckout = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "Gather",
      description: `${checkout.eventTitle} · ${checkout.quantity} ${checkout.quantity === 1 ? "ticket" : "tickets"}`,
      prefill: { email: checkout.email },
      theme: { color: "#17221c" },
      config: {
        display: {
          blocks: {
            upi: {
              name: "Pay by UPI",
              instruments: [{ method: "upi" }]
            }
          },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true }
        }
      },
      handler: async (payment) => {
        try {
          const confirmed = await requestJson("/api/checkout/verify", {
            method: "POST",
            body: {
              orderId: checkout.orderId,
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_signature: payment.razorpay_signature
            }
          });
          if (confirmed.status !== "paid") throw new Error("Payment is still processing. Check your bookings shortly.");
          showOrderConfirmation(confirmed);
          if (window.GatherAccount && window.GatherDashboardRefresh) await window.GatherDashboardRefresh();
        } catch (error) {
          showToast(error.message);
        }
      },
      modal: {
        ondismiss: () => showToast("Checkout closed. Any held tickets will be released automatically if payment is not completed.")
      }
    });
    razorpayCheckout.on("payment.failed", (payment) => {
      showToast(payment.error?.description || "Razorpay could not complete this payment. Try another test payment method.");
    });
    razorpayCheckout.open();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "Continue to secure checkout ";
  }
});

document.querySelector(".done-button").addEventListener("click", () => dialog.close());

function showOrderConfirmation(order) {
  document.querySelector("#confirmation h2").textContent = "You're on the list.";
  const ticketNoun = order.quantity === 1 ? "ticket" : "tickets";
  const verb = order.quantity === 1 ? "is" : "are";
  document.querySelector("#confirmation-copy").textContent = `${order.quantity} ${ticketNoun} for ${order.eventTitle} ${verb} confirmed. Ticket code: ${order.ticketCode}.`;
  document.querySelector("#dialog-content").hidden = true;
  document.querySelector("#confirmation").hidden = false;
  dialog.showModal();
}

window.gatherRefreshEvents = loadEvents;

loadEvents();