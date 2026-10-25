(() => {
  const cache = new Map();
  const stateCodes = new Map([
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

  function locationFor(place) {
    const address = place.address || {};
    const city = address.city || address.town || address.village || address.municipality
      || address.hamlet || address.locality || "";
    const rawState = address.state || address.region || address.country || "";
    const state = address.country_code?.toLowerCase() === "us"
      ? stateCodes.get(rawState.toLowerCase()) || rawState
      : rawState;
    return { city, state };
  }

  function boundsFor(place) {
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
    if (north - south < 0.008) {
      south = Math.max(-90, latitude - 0.004);
      north = Math.min(90, latitude + 0.004);
    }
    if (east - west < 0.008) {
      west = Math.max(-180, longitude - 0.004);
      east = Math.min(180, longitude + 0.004);
    }
    return { latitude, longitude, south, north, west, east };
  }

  function attach({ input, status, suggestions, map, selectButton, buttonLabel = "Use this address", onSelect }) {
    let selectedPlace = null;
    let timer;
    let controller;
    let requestId = 0;

    selectButton.textContent = buttonLabel;

    function clearPreview() {
      selectedPlace = null;
      map.removeAttribute("src");
      map.hidden = true;
      selectButton.hidden = true;
    }

    function preview(place, selectedOption) {
      const location = locationFor(place);
      const bounds = boundsFor(place);
      if (!location.city || !bounds) {
        clearPreview();
        status.textContent = "Choose a result that includes a city and map location.";
        return;
      }
      selectedPlace = place;
      suggestions.querySelectorAll(".location-suggestion").forEach((option) => {
        option.setAttribute("aria-selected", String(option === selectedOption));
      });
      const mapUrl = new URL("https://www.openstreetmap.org/export/embed.html");
      mapUrl.searchParams.set("bbox", `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
      mapUrl.searchParams.set("layer", "mapnik");
      mapUrl.searchParams.set("marker", `${bounds.latitude},${bounds.longitude}`);
      map.src = mapUrl.href;
      map.title = `Map preview for ${place.display_name}`;
      map.hidden = false;
      selectButton.hidden = false;
      status.textContent = place.display_name;
    }

    function render(places) {
      suggestions.replaceChildren();
      if (!places.length) {
        clearPreview();
        status.textContent = "No matching addresses found. Try another search.";
        return;
      }
      for (const place of places) {
        const location = locationFor(place);
        const item = document.createElement("li");
        const option = document.createElement("button");
        option.type = "button";
        option.className = "location-suggestion";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.textContent = location.city
          ? place.display_name
          : `${place.display_name} · Choose a result with a city`;
        option.disabled = !location.city;
        option.addEventListener("click", () => preview(place, option));
        item.append(option);
        suggestions.append(item);
      }
      preview(places[0], suggestions.querySelector(".location-suggestion"));
    }

    function search(query) {
      window.clearTimeout(timer);
      controller?.abort();
      controller = null;
      suggestions.replaceChildren();
      clearPreview();
      const value = query.trim();
      const currentRequestId = ++requestId;
      if (value.length < 3) {
        status.textContent = "Enter at least 3 characters to search.";
        return;
      }

      status.textContent = "Searching addresses…";
      timer = window.setTimeout(async () => {
        const cacheKey = value.toLowerCase();
        if (cache.has(cacheKey)) {
          render(cache.get(cacheKey));
          return;
        }

        const searchController = new AbortController();
        controller = searchController;
        try {
          const url = new URL("https://nominatim.openstreetmap.org/search");
          url.search = new URLSearchParams({
            format: "jsonv2",
            addressdetails: "1",
            limit: "5",
            q: value
          });
          const response = await fetch(url, {
            signal: searchController.signal,
            headers: { Accept: "application/json" }
          });
          if (!response.ok) throw new Error("Address search is temporarily unavailable.");
          const places = await response.json();
          if (currentRequestId !== requestId) return;
          cache.set(cacheKey, places);
          render(places);
        } catch (error) {
          if (error.name === "AbortError" || currentRequestId !== requestId) return;
          status.textContent = error.message || "Address search failed. Please try again.";
        }
      }, 1100);
    }

    input.addEventListener("input", () => search(input.value));
    selectButton.addEventListener("click", () => {
      if (!selectedPlace) return;
      onSelect(selectedPlace, locationFor(selectedPlace));
    });

    return {
      clear() {
        window.clearTimeout(timer);
        controller?.abort();
        input.value = "";
        suggestions.replaceChildren();
        clearPreview();
        status.textContent = "Search for an address, then choose a suggestion.";
      },
      setAddress(address) {
        input.value = address || "";
        suggestions.replaceChildren();
        clearPreview();
        status.textContent = address ? "Search again to preview or change this address." : "Search for an address, then choose a suggestion.";
      }
    };
  }

  window.GatherAddressSearch = { attach };
})();
