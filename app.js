"use strict"

const APP_VERSION = "1.1.0"

// --- SVG icons ---

const SVG_WALK = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M8 1.5a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM6.2 4L4.5 6.5l1.3.7L7 6h.5l1 1.5 2 1-.5 1-1.5-.8-1.8-2.5-.8.8V9L7.5 11l-.8.8L5 9V6.5L3.5 8.5l-.8-.6L5 4.5c.3-.3.7-.5 1.2-.5z"/></svg>'
const SVG_SUBWAY = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M4 1h6a2 2 0 012 2v6a2 2 0 01-2 2l1.5 2h-1.2L9 11H5l-1.3 2H2.5L4 11a2 2 0 01-2-2V3a2 2 0 012-2zm0 1.5v3h2.5v-3H4zm3.5 0v3H10v-3H7.5zM5 8a.8.8 0 100 1.6A.8.8 0 005 8zm4 0a.8.8 0 100 1.6A.8.8 0 009 8z"/></svg>'
const SVG_CAR = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2h7l1.5 4v5a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5V10.5h-6V11a.5.5 0 01-.5.5h-1A.5.5 0 012 11V6l1.5-4zm.3 1.5L3 6h8l-.8-2.5H3.8zM4 7.5a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z"/></svg>'

// --- DOM helper ---

function el(tag, attrs, ...children) {
  const node = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v
      else if (k === "innerHTML") node.innerHTML = v
      else if (k.startsWith("on")) node[k.toLowerCase()] = v
      else node.setAttribute(k, v)
    }
  }
  for (const c of children) {
    if (c == null) continue
    node.append(typeof c === "string" ? document.createTextNode(c) : c)
  }
  return node
}

// --- State ---

const STORAGE_KEY = "nyc-trip-state"

let data
let state = { day: 0, stop: 0, swaps: {}, done: {} }
let hourlyWeather = null
let travelTimes = {}
let travelRenderTimer = null
let swapTarget = null // index of stop being swapped

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved) {
      state.day = saved.day ?? 0
      state.stop = saved.stop ?? 0
      state.swaps = saved.swaps ?? {}
      state.done = saved.done ?? {}
    }
  } catch (e) { /* ignore */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function autoSelectToday() {
  const now = new Date()
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0")
  const idx = data.days.findIndex(d => d.date === today)
  if (idx >= 0) state.day = idx
}

function clampState() {
  state.day = Math.max(0, Math.min(state.day, data.days.length - 1))
  const stops = data.days[state.day].stops
  state.stop = Math.max(0, Math.min(state.stop, stops.length - 1))
}

// --- Get effective stop (with swap applied) ---

function getStop(dayIndex, stopIndex) {
  const key = dayIndex + "-" + stopIndex
  const swapIdx = state.swaps[key]
  if (swapIdx != null && data.backups[swapIdx]) {
    return data.backups[swapIdx]
  }
  return data.days[dayIndex].stops[stopIndex]
}

function isSwapped(dayIndex, stopIndex) {
  return state.swaps[dayIndex + "-" + stopIndex] != null
}

// --- Theme ---

function getTheme() {
  return localStorage.getItem("nyc-theme") || "system"
}

function setTheme(theme) {
  localStorage.setItem("nyc-theme", theme)
  applyTheme()
  document.getElementById("themeLight").classList.toggle("active", theme === "light")
  document.getElementById("themeDark").classList.toggle("active", theme === "dark")
  document.getElementById("themeSystem").classList.toggle("active", theme === "system")
}

function applyTheme() {
  const pref = getTheme()
  let dark
  if (pref === "dark") dark = true
  else if (pref === "light") dark = false
  else dark = window.matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
}

// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getTheme() === "system") applyTheme()
})

// --- Data loading ---

fetch("data.json")
  .then(r => r.json())
  .then(d => {
    data = d
    loadState()
    autoSelectToday()
    clampState()
    applyTheme()
    if (!localStorage.getItem("nyc-gmaps-key")) {
      localStorage.setItem("nyc-gmaps-key", "AIzaSyBql5cJfu7zX3___6-jB6TlXvCLOAvxYKo")
    }
    loadWeather()
    render()
  })
  .catch(() => {
    document.getElementById("stops").append(
      el("div", { className: "stop" }, "Failed to load trip data. Please refresh.")
    )
  })

// --- Weather ---

function getTempUnit() {
  return localStorage.getItem("nyc-temp-unit") || "fahrenheit"
}

function setTempUnit(unit) {
  localStorage.setItem("nyc-temp-unit", unit)
  document.getElementById("tempC").classList.toggle("active", unit === "celsius")
  document.getElementById("tempF").classList.toggle("active", unit === "fahrenheit")
  loadWeather()
}

function loadWeather() {
  const day = data.days[state.day]
  hourlyWeather = null
  const tempUnit = getTempUnit()
  const unitParam = tempUnit === "fahrenheit" ? "&temperature_unit=fahrenheit" : ""
  fetch("https://api.open-meteo.com/v1/forecast?latitude=40.72&longitude=-74.00&hourly=temperature_2m,precipitation_probability,weather_code&start_date=" + day.date + "&end_date=" + day.date + unitParam)
    .then(r => r.json())
    .then(w => {
      hourlyWeather = w.hourly
      render()
    })
    .catch(() => { hourlyWeather = null })
}

function getStopHour(stopIndex, totalStops) {
  return Math.round(9 + (stopIndex * 12 / Math.max(totalStops - 1, 1)))
}

function weatherIcon(code) {
  if (code == null) return ""
  if (code === 0) return "☀️"
  if (code <= 3) return "⛅"
  if (code <= 48) return "🌫"
  if (code <= 67) return "🌧"
  if (code <= 77) return "❄️"
  if (code <= 82) return "🌦"
  return "⛈"
}

// --- Carousel ---

function renderCarousel() {
  const container = document.getElementById("dayCarousel")
  const items = data.days.map((d, i) => {
    const date = new Date(d.date + "T12:00:00")
    const label = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
    const cls = "dayItem" + (i === state.day ? " active" : "")
    return el("div", { className: cls, role: "tab", "aria-selected": i === state.day ? "true" : "false", onclick: () => goDay(i) }, label)
  })
  container.replaceChildren(...items)

  if (items[state.day]) {
    const active = items[state.day]
    requestAnimationFrame(() => {
      const offset = active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2
      container.scrollTo({ left: offset, behavior: "smooth" })
    })
  }
}

function goDay(i) {
  state.day = i
  state.stop = 0
  loadWeather()
  render()
}

// --- Hotel ---

function getHotel(date) {
  let hotel = data.hotels[0]
  data.hotels.forEach(h => {
    if (date >= h.from) hotel = h
  })
  return hotel
}

// --- Stop card ---

function isDone(dayIndex, stopIndex) {
  return state.done[dayIndex + "-" + stopIndex] === true
}

function toggleDone(dayIndex, stopIndex) {
  const key = dayIndex + "-" + stopIndex
  if (state.done[key]) delete state.done[key]
  else state.done[key] = true
  render()
}

function stopCard(stop, i, dayIndex) {
  const active = i === state.stop ? " active" : ""
  const reserved = stop.type === "reserved"
  const swapped = isSwapped(dayIndex, i)
  const done = isDone(dayIndex, i)
  const cls = "stop" + active + (reserved ? " reserved" : " flexible") + (done ? " done" : "")

  const checkBtn = el("button", {
    className: "doneBtn" + (done ? " checked" : ""),
    "aria-label": done ? "Mark not done" : "Mark done",
    onclick: (e) => { e.stopPropagation(); toggleDone(dayIndex, i) }
  }, done ? "✓" : (i + 1).toString().padStart(2, "0"))

  const header = el("div", { className: "stopHeader" },
    checkBtn,
    el("b", null, (stop.icon || "") + " " + stop.name)
  )

  const badge = reserved && stop.time
    ? el("span", { className: "timeBadge" }, stop.time)
    : null

  const swapBtn = !reserved
    ? el("button", {
        className: "swapBtn",
        "aria-label": "Swap this stop",
        onclick: (e) => { e.stopPropagation(); openSwap(i) }
      }, "↻")
    : null

  const topRow = el("div", { className: "stopTop" },
    header,
    badge,
    swapBtn
  )

  const addr = el("a", {
    className: "stopAddr",
    href: "https://www.google.com/maps/search/" + encodeURIComponent(stop.name + ", " + stop.address),
    target: "_blank",
    onclick: (e) => e.stopPropagation()
  }, stop.address)

  const restore = swapped
    ? el("div", {
        className: "restoreLink",
        onclick: (e) => { e.stopPropagation(); restoreStop(dayIndex, i) }
      }, "↩ Restore original")
    : null

  const note = stop.note
    ? el("div", { className: "stopNote" }, stop.note)
    : null

  const content = el("div", { className: "stopContent" }, topRow, addr, note, restore)

  let wthr = null
  if (hourlyWeather) {
    const hour = stop.time ? parseInt(stop.time.split(":")[0], 10) : getStopHour(i, data.days[dayIndex].stops.length)
    const temp = Math.round(hourlyWeather.temperature_2m[hour])
    const rain = hourlyWeather.precipitation_probability[hour]
    const icon = weatherIcon(hourlyWeather.weather_code[hour])
    const unitLabel = getTempUnit() === "fahrenheit" ? "°F" : "°C"
    wthr = el("div", { className: "weatherBadge" },
      el("div", { className: "weatherIcon" }, icon),
      el("div", { className: "weatherTemp" }, temp + unitLabel),
      el("div", { className: "weatherRain" }, "💧" + rain + "%")
    )
  } else {
    wthr = el("div", { className: "weatherSkeleton" })
  }

  return el("div", { className: cls, onclick: () => setStop(i) },
    content, wthr
  )
}

// --- Route overview card ---

function routeCard(dayIndex) {
  const day = data.days[dayIndex]
  const stops = day.stops.map((s, i) => getStop(dayIndex, i))
  const hotel = getHotel(day.date)

  const origin = encodeURIComponent(hotel.address)
  const dest = encodeURIComponent(hotel.address)
  const waypoints = stops.map(s => encodeURIComponent(s.address)).join("|")
  const mapsUrl = "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest + "&waypoints=" + waypoints + "&travelmode=walking"

  const apiKey = localStorage.getItem("nyc-gmaps-key")

  let mapContent
  if (apiKey) {
    const embedUrl = "https://www.google.com/maps/embed/v1/directions?key=" + apiKey
      + "&origin=" + origin
      + "&destination=" + dest
      + "&waypoints=" + stops.map(s => encodeURIComponent(s.address)).join("|")
      + "&mode=walking"
    const skeleton = el("div", { className: "mapSkeleton" }, "Loading map…")
    const iframe = el("iframe", {
      className: "routeMapEmbed",
      src: embedUrl,
      loading: "lazy",
      referrerpolicy: "no-referrer",
      "aria-hidden": "true",
      onload: () => skeleton.classList.add("loaded")
    })
    mapContent = el("div", { className: "routeMapWrap" }, skeleton, iframe)
  } else {
    const placeholder = el("div", { className: "routeMapPlaceholder" },
      el("span", null, "🗺"),
      el("span", null, stops.length + " stops · " + day.title)
    )
    mapContent = el("div", { className: "routeMapWrap" }, placeholder)
  }

  return el("div", { className: "routeCard" },
    mapContent,
    el("a", { className: "routeCardLabel", href: mapsUrl, target: "_blank" }, "Open day route ›")
  )
}

// --- Hotel row ---

function hotelRow(name) {
  return el("div", { className: "stop hotel" }, "🏨 " + name)
}

// --- Travel row (SVG icons) ---

function travelRow(a, b, travelKey) {
  const origin = encodeURIComponent(a.address)
  const dest = encodeURIComponent(b.address)
  const mapsBase = "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest
  const uberUrl = "https://m.uber.com/ul/?action=setPickup&pickup[formatted_address]=" + origin + "&dropoff[formatted_address]=" + dest
  const times = travelTimes[travelKey] || {}

  const hasKey = !!localStorage.getItem("nyc-gmaps-key")
  const loading = hasKey && !times.walk ? ' <span class="travelLoading">···</span>' : ""
  const walkDur = times.walk ? " " + times.walk : loading
  const transitDur = times.transit ? " " + times.transit : loading
  const uberDur = times.drive ? " " + times.drive : loading

  const walkLink = el("a", { href: mapsBase + "&travelmode=walking", target: "_blank", innerHTML: SVG_WALK + walkDur, onclick: (e) => e.stopPropagation() })
  const transitLink = el("a", { href: mapsBase + "&travelmode=transit", target: "_blank", innerHTML: SVG_SUBWAY + transitDur, onclick: (e) => e.stopPropagation() })
  const uberLink = el("a", { href: uberUrl, target: "_blank", className: "uberLink", innerHTML: SVG_CAR + uberDur, onclick: (e) => e.stopPropagation() })

  return el("div", { className: "travel" }, walkLink, transitLink, uberLink)
}

// --- Main render ---

function render() {
  const day = data.days[state.day]
  const hotel = getHotel(day.date)

  document.getElementById("title").innerText = day.title
  document.getElementById("menuHotel").lastChild.textContent = " Back to " + hotel.name
  renderCarousel()

  const nodes = []
  nodes.push(routeCard(state.day))
  nodes.push(hotelRow(hotel.name))

  const firstStop = getStop(state.day, 0)
  nodes.push(travelRow(hotel, firstStop, state.day + "-h0"))

  day.stops.forEach((s, i) => {
    const effective = getStop(state.day, i)
    nodes.push(stopCard(effective, i, state.day))
    if (i < day.stops.length - 1) {
      const next = getStop(state.day, i + 1)
      nodes.push(travelRow(effective, next, state.day + "-" + i))
    }
  })

  const lastStop = getStop(state.day, day.stops.length - 1)
  nodes.push(travelRow(lastStop, hotel, state.day + "-h1"))
  nodes.push(hotelRow("Return to " + hotel.name))

  document.getElementById("stops").replaceChildren(...nodes)
  saveState()
  fetchTravelTimes()
}

function setStop(i) {
  state.stop = i
  render()
  document.querySelector(".stop.active")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
}

// --- Day navigation ---

function prevDay() {
  if (state.day > 0) {
    state.day--
    state.stop = 0
    loadWeather()
    render()
  }
}

function nextDay() {
  if (state.day < data.days.length - 1) {
    state.day++
    state.stop = 0
    loadWeather()
    render()
  }
}

// --- Swipe ---

let startX = 0, startY = 0, swiping = false

document.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  swiping = true
})

document.addEventListener("touchmove", e => {
  if (!swiping) return
  const dy = Math.abs(e.touches[0].clientY - startY)
  const dx = Math.abs(e.touches[0].clientX - startX)
  if (dy > dx) swiping = false
})

document.addEventListener("touchend", e => {
  if (!swiping) return
  const dx = e.changedTouches[0].clientX - startX
  if (Math.abs(dx) < 80) return
  if (dx < 0) nextDay()
  else prevDay()
})

// --- Menu ---

function toggleMenu() {
  document.getElementById("menu").classList.toggle("open")
  document.getElementById("menuOverlay").classList.toggle("show")
}

function closeMenu() {
  document.getElementById("menu").classList.remove("open")
  document.getElementById("menuOverlay").classList.remove("show")
}

function returnHotel() {
  closeMenu()
  const hotel = getHotel(data.days[state.day].date)
  window.open("https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(hotel.address))
}

function nearbyCoffee() {
  closeMenu()
  window.open("https://www.google.com/maps/search/coffee+near+me")
}

function nearbyFood() {
  closeMenu()
  window.open("https://www.google.com/maps/search/food+near+me")
}

// --- Phones (overridable via settings) ---

function getPhone(key) {
  const override = localStorage.getItem("nyc-phone-" + key)
  if (override) return override
  return data[key + "Phone"] || ""
}

function savePhones() {
  const paw = document.getElementById("pawPhoneInput").value.replace(/\D/g, "")
  const law = document.getElementById("lawPhoneInput").value.replace(/\D/g, "")
  if (paw) localStorage.setItem("nyc-phone-paw", paw)
  else localStorage.removeItem("nyc-phone-paw")
  if (law) localStorage.setItem("nyc-phone-law", law)
  else localStorage.removeItem("nyc-phone-law")
}

// --- User identity ---

function getUser() {
  return localStorage.getItem("nyc-user") || "PAW"
}

function setUser(user) {
  localStorage.setItem("nyc-user", user)
  document.getElementById("iAmPaw").classList.toggle("active", user === "PAW")
  document.getElementById("iAmLaw").classList.toggle("active", user === "LAW")
}

// --- Location sharing ---

function sendMyLocation() {
  if (!navigator.geolocation) {
    alert("Location not supported")
    return
  }
  const user = getUser()
  const other = user === "PAW" ? "law" : "paw"
  const phone = getPhone(other)
  if (!phone) {
    alert("Set " + other.toUpperCase() + "'s phone number in Settings first")
    return
  }
  navigator.geolocation.getCurrentPosition(p => {
    const lat = p.coords.latitude
    const lon = p.coords.longitude
    const msg = "Meet here https://maps.google.com/?q=" + lat + "," + lon
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)
    location.href = url
  }, () => {
    alert("Could not get location")
  })
}

// --- Emergency sheet ---

function openEmergency() {
  closeMenu()
  const day = data.days[state.day]
  const hotel = getHotel(day.date)
  const container = document.getElementById("emergencyContent")

  const items = [
    { label: "🏨 Current Hotel", value: hotel.name, detail: hotel.address },
    { label: "📞 Emergency (US)", value: "911", href: "tel:911" },
    { label: "🇬🇧 UK Embassy NYC", value: "+1 212-745-0200", href: "tel:+12127450200" },
    { label: "📱 PAW Phone", value: getPhone("paw") || "Not set", href: getPhone("paw") ? "tel:" + getPhone("paw") : null },
    { label: "📱 LAW Phone", value: getPhone("law") || "Not set", href: getPhone("law") ? "tel:" + getPhone("law") : null },
    { label: "🏥 Nearest ER", value: "Search", href: "https://www.google.com/maps/search/emergency+room+near+me" }
  ]

  const nodes = []
  nodes.push(el("div", { className: "backupCategory" }, "ESSENTIALS"))

  items.forEach(item => {
    const val = item.href
      ? el("a", { href: item.href, target: item.href.startsWith("tel:") ? "_self" : "_blank" }, item.value)
      : el("span", null, item.value)
    const row = el("div", { className: "emergencyItem" },
      el("div", { className: "emergencyLabel" }, item.label),
      el("div", { className: "emergencyValue" }, val)
    )
    nodes.push(row)
    if (item.detail) {
      const detailRow = el("div", { className: "emergencyItem" },
        el("div", { className: "emergencyLabel" }, "📍 Address"),
        el("div", { className: "emergencyValue" },
          el("a", { href: "https://www.google.com/maps/search/" + encodeURIComponent(item.detail), target: "_blank" }, item.detail)
        )
      )
      nodes.push(detailRow)
    }
  })

  container.replaceChildren(...nodes)
  document.getElementById("emergencySheet").classList.add("open")
  document.getElementById("emergencyOverlay").classList.add("show")
}

function closeEmergency() {
  document.getElementById("emergencySheet").classList.remove("open")
  document.getElementById("emergencyOverlay").classList.remove("show")
}

// --- Settings sheet ---

function openSettings() {
  closeMenu()
  const user = getUser()
  document.getElementById("iAmPaw").classList.toggle("active", user === "PAW")
  document.getElementById("iAmLaw").classList.toggle("active", user === "LAW")
  document.getElementById("pawPhoneInput").value = getPhone("paw")
  document.getElementById("lawPhoneInput").value = getPhone("law")
  const tempUnit = getTempUnit()
  document.getElementById("tempF").classList.toggle("active", tempUnit === "fahrenheit")
  document.getElementById("tempC").classList.toggle("active", tempUnit === "celsius")
  const theme = getTheme()
  document.getElementById("themeLight").classList.toggle("active", theme === "light")
  document.getElementById("themeDark").classList.toggle("active", theme === "dark")
  document.getElementById("themeSystem").classList.toggle("active", theme === "system")
  document.getElementById("gmapsKeyInput").value = localStorage.getItem("nyc-gmaps-key") || "AIzaSyBql5cJfu7zX3___6-jB6TlXvCLOAvxYKo"
  document.getElementById("settingsVersion").textContent = "v" + APP_VERSION
  document.getElementById("settingsSheet").classList.add("open")
  document.getElementById("settingsOverlay").classList.add("show")
}

function saveGmapsKey() {
  const key = document.getElementById("gmapsKeyInput").value.trim()
  if (key) localStorage.setItem("nyc-gmaps-key", key)
  else localStorage.removeItem("nyc-gmaps-key")
  travelTimes = {}
  render()
}

function copyGmapsKey() {
  const key = document.getElementById("gmapsKeyInput").value.trim()
  if (!key) return
  navigator.clipboard.writeText(key).then(() => {
    const btn = document.querySelector(".copyBtn")
    btn.textContent = "Copied!"
    setTimeout(() => { btn.textContent = "Copy" }, 1500)
  })
}

function closeSettings() {
  document.getElementById("settingsSheet").classList.remove("open")
  document.getElementById("settingsOverlay").classList.remove("show")
}

// --- Google Maps & Travel Times ---

function loadGoogleMaps() {
  const apiKey = localStorage.getItem("nyc-gmaps-key")
  if (!apiKey) return Promise.reject()
  if (window.google?.maps) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + apiKey
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function fetchTravelTimes() {
  if (!localStorage.getItem("nyc-gmaps-key")) return
  loadGoogleMaps().then(() => {
    if (!window.google?.maps) return
    const service = new google.maps.DistanceMatrixService()
    const dayIndex = state.day
    const day = data.days[dayIndex]
    const hotel = getHotel(day.date)

    // Build pairs: hotel->first, stop->stop, last->hotel
    const pairs = []
    const first = getStop(dayIndex, 0)
    pairs.push({ a: hotel, b: first, key: dayIndex + "-h0" })
    for (let i = 0; i < day.stops.length - 1; i++) {
      pairs.push({ a: getStop(dayIndex, i), b: getStop(dayIndex, i + 1), key: dayIndex + "-" + i })
    }
    const last = getStop(dayIndex, day.stops.length - 1)
    pairs.push({ a: last, b: hotel, key: dayIndex + "-h1" })

    const modes = [["WALKING", "walk"], ["TRANSIT", "transit"], ["DRIVING", "drive"]]

    pairs.forEach(({ a, b, key }) => {
      if (travelTimes[key]?.walk && travelTimes[key]?.transit && travelTimes[key]?.drive) return
      modes.forEach(([gMode, localKey]) => {
        if (travelTimes[key]?.[localKey]) return
        service.getDistanceMatrix({
          origins: [a.address],
          destinations: [b.address],
          travelMode: google.maps.TravelMode[gMode]
        }, (res, status) => {
          if (status === "OK" && res.rows[0]?.elements[0]?.status === "OK") {
            if (!travelTimes[key]) travelTimes[key] = {}
            travelTimes[key][localKey] = res.rows[0].elements[0].duration.text
            clearTimeout(travelRenderTimer)
            travelRenderTimer = setTimeout(render, 200)
          }
        })
      })
    })
  }).catch(() => {})
}

// --- Guides sheet ---

function openGuides() {
  closeMenu()
  renderGuides()
  document.getElementById("guidesSheet").classList.add("open")
  document.getElementById("guidesOverlay").classList.add("show")
}

function closeGuides() {
  document.getElementById("guidesSheet").classList.remove("open")
  document.getElementById("guidesOverlay").classList.remove("show")
}

function renderGuides() {
  const container = document.getElementById("guidesContent")
  const nodes = []

  data.guides.forEach(guide => {
    nodes.push(el("div", { className: "backupCategory" }, guide.icon + " " + guide.title.toUpperCase()))

    guide.items.forEach(item => {
      const mapsUrl = "https://www.google.com/maps/search/" + encodeURIComponent(item.name + ", " + item.address)
      const card = el("div", { className: "guideItem", onclick: () => window.open(mapsUrl, "_blank") },
        el("div", { className: "guideName" }, item.name),
        el("div", { className: "guideNote" }, item.note)
      )
      nodes.push(card)
    })
  })

  container.replaceChildren(...nodes)
}

// --- Backup sheet ---

function openBackups() {
  closeMenu()
  swapTarget = null
  backupDistances = {}
  renderBackups()
  document.getElementById("backupSheet").classList.add("open")
  document.getElementById("backupOverlay").classList.add("show")
}

function openSwap(stopIndex) {
  swapTarget = stopIndex
  backupDistances = {}
  renderBackups()
  document.getElementById("backupSheet").classList.add("open")
  document.getElementById("backupOverlay").classList.add("show")
}

function closeBackups() {
  document.getElementById("backupSheet").classList.remove("open")
  document.getElementById("backupOverlay").classList.remove("show")
  swapTarget = null
}

let backupDistances = {}

const CATEGORY_SEARCH = {
  food: "restaurants",
  bar: "bars+cocktails",
  comedy: "comedy+clubs",
  coffee: "coffee",
  other: "things+to+do"
}

function renderBackups() {
  const container = document.getElementById("backupContent")
  const groups = {}

  data.backups.forEach((b, i) => {
    const cat = b.category || "other"
    if (!groups[cat]) groups[cat] = []
    groups[cat].push({ ...b, index: i })
  })

  const nodes = []

  for (const [cat, items] of Object.entries(groups)) {
    // Sort by distance if available
    items.sort((a, b) => {
      const da = backupDistances[a.index]
      const db = backupDistances[b.index]
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return parseFloat(da) - parseFloat(db)
    })

    nodes.push(el("div", { className: "backupCategory" }, cat.toUpperCase()))

    items.forEach(b => {
      const dist = backupDistances[b.index]
      const distLabel = dist ? " · " + dist : ""
      const card = el("div", { className: "backupItem", onclick: () => selectBackup(b.index) },
        el("div", { className: "backupName" }, (b.icon || "") + " " + b.name),
        el("div", { className: "backupArea" }, b.area + distLabel)
      )
      nodes.push(card)
    })

    const searchTerm = CATEGORY_SEARCH[cat] || CATEGORY_SEARCH.other
    const findMore = el("a", {
      className: "backupFindMore",
      href: "https://www.google.com/maps/search/" + searchTerm + "+near+me",
      target: "_blank",
      onclick: (e) => e.stopPropagation()
    }, "Find more " + cat + " nearby ›")
    nodes.push(findMore)
  }

  container.replaceChildren(...nodes)
  fetchBackupDistances()
}

function fetchBackupDistances() {
  if (!localStorage.getItem("nyc-gmaps-key")) return
  // Use current location if available, otherwise use current stop address
  const useGeolocation = navigator.geolocation
  const fallback = () => {
    const stop = getStop(state.day, state.stop)
    fetchBackupDistancesFrom(stop.address)
  }
  if (useGeolocation) {
    navigator.geolocation.getCurrentPosition(p => {
      fetchBackupDistancesFrom(p.coords.latitude + "," + p.coords.longitude)
    }, fallback, { timeout: 3000 })
  } else {
    fallback()
  }
}

function fetchBackupDistancesFrom(origin) {
  loadGoogleMaps().then(() => {
    if (!window.google?.maps) return
    const service = new google.maps.DistanceMatrixService()
    const destinations = data.backups.map(b => b.address)
    service.getDistanceMatrix({
      origins: [origin],
      destinations: destinations,
      travelMode: google.maps.TravelMode.WALKING
    }, (res, status) => {
      if (status !== "OK") return
      res.rows[0].elements.forEach((elem, i) => {
        if (elem.status === "OK") {
          backupDistances[i] = elem.duration.text + " walk"
        }
      })
      renderBackupsOnly()
    })
  }).catch(() => {})
}

function renderBackupsOnly() {
  const container = document.getElementById("backupContent")
  const groups = {}

  data.backups.forEach((b, i) => {
    const cat = b.category || "other"
    if (!groups[cat]) groups[cat] = []
    groups[cat].push({ ...b, index: i })
  })

  const nodes = []

  for (const [cat, items] of Object.entries(groups)) {
    items.sort((a, b) => {
      const da = backupDistances[a.index]
      const db = backupDistances[b.index]
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return parseFloat(da) - parseFloat(db)
    })

    nodes.push(el("div", { className: "backupCategory" }, cat.toUpperCase()))

    items.forEach(b => {
      const dist = backupDistances[b.index]
      const distLabel = dist ? " · " + dist : ""
      const card = el("div", { className: "backupItem", onclick: () => selectBackup(b.index) },
        el("div", { className: "backupName" }, (b.icon || "") + " " + b.name),
        el("div", { className: "backupArea" }, b.area + distLabel)
      )
      nodes.push(card)
    })

    const searchTerm = CATEGORY_SEARCH[cat] || CATEGORY_SEARCH.other
    const findMore = el("a", {
      className: "backupFindMore",
      href: "https://www.google.com/maps/search/" + searchTerm + "+near+me",
      target: "_blank",
      onclick: (e) => e.stopPropagation()
    }, "Find more " + cat + " nearby ›")
    nodes.push(findMore)
  }

  container.replaceChildren(...nodes)
}

function selectBackup(backupIndex) {
  if (swapTarget != null) {
    const original = data.days[state.day].stops[swapTarget]
    if (original.type === "reserved") return

    state.swaps[state.day + "-" + swapTarget] = backupIndex
    closeBackups()
    render()
  } else {
    const backup = data.backups[backupIndex]
    if (backup.address) {
      window.open("https://www.google.com/maps/search/" + encodeURIComponent(backup.name + " " + backup.address))
    }
    closeBackups()
  }
}

function restoreStop(dayIndex, stopIndex) {
  delete state.swaps[dayIndex + "-" + stopIndex]
  render()
}

// --- Service worker ---

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {})
}
