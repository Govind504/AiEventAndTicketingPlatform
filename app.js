let events = [];

const eventGrid = document.querySelector("#event-grid");
const searchInput = document.querySelector("#event-search");
const sortSelect = document.querySelector("#sort-events");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const dialog = document.querySelector("#ticket-dialog");
const locationDialog = document.querySelector("#location-dialog");
const locationForm = document.querySelector("#location-form");
const locationSearch = document.querySelector("#location-search");
const currentLocationButton = document.querySelector("#current-location-button");
const currentLocationButtonLabel = currentLocationButton.querySelector("span:not(.location-action-arrow)");
const locationSuggestions = document.querySelector("#location-suggestions");
const locationSearchStatus = document.querySelector("#location-search-status");
const locationMapPreview = document.querySelector("#location-map-preview");
const useLocationButton = document.querySelector("#use-location-button");
const hero = document.querySelector(".hero");
const heroImage = document.querySelector(".hero-image");
const heroFeatureTitle = document.querySelector("#hero-feature-title");
const heroFeatureCopy = document.querySelector("#hero-feature-copy");
const heroFeatureAction = document.querySelector("#hero-feature-action");
const heroIndex = document.querySelector("#hero-index");
const heroDots = document.querySelector("#hero-carousel-dots");
const heroPrevious = document.querySelector("#hero-previous");
const heroNext = document.querySelector("#hero-next");
const heroToggle = document.querySelector("#hero-carousel-toggle");
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
let selectedEvent = null;
let quantity = 1;
let toastTimer;
let currentUser = null;
let heroSlides = [];
let activeHeroSlide = 0;
let heroTimer;
let heroPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let heroHoverPaused = false;
let heroFocusPaused = false;
let currentLocation = { city: "Chandigarh", state: "Chandigarh" };
window.gatherLocation = currentLocation;
let locationSearchTimer;
let locationSearchController;
let locationSearchRequestId = 0;
let currentLocationRequestId = 0;
let reverseGeocodeController;
const locationSearchCache = new Map();
const usStateCodes = new Map([
  ["alabama", "AL"], ["alaska", "AK"], ["arizona", "AZ"], ["arkansas", "AR"], ["california", "CA"],
  ["colorado", "CO"], ["connecticut", "CT"], ["delaware", "DE"], ["florida", "FL"], ["georgia", "GA"],
  ["hawaii", "HI"], ["idaho", "ID"], ["illinois", "IL"], ["indiana", "IN"], ["iowa", "IA"],
  ["kansas", "KS"], ["kentucky", "KY"], ["louisiana", "LA"], ["maine", "ME"], ["maryland", "MD"],
  ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"], ["mississippi", "MS"], ["missouri", "MO"],
  ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"], ["new hampshire", "NH"], ["new jersey", "NJ"],
  ["new mexico", "NM"], ["new york", "NY"], ["north carolina", "NC"], ["north dakota", "ND"], ["ohio", "OH"],
  ["oklahoma", "OK"], ["oregon", "OR"], ["pennsylvania", "PA"], ["rhode island", "RI"], ["south carolina", "SC"],
  ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"], ["utah", "UT"], ["vermont", "VT"],
  ["virginia", "VA"], ["washington", "WA"], ["west virginia", "WV"], ["wisconsin", "WI"], ["wyoming", "WY"]
]);
let selectedLocationPlace = null;
try {
  const savedLocation = JSON.parse(localStorage.getItem("gather-location") || "null");
  if (savedLocation && typeof savedLocation.city === "string" && savedLocation.city.trim()) {
    currentLocation = {
      city: savedLocation.city.trim().slice(0, 80),
      state: typeof savedLocation.state === "string" ? savedLocation.state.trim().slice(0, 40) : ""
    };
    if (currentLocation.city.toLowerCase() === "portland" && currentLocation.state.toUpperCase() === "OR") {
      currentLocation = { city: "Chandigarh", state: "Chandigarh" };
      localStorage.setItem("gather-location", JSON.stringify(currentLocation));
    }
  }
} catch {
  currentLocation = { city: "Chandigarh", state: "Chandigarh" };
}
window.gatherLocation = currentLocation;

function renderCurrentLocation() {
  const label = currentLocation.state && currentLocation.state.toLowerCase() !== currentLocation.city.toLowerCase()
    ? `${currentLocation.city}, ${currentLocation.state}`
    : currentLocation.city;
  document.querySelector("#current-location-label").textContent = label;
  document.querySelector("#location-picker-button").setAttribute("aria-label", `Change event location. Current location: ${label}`);
}

function updateHeroToggle() {
  heroToggle.setAttribute("aria-pressed", String(heroPaused));
  heroToggle.setAttribute("aria-label", heroPaused ? "Resume automatic featured events" : "Pause automatic featured events");
  heroToggle.textContent = heroPaused ? "▶" : "Ⅱ";
}

function placeCity(address) {
  return address.city || address.town || address.village || address.municipality || address.hamlet || address.locality || "";
}

function placeState(address) {
  const state = address.state || address.region || "";
  if (address.country_code?.toLowerCase() === "us") return usStateCodes.get(state.toLowerCase()) || state;
  return state;
}

function renderLocationSuggestions(places) {
  locationSuggestions.replaceChildren();

  for (const place of places) {
    const item = document.createElement("li");
    const option = document.createElement("button");
    const city = placeCity(place.address || {});
    const state = placeState(place.address || {});
    option.type = "button";
    option.className = "location-suggestion";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = city
      ? place.display_name
      : `${place.display_name} · Select a result that includes a city to filter events`;
    option.disabled = !city;
    option.addEventListener("click", () => previewLocation(place, option));
    item.append(option);
    locationSuggestions.append(item);
  }
  if (places.length) previewLocation(places[0], locationSuggestions.querySelector(".location-suggestion"));
  else clearLocationPreview();
}

function mapBounds(place) {
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  let [south, north, west, east] = Array.isArray(place.boundingbox)
    ? place.boundingbox.map(Number)
    : [];
  if (![south, north, west, east].every(Number.isFinite)
    || south < -90 || north > 90 || west < -180 || east > 180
    || south > north || west > east) {
    south = latitude - 0.03;
    north = latitude + 0.03;
    west = longitude - 0.03;
    east = longitude + 0.03;
  }

  const minLatitudeSpan = 0.008;
  const minLongitudeSpan = 0.008;
  if (north - south < minLatitudeSpan) {
    south = Math.max(-90, latitude - minLatitudeSpan / 2);
    north = Math.min(90, latitude + minLatitudeSpan / 2);
  }
  if (east - west < minLongitudeSpan) {
    west = Math.max(-180, longitude - minLongitudeSpan / 2);
    east = Math.min(180, longitude + minLongitudeSpan / 2);
  }
  return { latitude, longitude, south, north, west, east };
}

function clearLocationPreview() {
  selectedLocationPlace = null;
  locationMapPreview.removeAttribute("src");
  locationMapPreview.hidden = true;
  useLocationButton.hidden = true;
}

function previewLocation(place, selectedOption) {
  const bounds = mapBounds(place);
  if (!bounds || !placeCity(place.address || {})) {
    clearLocationPreview();
    return;
  }
  selectedLocationPlace = place;
  locationSuggestions.querySelectorAll(".location-suggestion").forEach((option) => {
    option.setAttribute("aria-selected", String(option === selectedOption));
  });
  const mapUrl = new URL("https://www.openstreetmap.org/export/embed.html");
  mapUrl.searchParams.set("bbox", `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
  mapUrl.searchParams.set("layer", "mapnik");
  mapUrl.searchParams.set("marker", `${bounds.latitude},${bounds.longitude}`);
  locationMapPreview.src = mapUrl.href;
  locationMapPreview.title = `Map preview for ${place.display_name}`;
  locationMapPreview.hidden = false;
  useLocationButton.hidden = false;
}

function searchLocations(value) {
  cancelCurrentLocationRequest();
  window.clearTimeout(locationSearchTimer);
  locationSearchController?.abort();
  locationSearchController = null;
  locationSuggestions.replaceChildren();
  clearLocationPreview();
  const query = value.trim();
  const requestId = ++locationSearchRequestId;
  if (query.length < 3) {
    locationSearchStatus.textContent = "Enter at least 3 characters to search.";
    return;
  }

  locationSearchStatus.textContent = "Searching addresses…";
  locationSearchTimer = window.setTimeout(async () => {
    const cacheKey = query.toLowerCase();
    if (locationSearchCache.has(cacheKey)) {
      const places = locationSearchCache.get(cacheKey);
      renderLocationSuggestions(places);
      locationSearchStatus.textContent = places.length
        ? "Choose an address to see events in that city."
        : "No matching addresses found. Try another search.";
      return;
    }

    const controller = new AbortController();
    locationSearchController = controller;
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        limit: "5",
        q: query
      });
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Address search is temporarily unavailable.");
      const places = await response.json();
      if (requestId !== locationSearchRequestId) return;
      locationSearchCache.set(cacheKey, places);
      renderLocationSuggestions(places);
      locationSearchStatus.textContent = places.length
        ? "Choose an address to see events in that city."
        : "No matching addresses found. Try another search.";
    } catch (error) {
      if (error.name === "AbortError" || requestId !== locationSearchRequestId) return;
      locationSearchStatus.textContent = error.message || "Address search failed. Please try again.";
    }
  }, 1100);
}

function cancelCurrentLocationRequest() {
  currentLocationRequestId += 1;
  reverseGeocodeController?.abort();
  reverseGeocodeController = null;
  currentLocationButton.disabled = false;
  currentLocationButtonLabel.textContent = "Use my current location";
  currentLocationButton.setAttribute("aria-busy", "false");
}

function geolocationErrorMessage(error) {
  if (error.code === 1) return "Location permission was denied. Allow location access in your browser or search for an address.";
  if (error.code === 2) return "Your location is unavailable. Check your device settings or search for an address.";
  if (error.code === 3) return "Finding your location timed out. Please try again or search for an address.";
  return "Could not get your location. Please try again or search for an address.";
}

async function useCurrentLocation() {
  cancelCurrentLocationRequest();
  window.clearTimeout(locationSearchTimer);
  locationSearchController?.abort();
  locationSearchController = null;
  locationSearchRequestId += 1;
  locationSuggestions.replaceChildren();
  clearLocationPreview();

  if (!navigator.geolocation) {
    locationSearchStatus.textContent = "Location is not supported by this browser. Search for an address instead.";
    return;
  }

  const requestId = ++currentLocationRequestId;
  currentLocationButton.disabled = true;
  currentLocationButtonLabel.textContent = "Finding your location…";
  currentLocationButton.setAttribute("aria-busy", "true");
  locationSearchStatus.textContent = "Allow location access when your browser asks.";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 10000
      });
    });
    if (requestId !== currentLocationRequestId || !locationDialog.open) return;

    const controller = new AbortController();
    reverseGeocodeController = controller;
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      lat: String(position.coords.latitude),
      lon: String(position.coords.longitude)
    });
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Location lookup is temporarily unavailable.");
    const place = await response.json();
    if (requestId !== currentLocationRequestId || !locationDialog.open) return;
    if (!placeCity(place.address || {})) {
      locationSearchStatus.textContent = "Could not identify a city near you. Search for an address instead.";
      return;
    }

    locationSearch.value = place.display_name;
    renderLocationSuggestions([place]);
    locationSearchStatus.textContent = "Current location found. Choose Use this location to see events nearby.";
  } catch (error) {
    if (error.name === "AbortError" || requestId !== currentLocationRequestId) return;
    locationSearchStatus.textContent = typeof error.code === "number"
      ? geolocationErrorMessage(error)
      : "Could not look up your location. Please try again or search for an address.";
  } finally {
    if (requestId === currentLocationRequestId) {
      currentLocationButton.disabled = false;
      currentLocationButtonLabel.textContent = "Use my current location";
      currentLocationButton.setAttribute("aria-busy", "false");
      reverseGeocodeController = null;
    }
  }
}

async function selectLocation(city, state) {
  if (!city) return;
  currentLocation = { city, state };
  window.gatherLocation = currentLocation;
  try {
    localStorage.setItem("gather-location", JSON.stringify(currentLocation));
  } catch {
    showToast("Location updated for this visit, but could not be saved in this browser.");
  }
  renderCurrentLocation();
  locationDialog.close();
  await loadEvents();
  if (window.gatherRefreshCatalog) await window.gatherRefreshCatalog();
  document.querySelector("#events").scrollIntoView({ behavior: "smooth" });
}

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
  const profileButton = document.querySelector(".profile-button");
  const profileIcon = profileButton.querySelector(".profile-icon");
  const profileInitial = profileButton.querySelector(".profile-initial");
  if (user) {
    profileIcon.hidden = true;
    profileInitial.hidden = false;
    profileInitial.textContent = user.name.trim().charAt(0).toLocaleUpperCase();
    profileButton.setAttribute("aria-label", `Open ${user.name}'s Gather account`);
  } else {
    profileIcon.hidden = false;
    profileInitial.hidden = true;
    profileInitial.textContent = "";
    profileButton.setAttribute("aria-label", "Sign in to your Gather account");
  }
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
    return matchesCategory && searchable.includes(query);
  });

  if (sortSelect.value === "price-low") results.sort((first, second) => first.priceCents - second.priceCents);
  return results;
}

function renderEvents() {
  const results = filteredEvents();
  document.querySelector('.category-chip[data-category="all"] span').textContent = String(events.length).padStart(2, "0");
  resultsCount.textContent = `Showing ${results.length} ${results.length === 1 ? "plan" : "plans"}`;
  emptyState.hidden = results.length > 0;
  emptyState.textContent = `No events found in ${currentLocation.city}. Try changing your location or search.`;
  eventGrid.innerHTML = results.map((event, index) => {
    const mapUrl = new URL("https://www.google.com/maps/search/");
    mapUrl.searchParams.set("api", "1");
    mapUrl.searchParams.set("query", event.address || `${event.venue}, ${event.city}, ${event.state}`);
    return `
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
        <a class="event-map" href="${escapeHtml(mapUrl.href)}" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a>
        <button class="event-book" type="button" data-book-id="${escapeHtml(event.id)}">Get tickets <span aria-hidden="true">↗</span></button>
      </div>
    </article>`;
  }).join("");
}

function renderHeroSlide(index) {
  if (!heroSlides.length) return;
  activeHeroSlide = (index + heroSlides.length) % heroSlides.length;
  const slide = heroSlides[activeHeroSlide];
  hero.classList.add("hero-changing");
  window.setTimeout(() => {
    heroImage.src = slide.image;
    heroImage.alt = slide.alt || `Photo for ${slide.title}`;
    heroFeatureTitle.textContent = slide.title;
    heroFeatureCopy.textContent = slide.copy;
    heroFeatureAction.setAttribute("aria-label", `Get tickets for ${slide.title}`);
    heroFeatureAction.dataset.eventId = slide.id;
    heroIndex.textContent = `${String(activeHeroSlide + 1).padStart(2, "0")} / ${String(heroSlides.length).padStart(2, "0")}`;
    heroDots.querySelectorAll("button").forEach((dot, dotIndex) => {
      const isActive = dotIndex === activeHeroSlide;
      dot.classList.toggle("selected", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });
    hero.classList.remove("hero-changing");
  }, 180);
}

function setHeroSlides(eventList) {
  heroSlides = eventList.slice(0, 6).map((event) => ({
    id: event.id,
    image: event.image,
    alt: event.alt,
    title: event.title,
    copy: `${event.categoryLabel} · ${event.venue}`
  }));
  heroDots.replaceChildren(...heroSlides.map((slide, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "hero-carousel-dot";
    dot.setAttribute("aria-label", `Show featured event ${index + 1}: ${slide.title}`);
    dot.setAttribute("aria-pressed", "false");
    dot.addEventListener("click", () => {
      renderHeroSlide(index);
      restartHeroTimer();
    });
    return dot;
  }));

  const hasMultipleSlides = heroSlides.length > 1;
  heroPrevious.hidden = !hasMultipleSlides;
  heroNext.hidden = !hasMultipleSlides;
  heroToggle.hidden = !hasMultipleSlides;
  document.querySelector("#hero-feature").hidden = heroSlides.length === 0;
  if (!heroSlides.length) {
    heroDots.replaceChildren();
    heroIndex.hidden = true;
    clearInterval(heroTimer);
    return;
  }
  heroIndex.hidden = false;
  renderHeroSlide(0);
  restartHeroTimer();
}

function restartHeroTimer() {
  clearInterval(heroTimer);
  if (heroPaused || heroHoverPaused || heroFocusPaused || document.hidden || heroSlides.length < 2) return;
  heroTimer = window.setInterval(() => renderHeroSlide(activeHeroSlide + 1), 6500);
}

async function loadEvents() {
  try {
    const query = new URLSearchParams({ city: currentLocation.city });
    if (currentLocation.state) query.set("state", currentLocation.state);
    const data = await requestJson(`/api/events?${query}`);
    events = data.events;
    renderEvents();
    setHeroSlides(events);
  } catch {
    events = [];
    renderEvents();
    setHeroSlides(events);
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

heroPrevious.addEventListener("click", () => {
  renderHeroSlide(activeHeroSlide - 1);
  restartHeroTimer();
});
heroNext.addEventListener("click", () => {
  renderHeroSlide(activeHeroSlide + 1);
  restartHeroTimer();
});
heroToggle.addEventListener("click", () => {
  heroPaused = !heroPaused;
  updateHeroToggle();
  restartHeroTimer();
});
hero.addEventListener("mouseenter", () => {
  heroHoverPaused = true;
  clearInterval(heroTimer);
});
hero.addEventListener("mouseleave", () => {
  heroHoverPaused = false;
  restartHeroTimer();
});
hero.addEventListener("focusin", () => {
  heroFocusPaused = true;
  clearInterval(heroTimer);
});
hero.addEventListener("focusout", (event) => {
  if (!hero.contains(event.relatedTarget)) {
    heroFocusPaused = false;
    restartHeroTimer();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInterval(heroTimer);
  else restartHeroTimer();
});
updateHeroToggle();
document.querySelector("#hero-feature-action").addEventListener("click", (event) => {
  const selected = events.find((item) => item.id === event.currentTarget.dataset.eventId);
  if (selected) openReservation(selected);
});

document.querySelector("#location-picker-button").addEventListener("click", () => {
  locationSearch.value = "";
  locationSuggestions.replaceChildren();
  clearLocationPreview();
  locationSearchStatus.textContent = `Search an address; your current location is ${currentLocation.city}${currentLocation.state ? `, ${currentLocation.state}` : ""}.`;
  locationDialog.showModal();
  locationSearch.focus();
});
document.querySelector("#close-location-dialog").addEventListener("click", () => locationDialog.close());
locationDialog.addEventListener("click", (event) => {
  if (event.target === locationDialog) locationDialog.close();
});
locationDialog.addEventListener("close", () => {
  cancelCurrentLocationRequest();
  window.clearTimeout(locationSearchTimer);
  locationSearchController?.abort();
});
locationSearch.addEventListener("input", () => searchLocations(locationSearch.value));
currentLocationButton.addEventListener("click", useCurrentLocation);
locationForm.addEventListener("submit", (event) => event.preventDefault());
useLocationButton.addEventListener("click", () => {
  if (!selectedLocationPlace) return;
  selectLocation(
    placeCity(selectedLocationPlace.address || {}),
    placeState(selectedLocationPlace.address || {})
  );
});

searchInput.addEventListener("input", renderEvents);
sortSelect.addEventListener("change", renderEvents);

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
    window.location.href = "/?signin=1&returnTo=%2Fdashboard";
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
  document.querySelector("#confirmation-copy").textContent = `${order.quantity} ${ticketNoun} for ${order.eventTitle} ${verb} confirmed. Each ticket has its own single-use QR code.`;
  const qrList = document.querySelector("#ticket-qr-list");
  qrList.replaceChildren();
  for (const ticket of order.tickets || []) {
    const card = document.createElement("article");
    card.className = "ticket-qr-card";
    const image = document.createElement("img");
    image.src = ticket.qrCode;
    image.alt = `QR code for ticket ${ticket.number}`;
    const label = document.createElement("strong");
    label.textContent = `Ticket ${ticket.number}`;
    card.append(image, label);
    qrList.append(card);
  }
  if (!order.tickets?.length) {
    document.querySelector("#confirmation-copy").textContent += " QR codes could not be created; please contact the event organizer.";
  }
  document.querySelector("#dialog-content").hidden = true;
  document.querySelector("#confirmation").hidden = false;
  dialog.showModal();
}

window.gatherRefreshEvents = loadEvents;

renderCurrentLocation();
loadEvents();