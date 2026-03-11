"use strict"

const APP_VERSION = "2.1.1"

// --- SVG icons ---

const SVG_WALK = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M8 1.5a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM6.2 4L4.5 6.5l1.3.7L7 6h.5l1 1.5 2 1-.5 1-1.5-.8-1.8-2.5-.8.8V9L7.5 11l-.8.8L5 9V6.5L3.5 8.5l-.8-.6L5 4.5c.3-.3.7-.5 1.2-.5z"/></svg>'
const SVG_PIN = '<svg class="pin-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1C4.8 1 3 2.9 3 5.3 3 8.5 7 13 7 13s4-4.5 4-7.7C11 2.9 9.2 1 7 1zm0 5.8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>'
const SVG_SUBWAY = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M4 1h6a2 2 0 012 2v6a2 2 0 01-2 2l1.5 2h-1.2L9 11H5l-1.3 2H2.5L4 11a2 2 0 01-2-2V3a2 2 0 012-2zm0 1.5v3h2.5v-3H4zm3.5 0v3H10v-3H7.5zM5 8a.8.8 0 100 1.6A.8.8 0 005 8zm4 0a.8.8 0 100 1.6A.8.8 0 009 8z"/></svg>'
const SVG_CAR = '<svg class="travel-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2h7l1.5 4v5a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5V10.5h-6V11a.5.5 0 01-.5.5h-1A.5.5 0 012 11V6l1.5-4zm.3 1.5L3 6h8l-.8-2.5H3.8zM4 7.5a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z"/></svg>'
const SVG_GPS = '<svg class="pin-icon" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0v2a5 5 0 00-5 5H0v2h2a5 5 0 005 5v2h2v-2a5 5 0 005-5h2V7h-2a5 5 0 00-5-5V0H7zm1 4a3 3 0 110 6 3 3 0 010-6z"/></svg>'

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
let state = { day: 0, stop: 0, swaps: {}, done: {}, removed: {}, added: {}, reorder: {}, userNotes: {} }
let hourlyWeather = null
let weatherController = null // AbortController for weather fetch
let travelTimes = {}
let travelRenderTimer = null
let swapTarget = null // index of stop being swapped
let mapCache = {} // dayIndex -> { key, node }
let expandedStops = loadExpandedStops() // "dayIndex-ei" -> true

function loadExpandedStops() {
  try { return JSON.parse(localStorage.getItem("nyc-expanded")) || {} } catch { return {} }
}

function saveExpandedStops() {
  localStorage.setItem("nyc-expanded", JSON.stringify(expandedStops))
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved) {
      state.day = saved.day ?? 0
      state.stop = saved.stop ?? 0
      state.done = saved.done ?? {}
      state.removed = saved.removed ?? {}
      state.added = saved.added ?? {}
      state.reorder = saved.reorder ?? {}
      state.userNotes = saved.userNotes ?? {}
      // Clear index-dependent state if version changed (indices may have shifted)
      if (saved.version !== APP_VERSION) {
        state.swaps = {}
        state.added = {}
        state.removed = {}
        state.reorder = {}
      } else {
        state.swaps = saved.swaps ?? {}
      }
    }
  } catch (e) { /* ignore */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: APP_VERSION }))
}

function autoSelectToday() {
  const now = new Date()
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0")
  const idx = data.days.findIndex(d => d.date === today)
  if (idx >= 0) state.day = idx
}

function clampState() {
  if (!data || !data.days || !data.days.length) return
  state.day = Math.max(0, Math.min(state.day, data.days.length - 1))
  const effective = getEffectiveStops(state.day)
  if (!effective.length) { state.stop = 0; return }
  state.stop = Math.max(0, Math.min(state.stop, effective.length - 1))
}

// --- Get effective stop (with swap applied) ---

function getAllAlternatives() {
  const items = []
  data.guides.forEach(guide => {
    guide.items.forEach(item => {
      items.push({ ...item, icon: item.icon || guide.icon })
    })
  })
  return items
}

function getStop(dayIndex, stopIndex) {
  const key = dayIndex + "-" + stopIndex
  const swapIdx = state.swaps[key]
  if (swapIdx != null) {
    const alts = getAllAlternatives()
    if (alts[swapIdx]) return alts[swapIdx]
    delete state.swaps[key] // stale swap — alternative no longer exists
  }
  const day = data.days[dayIndex]
  if (!day || !day.stops[stopIndex]) return { name: "Unknown", address: "", icon: "📍", type: "flexible", note: "" }
  return day.stops[stopIndex]
}

function isSwapped(dayIndex, stopIndex) {
  return state.swaps[dayIndex + "-" + stopIndex] != null
}

function getEffectiveStops(dayIndex) {
  const day = data.days[dayIndex]
  if (!day || !day.stops) return []
  const result = []

  // Collect non-removed original stops with swap resolution
  day.stops.forEach((s, i) => {
    if (state.removed[dayIndex + "-" + i]) return
    result.push({ stop: getStop(dayIndex, i), key: dayIndex + "-" + i, isAdded: false, origIndex: i })
  })

  // Insert added stops at their stored positions
  const additions = state.added[dayIndex] || []
  additions.forEach((addedStop, ai) => {
    const addKey = dayIndex + "-a-" + ai
    if (state.removed[addKey]) return
    const pos = Math.max(0, Math.min(addedStop.position ?? result.length, result.length))
    result.splice(pos, 0, { stop: addedStop, key: addKey, isAdded: true, origIndex: null })
  })

  // Apply custom reorder if stored for this day
  const order = state.reorder[dayIndex]
  if (order && order.length) {
    const byKey = {}
    result.forEach(e => { byKey[e.key] = e })
    const ordered = []
    order.forEach(k => { if (byKey[k]) { ordered.push(byKey[k]); delete byKey[k] } })
    // Append any entries not in stored order (newly added stops)
    result.forEach(e => { if (byKey[e.key]) ordered.push(e) })
    return ordered
  }

  return result
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
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", dark ? "#111" : "#fffdf6")
}

// --- Compact mode ---

function isCompact(dayIndex) {
  if (dayIndex !== undefined) {
    const perDay = localStorage.getItem("nyc-compact-" + dayIndex)
    if (perDay === "full") return false
    if (perDay === "compact") return true
  }
  return localStorage.getItem("nyc-compact") === "1"
}

function getDayViewMode(dayIndex) {
  return localStorage.getItem("nyc-compact-" + dayIndex) || "default"
}

function setDayViewMode(dayIndex, mode) {
  if (mode === "default") {
    localStorage.removeItem("nyc-compact-" + dayIndex)
  } else {
    localStorage.setItem("nyc-compact-" + dayIndex, mode)
  }
  render()
}

function toggleCompact() {
  setCompact(!isCompact())
}

function setCompact(on) {
  localStorage.setItem("nyc-compact", on ? "1" : "0")
  applyCompact()
  render()
}

function toggleDayCompact() {
  const mode = getDayViewMode(state.day)
  const currentlyCompact = mode === "compact" || (mode === "default" && isCompact())
  setDayViewMode(state.day, currentlyCompact ? "full" : "compact")
}

const SVG_VIEW_FULL = '<svg viewBox="0 0 24 32" fill="currentColor"><rect x="4" y="8" width="16" height="2.5" rx="1"/><rect x="4" y="13" width="12" height="1.5" rx=".75" opacity=".4"/><rect x="4" y="18" width="16" height="2.5" rx="1"/><rect x="4" y="23" width="12" height="1.5" rx=".75" opacity=".4"/></svg>'
const SVG_VIEW_COMPACT = '<svg viewBox="0 0 24 32" fill="currentColor"><rect x="4" y="10" width="16" height="2.5" rx="1"/><rect x="4" y="15" width="16" height="2.5" rx="1"/><rect x="4" y="20" width="16" height="2.5" rx="1"/></svg>'

function applyCompact() {
  const on = isCompact(state.day)
  const offBtn = document.getElementById("compactOff")
  const onBtn = document.getElementById("compactOn")
  if (offBtn) offBtn.classList.toggle("active", !on)
  if (onBtn) onBtn.classList.toggle("active", on)
  const toggleBtn = document.getElementById("compactToggleBtn")
  if (toggleBtn) {
    toggleBtn.innerHTML = on ? SVG_VIEW_COMPACT : SVG_VIEW_FULL
    toggleBtn.setAttribute("aria-label", on ? "Switch to full view" : "Switch to compact view")
  }
}

// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getTheme() === "system") applyTheme()
})

// --- Verification gate ---

function isVerified() {
  return localStorage.getItem("nyc-verified") === "true"
}

function verifyAs(user) {
  localStorage.setItem("nyc-verified", "true")
  localStorage.setItem("nyc-user", user)
  dismissGate()
  fetch("data.json").then(r => r.json()).then(d => bootApp(d)).catch(() => {
    document.getElementById("stops").append(
      el("div", { className: "stop" }, "Failed to load trip data. Please refresh.")
    )
  })
}

function dismissGate() {
  const gate = document.getElementById("verifyGate")
  gate.classList.add("hidden")
  setTimeout(() => gate.remove(), 400)
}

// --- Data loading ---

function bootApp(d) {
  data = d
  applyTripEdits()
  loadState()
  autoSelectToday()
  clampState()
  applyTheme()
  applyCompact()
  if (!localStorage.getItem("nyc-gmaps-key")) {
    localStorage.setItem("nyc-gmaps-key", atob("QUl6YVN5QnFsNWNKZnU3elgzX19fNi1qQjZUbFh2Q0xPQXZ4WUtv"))
  }
  loadWeather()
  render()
  if (anyAlertsEnabled()) requestAlertPermission()
  setTimeout(checkAlerts, 3000)
  setTimeout(checkSyncHash, 500)
}

if (isVerified()) {
  // already verified — hide gate and boot
  fetch("data.json")
    .then(r => r.json())
    .then(d => {
      dismissGate()
      bootApp(d)
    })
    .catch(() => {
      document.getElementById("stops").append(
        el("div", { className: "stop" }, "Failed to load trip data. Please refresh.")
      )
    })
} else {
  // show the gate — app boots only after successful verification
  document.getElementById("verifyGate").style.display = "flex"
}

// --- Weather ---

function getTempUnit() {
  return localStorage.getItem("nyc-temp-unit") || "celsius"
}

function setTempUnit(unit) {
  localStorage.setItem("nyc-temp-unit", unit)
  document.getElementById("tempC").classList.toggle("active", unit === "celsius")
  document.getElementById("tempF").classList.toggle("active", unit === "fahrenheit")
  loadWeather()
}

function loadWeather() {
  if (weatherController) weatherController.abort()
  weatherController = new AbortController()
  const day = data.days[state.day]
  if (!day) return
  hourlyWeather = null
  const tempUnit = getTempUnit()
  const unitParam = tempUnit === "fahrenheit" ? "&temperature_unit=fahrenheit" : ""
  fetch("https://api.open-meteo.com/v1/forecast?latitude=40.72&longitude=-74.00&hourly=temperature_2m,precipitation_probability,weather_code&start_date=" + day.date + "&end_date=" + day.date + unitParam, { signal: weatherController.signal })
    .then(r => r.json())
    .then(w => {
      hourlyWeather = w.hourly
      render()
    })
    .catch(e => { if (e.name !== "AbortError") hourlyWeather = null })
}

function getStopHour(stopIndex, totalStops) {
  return Math.round(9 + (stopIndex * 12 / Math.max(totalStops - 1, 1)))
}

function getNextUpIndex(dayIndex, effective) {
  const day = data.days[dayIndex]
  if (!day) return -1
  const now = new Date()
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0")
  if (day.date !== today) return -1
  const nowHour = now.getHours() + now.getMinutes() / 60
  for (let i = 0; i < effective.length; i++) {
    const key = effective[i].key
    if (state.done[key]) continue
    const stop = effective[i].stop
    const stopHour = stop.time ? parseInt(stop.time.split(":")[0], 10) + (parseInt(stop.time.split(":")[1], 10) || 0) / 60 : getStopHour(i, effective.length)
    if (stopHour >= nowHour - 1) return i
  }
  // All done or past — return last un-done
  for (let i = 0; i < effective.length; i++) {
    if (!state.done[effective[i].key]) return i
  }
  return -1
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
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
    })
  }
}

function goDay(i) {
  if (i === state.day) return
  switchDay(() => { state.day = i; state.stop = 0; loadWeather(); render() })
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
  if (navigator.vibrate) navigator.vibrate(8)
  render()
}

function toggleDoneKey(key) {
  if (state.done[key]) delete state.done[key]
  else state.done[key] = true
  render()
}

function saveUserNote(key, text) {
  const trimmed = (text || "").trim().slice(0, 200)
  if (trimmed) state.userNotes[key] = trimmed
  else delete state.userNotes[key]
  saveState()
}

function buildUserNoteInput(key, value) {
  const ta = el("textarea", {
    className: "userNoteInput",
    rows: 2,
    maxLength: 200,
    placeholder: "Your note...",
    onclick: (e) => e.stopPropagation(),
    onkeydown: (e) => {
      e.stopPropagation()
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur() }
    },
    onblur: () => { saveUserNote(key, ta.value); render() }
  })
  ta.value = value
  setTimeout(() => ta.focus(), 0)
  return ta
}

function removeStop(key, name) {
  if (!confirm("Remove " + (name || "this stop") + "?")) return
  state.removed[key] = true
  delete state.done[key]
  delete state.userNotes[key]
  render()
}

function moveStop(dayIndex, fromEi, direction) {
  const toEi = fromEi + direction
  const effective = getEffectiveStops(dayIndex)
  if (toEi < 0 || toEi >= effective.length) return
  const keys = effective.map(e => e.key)
  ;[keys[fromEi], keys[toEi]] = [keys[toEi], keys[fromEi]]
  state.reorder[dayIndex] = keys
  state.stop = toEi
  delete mapCache[dayIndex]
  render()
  showToast("Route map updated")
  const cards = document.querySelectorAll("#stops .stop")
  if (cards[toEi]) cards[toEi].scrollIntoView({ behavior: "smooth", block: "nearest" })
}

function showToast(msg) {
  let existing = document.getElementById("moveToast")
  if (existing) existing.remove()
  const toast = el("div", { id: "moveToast", className: "moveToast" }, msg)
  document.body.appendChild(toast)
  setTimeout(() => toast.classList.add("show"), 10)
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300) }, 2000)
}

function toggleExpand(expandKey) {
  if (expandedStops[expandKey]) delete expandedStops[expandKey]
  else expandedStops[expandKey] = true
  saveExpandedStops()
  render()
}

function stopCard(entry, i, dayIndex, nextUpIdx, effectiveLen) {
  const stop = entry.stop
  const key = entry.key
  const active = i === state.stop ? " active" : ""
  const reserved = stop.type === "reserved"
  const swapped = !entry.isAdded && isSwapped(dayIndex, entry.origIndex)
  const done = state.done[key] === true
  const isNext = nextUpIdx === i && !done
  const cls = "stop" + active + (reserved ? " reserved" : " flexible") + (done ? " done" : "") + (isNext ? " nextup" : "")

  const checkBtn = el("button", {
    className: "doneBtn" + (done ? " checked" : ""),
    "aria-label": done ? "Mark not done" : "Mark done",
    onclick: (e) => { e.stopPropagation(); toggleDoneKey(key) }
  }, done ? "✓" : (i + 1).toString())

  const nextLabel = isNext ? el("span", { className: "nextLabel" }, "NEXT") : null

  const mapsUrl = "https://www.google.com/maps/search/" + encodeURIComponent(stop.name + ", " + stop.address)
  const header = el("div", { className: "stopHeader" },
    checkBtn,
    nextLabel,
    el("a", { className: "stopName", href: mapsUrl, target: "_blank", onclick: (e) => e.stopPropagation() },
      (stop.icon || "") + " " + stop.name)
  )

  const compact = isCompact(dayIndex)

  const badge = reserved && stop.time
    ? el("span", { className: "timeBadge" }, stop.time)
    : null

  const removeBtn = el("button", {
    className: "removeBtn",
    "aria-label": "Remove this stop",
    onclick: (e) => { e.stopPropagation(); removeStop(key, stop.name) }
  }, "✕")

  const headerSwapBtn = !reserved && !entry.isAdded && !compact
    ? el("button", {
        className: "headerSwapBtn",
        "aria-label": "Swap this stop",
        onclick: (e) => { e.stopPropagation(); openSwap(entry.origIndex) }
      }, "↻")
    : null

  const expandKey = dayIndex + "-" + i
  const expanded = expandedStops[expandKey] === true

  const expandBtn = compact ? null : el("button", {
    className: "expandBtn" + (expanded ? " open" : ""),
    "aria-label": expanded ? "Collapse" : "Expand",
    innerHTML: '<svg viewBox="0 0 24 24" fill="currentColor" class="skyline-icon"><rect x="1" y="14" width="3.5" height="9" rx="0.4"/><rect x="5.5" y="9" width="3.5" height="14" rx="0.4"/><rect x="10" y="4" width="4" height="19" rx="0.4"/><rect x="11.5" y="1" width="1" height="4"/><rect x="15" y="10" width="3.5" height="13" rx="0.4"/><rect x="19.5" y="13" width="3.5" height="10" rx="0.4"/></svg>',
    onclick: (e) => { e.stopPropagation(); toggleExpand(expandKey) }
  })

  const moveUpBtn = i > 0 ? el("button", {
    className: "moveBtn",
    "aria-label": "Move up",
    onclick: (e) => { e.stopPropagation(); moveStop(dayIndex, i, -1) }
  }, "▲") : null
  const moveDownBtn = i < effectiveLen - 1 ? el("button", {
    className: "moveBtn",
    "aria-label": "Move down",
    onclick: (e) => { e.stopPropagation(); moveStop(dayIndex, i, 1) }
  }, "▼") : null
  const moveGroup = (moveUpBtn || moveDownBtn) ? el("div", { className: "moveGroup" }, moveUpBtn, moveDownBtn) : null

  const noteIndicator = compact && state.userNotes[key]
    ? el("span", { className: "noteIndicator", title: "Has note" }, "✎")
    : null

  const topRow = el("div", { className: "stopTop" },
    header,
    badge,
    noteIndicator,
    headerSwapBtn,
    moveGroup,
    removeBtn,
    expandBtn
  )

  // Expanded detail area
  let detail = null
  if (expanded && !compact) {
    const addr = el("a", {
      className: "stopAddr",
      href: mapsUrl,
      target: "_blank",
      onclick: (e) => e.stopPropagation()
    }, stop.address)

    const restore = swapped
      ? el("div", {
          className: "restoreLink",
          onclick: (e) => { e.stopPropagation(); restoreStop(dayIndex, entry.origIndex) }
        }, "↩ Restore original")
      : null

    const note = stop.note
      ? el("div", { className: "stopNote" }, stop.note)
      : null

    const existingUserNote = state.userNotes[key] || ""
    const userNoteEl = el("div", { className: "userNoteWrap", onclick: (e) => e.stopPropagation() })
    if (existingUserNote) {
      const noteText = el("div", { className: "userNote", onclick: (e) => {
        e.stopPropagation()
        const wrap = e.target.closest(".userNoteWrap")
        wrap.replaceChildren(buildUserNoteInput(key, existingUserNote))
      }}, existingUserNote)
      userNoteEl.appendChild(noteText)
    } else {
      const addBtn = el("button", { className: "addNoteBtn", onclick: (e) => {
        e.stopPropagation()
        const wrap = e.target.closest(".userNoteWrap")
        wrap.replaceChildren(buildUserNoteInput(key, ""))
      }}, "+ Add note")
      userNoteEl.appendChild(addBtn)
    }

    const urlLink = stop.url
      ? el("a", { className: "stopUrl", href: stop.url, target: "_blank", onclick: (e) => e.stopPropagation() }, "Book / Website →")
      : null

    const bookingLink = stop.bookingUrl
      ? el("a", { className: "stopUrl bookingUrl", href: stop.bookingUrl, target: "_blank", onclick: (e) => e.stopPropagation() }, "View Booking →")
      : null

    const bookingRef = stop.bookingRef
      ? el("div", { className: "bookingRef", onclick: (e) => { e.stopPropagation(); navigator.clipboard.writeText(stop.bookingRef) } }, "Ref: " + stop.bookingRef + " (tap to copy)")
      : null

    const uberBtn = reserved && stop.time
      ? el("a", {
          className: "uberBtn",
          href: "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=" + encodeURIComponent(stop.address),
          target: "_blank",
          onclick: (e) => e.stopPropagation()
        }, "🚕 Uber there")
      : null

    // Street View image
    const apiKey = localStorage.getItem("nyc-gmaps-key")
    const streetView = apiKey
      ? el("img", {
          className: "streetViewImg",
          src: "https://maps.googleapis.com/maps/api/streetview?size=400x200&location=" + encodeURIComponent(stop.address) + "&key=" + apiKey,
          alt: stop.name + " street view",
          loading: "lazy",
          onerror: function() { this.style.display = "none" }
        })
      : null

    detail = el("div", { className: "stopDetail" },
      el("div", { className: "stopDetailText" }, addr, note, userNoteEl, urlLink, bookingLink, bookingRef, uberBtn, restore),
      streetView
    )
  } else if (!compact) {
    // Collapsed: still show address and note inline (existing behavior)
    const addr = el("a", {
      className: "stopAddr",
      href: mapsUrl,
      target: "_blank",
      onclick: (e) => e.stopPropagation()
    }, stop.address)

    const restore = swapped
      ? el("div", {
          className: "restoreLink",
          onclick: (e) => { e.stopPropagation(); restoreStop(dayIndex, entry.origIndex) }
        }, "↩ Restore original")
      : null

    const note = stop.note
      ? el("div", { className: "stopNote" }, stop.note)
      : null

    const userNotePreview = state.userNotes[key]
      ? el("div", { className: "userNote userNotePreview" }, state.userNotes[key])
      : null

    detail = el("div", { className: "stopDetailCollapsed" }, addr, note, userNotePreview, restore)
  }

  const content = el("div", { className: "stopContent" }, topRow, detail)

  let wthr = null
  if (hourlyWeather) {
    const hour = stop.time ? parseInt(stop.time.split(":")[0], 10) : getStopHour(i, effectiveLen)
    const maxHour = hourlyWeather.temperature_2m.length - 1
    const safeHour = Math.max(0, Math.min(hour, maxHour))
    const temp = Math.round(hourlyWeather.temperature_2m[safeHour])
    const rain = hourlyWeather.precipitation_probability[safeHour]
    const icon = weatherIcon(hourlyWeather.weather_code[safeHour])
    const unitLabel = getTempUnit() === "fahrenheit" ? "°F" : "°C"
    wthr = el("div", { className: "weatherBadge" },
      el("div", { className: "weatherIcon" }, icon),
      el("div", { className: "weatherTemp" }, (isNaN(temp) ? "--" : temp) + unitLabel),
      el("div", { className: "weatherRain" }, "💧" + (rain != null ? rain : "--") + "%")
    )
  } else {
    wthr = el("div", { className: "weatherSkeleton" })
  }

  const cardCls = cls + (expanded ? " expanded" : "")
  return el("div", { className: cardCls, onclick: () => setStop(i) },
    content, wthr
  )
}

// --- Route overview card ---

function dayWalkSummary(dayIndex) {
  const effective = getEffectiveStops(dayIndex)
  const keys = [dayIndex + "-h0"]
  for (let i = 0; i < effective.length - 1; i++) keys.push(dayIndex + "-e" + i)
  keys.push(dayIndex + "-h1")
  let totalMeters = 0, totalMins = 0, hasAny = false
  keys.forEach(k => {
    const t = travelTimes[k]
    if (!t) return
    if (t.walkDist) {
      hasAny = true
      const km = t.walkDist.match(/([\d.]+)\s*km/i)
      if (km) totalMeters += parseFloat(km[1]) * 1000
      const mi = t.walkDist.match(/([\d.]+)\s*mi/i)
      if (mi) totalMeters += parseFloat(mi[1]) * 1609
    }
    if (t.walk) {
      const m = t.walk.match(/(\d+)/)
      if (m) totalMins += parseInt(m[1], 10)
    }
  })
  if (!hasAny) return null
  const dist = (totalMeters / 1000).toFixed(1) + " km"
  const hrs = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const time = hrs > 0 ? hrs + "h " + (mins > 0 ? mins + "m" : "") : mins + "m"
  return { dist, time }
}

function routeCardLabel(stopCount, dayIndex) {
  const ws = dayWalkSummary(dayIndex)
  let text = "🗺 " + stopCount + " stops"
  if (ws) text += "  ·  🚶 " + ws.dist + "  ·  ~" + ws.time
  return text
}

function routeCard(dayIndex) {
  const day = data.days[dayIndex]
  const stops = getEffectiveStops(dayIndex).map(e => e.stop)
  const hotel = getHotel(day.date)

  const origin = encodeURIComponent(hotel.address)
  const dest = encodeURIComponent(hotel.address)
  const waypoints = stops.map(s => encodeURIComponent(s.address)).join("|")
  const cacheKey = origin + "|" + waypoints + "|" + dest

  const cached = mapCache[dayIndex]
  if (cached && cached.key === cacheKey) return cached.node

  const mapsUrl = "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest + "&waypoints=" + waypoints + "&travelmode=walking"

  const apiKey = localStorage.getItem("nyc-gmaps-key")

  let mapContent
  if (apiKey) {
    const markers = stops.map((s, i) =>
      "&markers=color:0xC9A84C%7Clabel:" + (i + 1) + "%7C" + encodeURIComponent(s.address)
    ).join("")
    const hotelMarker = "&markers=color:0x2A7D4F%7Clabel:H%7C" + encodeURIComponent(hotel.address)
    const staticUrl = "https://maps.googleapis.com/maps/api/staticmap?size=640x300&scale=2"
      + "&style=feature:poi%7Cvisibility:off"
      + hotelMarker + markers + "&key=" + apiKey
    const skeleton = el("div", { className: "mapSkeleton" }, "Loading map…")
    const img = el("img", {
      className: "routeMapImg",
      src: staticUrl,
      alt: "Route map for " + day.title,
      loading: "lazy",
      onload: () => skeleton.classList.add("loaded"),
      onerror: () => { skeleton.textContent = "Map unavailable"; skeleton.classList.add("loaded") }
    })
    mapContent = el("div", { className: "routeMapWrap" }, skeleton, img)
  } else {
    const placeholder = el("div", { className: "routeMapPlaceholder" },
      el("span", null, "🗺"),
      el("span", null, stops.length + " stops · " + day.title)
    )
    mapContent = el("div", { className: "routeMapWrap" }, placeholder)
  }

  const collapsed = localStorage.getItem("nyc-map-collapsed-" + dayIndex) !== "0"
  const body = el("div", { className: "routeCardBody" + (collapsed ? " collapsed" : "") },
    mapContent,
    el("a", { className: "routeCardLabel", href: mapsUrl, target: "_blank", onclick: (e) => e.stopPropagation() }, "Open day route ›")
  )

  const chevron = el("span", { className: "routeToggleChevron" }, collapsed ? "▸" : "▾")
  const toggle = el("button", {
    className: "routeToggle",
    onclick: () => {
      const isCollapsed = body.classList.toggle("collapsed")
      chevron.textContent = isCollapsed ? "▸" : "▾"
      localStorage.setItem("nyc-map-collapsed-" + dayIndex, isCollapsed ? "1" : "0")
    }
  }, routeCardLabel(stops.length, dayIndex), chevron)

  const node = el("div", { className: "routeCard" },
    toggle,
    body
  )
  mapCache[dayIndex] = { key: cacheKey, node }
  return node
}

// --- Hotel row ---

function hotelRow(name, address) {
  const url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address)
  return el("a", { className: "stop hotel", href: url, target: "_blank" }, "🏨 " + name)
}

// --- Flight row ---

function getFlights(date) {
  if (!data.flights) return []
  return data.flights.filter(f => f.date === date)
}

function flightRow(flight) {
  const icon = "✈️"
  const label = flight.direction === "inbound"
    ? flight.from + " → " + flight.to + "  ·  Lands " + flight.arrive
    : flight.from + " → " + flight.to + "  ·  Departs " + flight.depart
  const sub = flight.code + (flight.note ? "  ·  " + flight.note : "")
  const row = el("div", { className: "stop flight " + flight.direction },
    el("div", { className: "flightMain" }, icon + " " + label),
    el("div", { className: "flightSub" }, sub)
  )
  return row
}

// --- Travel row (SVG icons) ---

function travelRow(a, b, travelKey) {
  const origin = encodeURIComponent(a.address)
  const dest = encodeURIComponent(b.address)
  const mapsBase = "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest
  const uberUrl = "https://m.uber.com/ul/?action=setPickup&pickup[formatted_address]=" + origin + "&dropoff[formatted_address]=" + dest
  const lyftUrl = "https://ride.lyft.com/ridetype?id=lyft&pickup[formatted_address]=" + origin + "&destination[formatted_address]=" + dest
  const times = travelTimes[travelKey] || {}

  const hasKey = !!localStorage.getItem("nyc-gmaps-key")
  const loadingDot = hasKey ? " ···" : ""

  // Distance badge (walk distance)
  const distBadge = times.walkDist
    ? el("span", { className: "travelDist", innerHTML: SVG_PIN })
    : null
  if (distBadge) distBadge.append(" " + times.walkDist)

  const walkLink = el("a", { href: mapsBase + "&travelmode=walking", target: "_blank", innerHTML: SVG_WALK, onclick: (e) => e.stopPropagation() })
  walkLink.append(times.walk ? " " + times.walk : loadingDot)
  const transitLink = el("a", { href: mapsBase + "&travelmode=transit", target: "_blank", className: "transitLink", innerHTML: SVG_SUBWAY, onclick: (e) => e.stopPropagation() })
  transitLink.append(times.transit ? " " + times.transit : loadingDot)

  // Rideshare button — opens picker for Uber / Lyft
  const rideBtn = el("a", { href: "#", className: "rideBtn", innerHTML: SVG_CAR, onclick: (e) => {
    e.preventDefault(); e.stopPropagation()
    showRidePicker(rideBtn, uberUrl, lyftUrl)
  }})
  rideBtn.append(times.drive ? " " + times.drive : loadingDot)

  return el("div", { className: "travel" }, distBadge, walkLink, transitLink, rideBtn)
}

// --- Ride picker popup ---

function showRidePicker(anchor, uberUrl, lyftUrl) {
  // Close any existing picker
  document.querySelectorAll(".ridePicker").forEach(p => p.remove())

  const picker = el("div", { className: "ridePicker" },
    el("a", { href: uberUrl, target: "_blank", onclick: (e) => { e.stopPropagation(); picker.remove() } }, "Uber"),
    el("a", { href: lyftUrl, target: "_blank", onclick: (e) => { e.stopPropagation(); picker.remove() } }, "Lyft")
  )
  anchor.parentElement.style.position = "relative"
  anchor.parentElement.appendChild(picker)

  // Flip below if not enough room above
  requestAnimationFrame(() => {
    const rect = picker.getBoundingClientRect()
    if (rect.top < 0) {
      picker.style.bottom = "auto"
      picker.style.top = "calc(100% + 6px)"
    }
  })

  // Close on outside tap
  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener("click", close, true) } }
  setTimeout(() => document.addEventListener("click", close, true), 0)
}

// --- Alert rows ---

function alertRow(icon, text, cls) {
  return el("div", { className: "alertRow" + (cls ? " " + cls : "") },
    el("span", { className: "alertRowIcon" }, icon),
    el("span", { className: "alertRowText" }, text)
  )
}

function weatherAlertRow(dayIndex) {
  if (!getAlertPref("weather") || !hourlyWeather) return null
  const day = data.days[dayIndex]
  if (!day || !day.stops) return null
  const rainy = []
  day.stops.forEach((_, i) => {
    const stop = getStop(dayIndex, i)
    const hour = stop.time ? parseInt(stop.time.split(":")[0], 10) : getStopHour(i, day.stops.length)
    const safeH = Math.max(0, Math.min(hour, hourlyWeather.precipitation_probability.length - 1))
    const rain = hourlyWeather.precipitation_probability[safeH]
    if (rain != null && rain >= 50) rainy.push({ rain, name: stop.name, hour: safeH })
  })
  if (rainy.length === 0) return null
  const worst = rainy.reduce((a, b) => a.rain > b.rain ? a : b)
  const hourLabel = (worst.hour % 12 || 12) + (worst.hour >= 12 ? "pm" : "am")
  return alertRow("🌧", "Rain " + worst.rain + "% at " + hourLabel + " (" + worst.name + ") — bring an umbrella", "alertWeather")
}

function getWalkMins(travelKey) {
  const times = travelTimes[travelKey]
  if (!times || !times.walk) return 0
  const walkMatch = times.walk.match(/(\d+)/)
  return walkMatch ? parseInt(walkMatch[1], 10) : 0
}

function reservationAlertRow(stop, travelKey) {
  if (!getAlertPref("reservations")) return null
  if (stop.type !== "reserved" || !stop.time) return null
  const walkMins = getWalkMins(travelKey)
  const getReadyMins = walkMins + 15
  const leaveMins = walkMins + 5
  const getReadyTime = subtractTime(stop.time, getReadyMins)
  const leaveTime = subtractTime(stop.time, leaveMins)
  const travelNote = walkMins > 0 ? " (" + walkMins + " min walk)" : ""
  return alertRow("🔔", "Get ready " + getReadyTime + ", leave " + leaveTime + " — " + stop.name + " at " + stop.time + travelNote, "alertReservation")
}

function tipAlertRow(stop) {
  if (!stop.alertNote) return null
  return alertRow("💡", (stop.icon || "") + " " + stop.name + " — " + stop.alertNote, "alertTip")
}

function leaveNowAlertRow(stop, travelKey) {
  if (!getAlertPref("leaveNow")) return null
  if (!stop.time) return null
  if (stop.type === "reserved") return null
  const walkMins = getWalkMins(travelKey)
  if (walkMins === 0) return null
  const leaveTime = subtractTime(stop.time, walkMins + 5)
  const times = travelTimes[travelKey]
  return alertRow("🚶", "Leave by " + leaveTime + " (" + times.walk + " walk to arrive by " + stop.time + ")", "alertLeave")
}

function sunsetAlertRow(stop) {
  if (!getAlertPref("sunset")) return null
  const text = (stop.note || "") + " " + (stop.name || "")
  if (!/sunset|rooftop|skyline|golden/i.test(text)) return null
  return alertRow("🌅", "Golden hour ~6:25pm — head here for sunset at ~7:10pm", "alertSunset")
}

function subtractTime(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number)
  let total = h * 60 + m - mins
  if (total < 0) total += 1440
  const rh = Math.floor(total / 60)
  const rm = total % 60
  return String(rh).padStart(2, "0") + ":" + String(rm).padStart(2, "0")
}

// --- Main render ---

function daySummaryRow(dayIndex, effective) {
  const stopCount = effective.length
  const reserved = effective.filter(e => e.stop.type === "reserved" && e.stop.time)
  const doneCount = effective.filter(e => state.done[e.key]).length

  const parts = []
  parts.push(stopCount + " stop" + (stopCount !== 1 ? "s" : ""))
  if (doneCount > 0) parts.push(doneCount + " done")

  // Total walking distance if travel times loaded
  let totalMeters = 0
  let hasAnyDist = false
  const keys = []
  keys.push(dayIndex + "-h0")
  for (let i = 0; i < effective.length - 1; i++) keys.push(dayIndex + "-e" + i)
  keys.push(dayIndex + "-h1")
  keys.forEach(k => {
    const t = travelTimes[k]
    if (t && t.walkDist) {
      hasAnyDist = true
      const match = t.walkDist.match(/([\d.]+)\s*km/i)
      if (match) totalMeters += parseFloat(match[1]) * 1000
      const miMatch = t.walkDist.match(/([\d.]+)\s*mi/i)
      if (miMatch) totalMeters += parseFloat(miMatch[1]) * 1609
    }
  })
  if (hasAnyDist && totalMeters > 0) {
    parts.push("🚶 " + (totalMeters / 1000).toFixed(1) + " km")
  }

  reserved.forEach(e => {
    parts.push((e.stop.icon || "") + " " + e.stop.time + " " + e.stop.name)
  })

  const summaryText = el("div", { className: "daySummaryText" }, parts.join("  ·  "))

  return el("div", { className: "daySummary" }, summaryText)
}

function render() {
  if (!data || !data.days || !data.days.length) return
  const day = data.days[state.day]
  if (!day) return
  const hotel = getHotel(day.date)

  document.getElementById("title").innerText = day.title
  document.getElementById("menuHotel").lastChild.textContent = " Back to " + hotel.name
  document.getElementById("menuVersion").textContent = "v" + APP_VERSION
  applyCompact()
  renderCarousel()

  const mapContainer = document.getElementById("routeMapContainer")
  const mapNode = routeCard(state.day)
  if (mapContainer.firstChild !== mapNode) {
    mapContainer.replaceChildren(mapNode)
  }

  const nodes = []
  const compact = isCompact(state.day)
  const effective = getEffectiveStops(state.day)
  const nextUpIdx = getNextUpIndex(state.day, effective)

  // Day summary
  nodes.push(daySummaryRow(state.day, effective))

  // Weather alert banner
  if (!compact) {
    const wxRow = weatherAlertRow(state.day)
    if (wxRow) nodes.push(wxRow)
  }

  // Inbound flight card (before hotel)
  const flights = getFlights(day.date)
  const inbound = flights.find(f => f.direction === "inbound")
  const outbound = flights.find(f => f.direction === "outbound")
  if (inbound) nodes.push(flightRow(inbound))

  nodes.push(hotelRow(hotel.name, hotel.address))

  if (!compact && effective.length) {
    nodes.push(travelRow(hotel, effective[0].stop, state.day + "-h0"))
  }

  effective.forEach((entry, ei) => {
    // Alert rows before each stop
    if (!compact) {
      const tKey = ei === 0 ? state.day + "-h0" : state.day + "-e" + (ei - 1)
      const resRow = reservationAlertRow(entry.stop, tKey)
      if (resRow) nodes.push(resRow)
      const leaveRow = leaveNowAlertRow(entry.stop, tKey)
      if (leaveRow) nodes.push(leaveRow)
      const sunRow = sunsetAlertRow(entry.stop)
      if (sunRow) nodes.push(sunRow)
      const tipRow = tipAlertRow(entry.stop)
      if (tipRow) nodes.push(tipRow)
    }

    nodes.push(stopCard(entry, ei, state.day, nextUpIdx, effective.length))
    if (!compact && ei < effective.length - 1) {
      nodes.push(travelRow(entry.stop, effective[ei + 1].stop, state.day + "-e" + ei))
    }
  })

  if (effective.length) {
    const lastStop = effective[effective.length - 1].stop
    if (!compact) nodes.push(travelRow(lastStop, hotel, state.day + "-h1"))
    nodes.push(hotelRow(hotel.name, hotel.address))
    if (outbound) nodes.push(flightRow(outbound))
  }

  // Stagger card reveal animations
  let cardIdx = 0
  nodes.forEach(n => {
    if (n.classList && n.classList.contains("stop")) {
      n.style.animationDelay = (cardIdx * 0.04) + "s"
      cardIdx++
    }
  })

  document.getElementById("stops").replaceChildren(...nodes)
  saveState()
  fetchTravelTimes()
}

function setStop(i) {
  if (i === state.stop) return
  if (navigator.vibrate) navigator.vibrate(6)
  state.stop = i
  render()
  document.querySelector(".stop.active")?.scrollIntoView({ behavior: "smooth", block: "center" })
}

// --- Day navigation ---

function switchDay(fn) {
  const stops = document.getElementById("stops")
  stops.style.opacity = "0"
  stops.style.transform = "translateY(8px)"
  setTimeout(() => {
    fn()
    stops.style.opacity = ""
    stops.style.transform = ""
  }, 120)
}

function prevDay() {
  if (state.day > 0) {
    switchDay(() => { state.day--; state.stop = 0; loadWeather(); render() })
  }
}

function nextDay() {
  if (state.day < data.days.length - 1) {
    switchDay(() => { state.day++; state.stop = 0; loadWeather(); render() })
  }
}

// --- Swipe ---

let startX = 0, startY = 0, startTime = 0, swiping = false

// --- Keyboard navigation ---

document.addEventListener("keydown", e => {
  // Escape closes the topmost open sheet
  if (e.key === "Escape") {
    const closers = [
      ["searchSheet", closeSearch],
      ["guidesSheet", closeGuides],
      ["currencySheet", closeCurrency],
      ["emergencySheet", closeEmergency],
      ["subwayMapSheet", closeSubwayMap],
      ["settingsSheet", closeSettings],
      ["addPlaceSheet", closeAddPlace],
      ["removedSheet", closeRemoved],
      ["tripEditorSheet", closeTripEditor]
    ]
    for (const [id, fn] of closers) {
      if (document.getElementById(id)?.classList.contains("open")) { fn(); return }
    }
    if (document.getElementById("menu")?.classList.contains("open")) { closeMenu(); return }
    return
  }

  // Skip if focused on an input/textarea/select
  const tag = document.activeElement?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
  // Skip if any sheet is open
  if (document.querySelector(".open[id$='Sheet']")) return
  if (e.key === "ArrowLeft") { e.preventDefault(); prevDay() }
  else if (e.key === "ArrowRight") { e.preventDefault(); nextDay() }
})

// --- Collapsing header + scroll-to-top on scroll ---
;(function initScrollEffects() {
  const header = document.querySelector("header")
  const scrollBtn = document.getElementById("scrollTopBtn")
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark"
  let ticking = false
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY
        const scrolled = y > 30
        header.classList.toggle("scrolled", scrolled)
        if (scrollBtn) scrollBtn.classList.toggle("visible", y > 300)
        if (themeMeta) themeMeta.setAttribute("content", scrolled ? (isDark() ? "#0a0a0a" : "#f0ebe0") : (isDark() ? "#111" : "#fffdf6"))
        ticking = false
      })
      ticking = true
    }
  }, { passive: true })

  document.getElementById("title").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  })
})()

document.addEventListener("touchstart", e => {
  // Don't start a swipe from interactive elements
  const tag = e.target.closest("button, a, input, select, textarea, .removeBtn, .expandBtn, .doneBtn")
  if (tag) { swiping = false; return }
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  startTime = Date.now()
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
  const elapsed = Date.now() - startTime
  // Require 100px minimum distance and at least 80ms to avoid accidental flicks
  if (Math.abs(dx) < 100 || elapsed < 80) return
  if (navigator.vibrate) navigator.vibrate(12)
  if (dx < 0) nextDay()
  else prevDay()
})

// --- Menu ---

function toggleMenu() {
  const menu = document.getElementById("menu")
  menu.classList.toggle("open")
  document.getElementById("menuOverlay").classList.toggle("show")
  const btn = document.getElementById("menuToggleBtn")
  if (btn) btn.setAttribute("aria-expanded", menu.classList.contains("open"))
}

function closeMenu() {
  document.getElementById("menu").classList.remove("open")
  document.getElementById("menuOverlay").classList.remove("show")
  const btn = document.getElementById("menuToggleBtn")
  if (btn) btn.setAttribute("aria-expanded", "false")
}

function returnHotel() {
  closeMenu()
  const hotel = getHotel(data.days[state.day].date)
  window.open("https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(hotel.address))
}


// --- Subway map viewer (pan + pinch zoom) ---

let subwayZoom = { scale: 1, x: 0, y: 0 }
let subwayDrag = null
let subwayPinch = null

function openSubwayMap() {
  closeMenu()
  resetSubwayZoom()
  document.getElementById("subwayMapSheet").classList.add("open")
  document.getElementById("subwayMapOverlay").classList.add("show")

  const content = document.getElementById("subwayMapContent")
  const img = document.getElementById("subwayMapImg")

  // Lazy-load: set src from data-src on first open
  if (!img.src && img.dataset.src) img.src = img.dataset.src

  // Fit map to viewport on open
  const fitMap = () => {
    const cw = content.clientWidth
    const ch = content.clientHeight
    const iw = img.naturalWidth || 2500
    const ih = img.naturalHeight || 2700
    subwayZoom.scale = Math.min(cw / iw, ch / ih)
    subwayZoom.x = (cw - iw * subwayZoom.scale) / 2
    subwayZoom.y = (ch - ih * subwayZoom.scale) / 2
    applySubwayTransform()
  }

  if (img.naturalWidth) fitMap()
  else img.onload = fitMap
}

function closeSubwayMap() {
  document.getElementById("subwayMapSheet").classList.remove("open")
  document.getElementById("subwayMapOverlay").classList.remove("show")
}

function resetSubwayZoom() {
  const content = document.getElementById("subwayMapContent")
  const img = document.getElementById("subwayMapImg")
  if (!content || !img) return
  const cw = content.clientWidth
  const ch = content.clientHeight
  const iw = img.naturalWidth || 2500
  const ih = img.naturalHeight || 2700
  subwayZoom.scale = Math.min(cw / iw, ch / ih)
  subwayZoom.x = (cw - iw * subwayZoom.scale) / 2
  subwayZoom.y = (ch - ih * subwayZoom.scale) / 2
  applySubwayTransform()
}

function applySubwayTransform() {
  const img = document.getElementById("subwayMapImg")
  if (img) img.style.transform = "translate(" + subwayZoom.x + "px," + subwayZoom.y + "px) scale(" + subwayZoom.scale + ")"
}

function pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function pinchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("subwayMapContent")
  if (!content) return

  content.addEventListener("touchstart", e => {
    if (!document.getElementById("subwayMapSheet").classList.contains("open")) return
    if (e.touches.length === 2) {
      e.preventDefault()
      subwayPinch = { dist: pinchDist(e.touches), scale: subwayZoom.scale, center: pinchCenter(e.touches) }
      subwayDrag = null
    } else if (e.touches.length === 1) {
      subwayDrag = { x: e.touches[0].clientX - subwayZoom.x, y: e.touches[0].clientY - subwayZoom.y }
      subwayPinch = null
    }
  }, { passive: false })

  content.addEventListener("touchmove", e => {
    if (!document.getElementById("subwayMapSheet").classList.contains("open")) return
    e.preventDefault()
    if (e.touches.length === 2 && subwayPinch) {
      const newDist = pinchDist(e.touches)
      const center = pinchCenter(e.touches)
      const rect = content.getBoundingClientRect()
      const cx = center.x - rect.left
      const cy = center.y - rect.top
      const newScale = Math.min(Math.max(subwayPinch.scale * (newDist / subwayPinch.dist), 0.3), 8)
      const ratio = newScale / subwayZoom.scale
      subwayZoom.x = cx - (cx - subwayZoom.x) * ratio
      subwayZoom.y = cy - (cy - subwayZoom.y) * ratio
      subwayZoom.scale = newScale
      applySubwayTransform()
    } else if (e.touches.length === 1 && subwayDrag) {
      subwayZoom.x = e.touches[0].clientX - subwayDrag.x
      subwayZoom.y = e.touches[0].clientY - subwayDrag.y
      applySubwayTransform()
    }
  }, { passive: false })

  content.addEventListener("touchend", e => {
    if (e.touches.length < 2) subwayPinch = null
    if (e.touches.length < 1) subwayDrag = null
  })

  // Mouse wheel zoom for desktop
  content.addEventListener("wheel", e => {
    if (!document.getElementById("subwayMapSheet").classList.contains("open")) return
    e.preventDefault()
    const rect = content.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(subwayZoom.scale * factor, 0.3), 8)
    const ratio = newScale / subwayZoom.scale
    subwayZoom.x = cx - (cx - subwayZoom.x) * ratio
    subwayZoom.y = cy - (cy - subwayZoom.y) * ratio
    subwayZoom.scale = newScale
    applySubwayTransform()
  }, { passive: false })

  // Mouse drag for desktop
  let mouseDrag = null
  content.addEventListener("mousedown", e => {
    if (!document.getElementById("subwayMapSheet").classList.contains("open")) return
    mouseDrag = { x: e.clientX - subwayZoom.x, y: e.clientY - subwayZoom.y }
    content.style.cursor = "grabbing"
  })
  window.addEventListener("mousemove", e => {
    if (!mouseDrag) return
    subwayZoom.x = e.clientX - mouseDrag.x
    subwayZoom.y = e.clientY - mouseDrag.y
    applySubwayTransform()
  })
  window.addEventListener("mouseup", () => {
    mouseDrag = null
    if (content) content.style.cursor = ""
  })
})

// --- Currency converter ---

function openCurrency() {
  closeMenu()
  const input = document.getElementById("currencyInput")
  const result = document.getElementById("currencyResult")
  input.value = ""
  result.textContent = ""
  fetchExchangeRate()
  document.getElementById("currencySheet").classList.add("open")
  document.getElementById("currencyOverlay").classList.add("show")
  setTimeout(() => input.focus(), 100)
}

function closeCurrency() {
  document.getElementById("currencySheet").classList.remove("open")
  document.getElementById("currencyOverlay").classList.remove("show")
}

let exchangeRate = null
let currencyDir = "gbp-usd"

function fetchExchangeRate() {
  if (exchangeRate) return
  fetch("https://open.er-api.com/v6/latest/GBP")
    .then(r => r.json())
    .then(d => {
      if (d.rates && d.rates.USD) {
        exchangeRate = d.rates.USD
        document.getElementById("currencyRate").textContent = "1 GBP = " + exchangeRate.toFixed(4) + " USD"
      }
    })
    .catch(() => {
      document.getElementById("currencyRate").textContent = "Rate unavailable (offline)"
    })
}

function convertCurrency() {
  const input = document.getElementById("currencyInput")
  const result = document.getElementById("currencyResult")
  const val = parseFloat(input.value)
  if (isNaN(val) || !exchangeRate) {
    result.textContent = ""
    return
  }
  if (currencyDir === "gbp-usd") {
    result.textContent = "$" + (val * exchangeRate).toFixed(2) + " USD"
  } else {
    result.textContent = "\u00a3" + (val / exchangeRate).toFixed(2) + " GBP"
  }
}

function flipCurrency() {
  currencyDir = currencyDir === "gbp-usd" ? "usd-gbp" : "gbp-usd"
  document.getElementById("currencyFromLabel").textContent = currencyDir === "gbp-usd" ? "GBP" : "USD"
  convertCurrency()
}

// --- Phones (overridable via settings) ---

function getPhone(key) {
  const defaults = { law: "447956801171" }
  return localStorage.getItem("nyc-phone-" + key) || defaults[key] || ""
}

function formatPhoneNumber(raw) {
  const d = raw.replace(/\D/g, "")
  // UK mobile: 44 7xxx xxxxxx → +44 7xxx xxxxxx
  if (d.startsWith("44") && d.length >= 4) {
    const rest = d.slice(2)
    return "+44 " + rest.replace(/(\d{4})(\d{0,6})/, "$1 $2").trim()
  }
  // US: 1 xxx xxx xxxx → +1 xxx xxx xxxx
  if (d.startsWith("1") && d.length >= 2) {
    const rest = d.slice(1)
    return "+1 " + rest.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" ")
    ).trim()
  }
  // Fallback: just add + prefix and group in fours
  if (d.length > 0) return "+" + d.replace(/(\d{4})(?=\d)/g, "$1 ")
  return ""
}

function formatPhoneInput(input) {
  const pos = input.selectionStart
  const before = input.value
  // Count digits before cursor to restore position after formatting
  const digitsBefore = before.slice(0, pos).replace(/\D/g, "").length
  const formatted = formatPhoneNumber(before)
  if (formatted !== before) {
    input.value = formatted
    // Find position in formatted string after same number of digits
    let newPos = 0, count = 0
    for (let i = 0; i < formatted.length && count < digitsBefore; i++) {
      newPos = i + 1
      if (/\d/.test(formatted[i])) count++
    }
    input.setSelectionRange(newPos, newPos)
  }
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
  document.getElementById("starPaw").classList.toggle("active", user === "PAW")
  document.getElementById("starLaw").classList.toggle("active", user === "LAW")
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
    window.location.href = url
  }, err => {
    const reasons = {1: "Permission denied", 2: "Position unavailable", 3: "Timed out"}
    if (confirm("Could not get location: " + (reasons[err.code] || "Unknown error") + "\n\nCheck your browser/device location permissions.\n\nOpen Settings?")) {
      openSettings()
    }
  }, {enableHighAccuracy: false, timeout: 10000})
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
    { label: "🏥 Nearest ER", value: "Search", href: "https://www.google.com/maps/search/emergency+room+near+me" },
    { label: "🛡️ Travel Insurance", value: "Policy Portal", href: "https://travel-portal.switchedoninsurance.com/policies" }
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
  document.getElementById("starPaw").classList.toggle("active", user === "PAW")
  document.getElementById("starLaw").classList.toggle("active", user === "LAW")
  document.getElementById("pawPhoneInput").value = formatPhoneNumber(getPhone("paw"))
  document.getElementById("lawPhoneInput").value = formatPhoneNumber(getPhone("law"))
  const tempUnit = getTempUnit()
  document.getElementById("tempF").classList.toggle("active", tempUnit === "fahrenheit")
  document.getElementById("tempC").classList.toggle("active", tempUnit === "celsius")
  const theme = getTheme()
  document.getElementById("themeLight").classList.toggle("active", theme === "light")
  document.getElementById("themeDark").classList.toggle("active", theme === "dark")
  document.getElementById("themeSystem").classList.toggle("active", theme === "system")
  document.getElementById("gmapsKeyInput").value = localStorage.getItem("nyc-gmaps-key") || ""
  initAlertSettings()
  document.getElementById("settingsVersion").textContent = "v" + APP_VERSION
  document.getElementById("settingsSheet").classList.add("open")
  document.getElementById("settingsOverlay").classList.add("show")
}

function saveGmapsKey() {
  const key = document.getElementById("gmapsKeyInput").value.trim()
  if (key) localStorage.setItem("nyc-gmaps-key", key)
  else localStorage.removeItem("nyc-gmaps-key")
  travelTimes = {}
  mapCache = {}
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

// --- Trip Editor ---

const TE_STORAGE_KEY = "nyc-trip-edits"
let teStopFilter = "reserved"
const teCollapsed = {}

function teSection(id, titleText) {
  const body = el("div", { className: "te-section-body" })
  if (teCollapsed[id]) body.style.display = "none"
  const chevron = teCollapsed[id] ? "▸" : "▾"
  const title = el("div", {
    className: "te-section-title",
    style: "cursor:pointer;display:flex;justify-content:space-between;align-items:center",
    onclick: () => {
      teCollapsed[id] = !teCollapsed[id]
      body.style.display = teCollapsed[id] ? "none" : ""
      title.lastChild.textContent = teCollapsed[id] ? "▸" : "▾"
    }
  }, titleText, el("span", { style: "font-size:18px;color:var(--gold)" }, chevron))
  const section = el("div", { className: "te-section" }, title, body)
  return { section, body }
}

function loadTripEdits() {
  try { return JSON.parse(localStorage.getItem(TE_STORAGE_KEY)) || {} } catch { return {} }
}

function saveTripEdits(edits) {
  localStorage.setItem(TE_STORAGE_KEY, JSON.stringify(edits))
}

function applyTripEdits() {
  const edits = loadTripEdits()
  if (edits.hotels) {
    edits.hotels.forEach((h, i) => {
      if (!h || !data.hotels[i]) return
      if (h.name != null) data.hotels[i].name = h.name
      if (h.address != null) data.hotels[i].address = h.address
      if (h.from != null) data.hotels[i].from = h.from
    })
  }
  if (edits.days) {
    Object.keys(edits.days).forEach(di => {
      const d = data.days[parseInt(di)]
      if (!d) return
      if (edits.days[di].title != null) d.title = edits.days[di].title
    })
  }
  // Apply stop edits (new unified key) and legacy reservation edits
  const stopEdits = { ...(edits.reservations || {}), ...(edits.stops || {}) }
  Object.keys(stopEdits).forEach(key => {
    const [di, si] = key.split("-").map(Number)
    const stop = data.days[di]?.stops[si]
    if (!stop) return
    const e = stopEdits[key]
    if (e.time != null) stop.time = e.time
    if (e.note != null) stop.note = e.note
    if (e.name != null) stop.name = e.name
    if (e.icon != null) stop.icon = e.icon
  })
}

function openTripEditor() {
  closeMenu()
  teStopFilter = "reserved"
  renderTripEditor()
  document.getElementById("tripEditorSheet").classList.add("open")
  document.getElementById("tripEditorOverlay").classList.add("show")
}

function closeTripEditor() {
  document.getElementById("tripEditorSheet").classList.remove("open")
  document.getElementById("tripEditorOverlay").classList.remove("show")
}

function renderTripEditor() {
  const container = document.getElementById("tripEditorContent")
  container.replaceChildren()

  // 1. Hotels
  const { section: hotelsSection, body: hotelsBody } = teSection("hotels", "🏨 Hotels")
  data.hotels.forEach((hotel, i) => {
    const card = el("div", { className: "te-card" },
      el("div", { className: "te-card-header" }, hotel.name),
      el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Name"),
        createTeInput("text", hotel.name, v => teUpdateHotel(i, "name", v))
      ),
      el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Address"),
        createTeInput("text", hotel.address, v => teUpdateHotel(i, "address", v))
      ),
      el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Check-in Date"),
        createTeInput("date", hotel.from, v => teUpdateHotel(i, "from", v))
      )
    )
    hotelsBody.append(card)
  })
  container.append(hotelsSection)

  // 2. Phones & Identity
  const { section: phonesSection, body: phonesBody } = teSection("phones", "📱 Phones & Identity")
  const user = getUser()
  ;["PAW", "LAW"].forEach(who => {
    const key = who.toLowerCase()
    const isActive = user === who
    const starBtn = el("button", {
      className: "starBtn" + (isActive ? " active" : ""),
      "aria-label": "I am " + who,
      onClick: () => {
        setUser(who)
        document.querySelectorAll("#tripEditorContent .starBtn").forEach(b => b.classList.remove("active"))
        starBtn.classList.add("active")
      }
    }, "★")
    const labelRow = el("div", { className: "te-card-header" },
      el("span", null, who),
      starBtn
    )
    const phoneInput = el("input", { type: "tel", placeholder: "+44 7700 900000", value: formatPhoneNumber(getPhone(key)) })
    phoneInput.addEventListener("input", () => {
      formatPhoneInput(phoneInput)
      const digits = phoneInput.value.replace(/\D/g, "")
      if (digits) localStorage.setItem("nyc-phone-" + key, digits)
      else localStorage.removeItem("nyc-phone-" + key)
    })
    const card = el("div", { className: "te-card" }, labelRow,
      el("div", { className: "te-field" }, phoneInput)
    )
    phonesBody.append(card)
  })
  container.append(phonesSection)

  // 3. Stops (All / Reserved filter)
  const { section: stopsSection, body: stopsBody } = teSection("stops", "📍 Stops")

  const filterToggle = el("div", { className: "settingsToggle te-filter" })
  const btnReserved = el("button", {
    className: "toggleBtn" + (teStopFilter === "reserved" ? " active" : ""),
    onClick: () => { teStopFilter = "reserved"; renderTripEditor() }
  }, "Reserved")
  const btnAll = el("button", {
    className: "toggleBtn" + (teStopFilter === "all" ? " active" : ""),
    onClick: () => { teStopFilter = "all"; renderTripEditor() }
  }, "All Stops")
  filterToggle.append(btnReserved, btnAll)
  stopsBody.append(filterToggle)

  data.days.forEach((day, di) => {
    const stops = day.stops.filter(s => teStopFilter === "all" || s.type === "reserved")
    if (!stops.length) return
    stopsBody.append(el("div", { className: "te-day-sub" }, teDayLabel(day.date) + " — " + day.title))
    stops.forEach(stop => {
      const si = day.stops.indexOf(stop)
      const isReserved = stop.type === "reserved"
      const fields = []
      // Icon + Name row
      fields.push(el("div", { className: "te-field-row" },
        el("div", { className: "te-field", style: "flex:0 0 60px" },
          el("div", { className: "te-field-label" }, "Icon"),
          createTeInput("text", stop.icon || "", v => teUpdateStop(di, si, "icon", v))
        ),
        el("div", { className: "te-field" },
          el("div", { className: "te-field-label" }, "Name"),
          createTeInput("text", stop.name, v => teUpdateStop(di, si, "name", v))
        )
      ))
      // Time (reserved only)
      if (isReserved) {
        fields.push(el("div", { className: "te-field" },
          el("div", { className: "te-field-label" }, "Time"),
          createTeInput("time", stop.time || "", v => teUpdateStop(di, si, "time", v))
        ))
      }
      // Address (read-only)
      fields.push(el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Address"),
        el("div", { className: "te-readonly" }, stop.address)
      ))
      // Note
      fields.push(el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Note"),
        createTeTextarea(stop.note || "", v => teUpdateStop(di, si, "note", v))
      ))
      const card = el("div", { className: "te-card" },
        el("div", { className: "te-card-header" }, (stop.icon || "📍") + " " + stop.name),
        ...fields
      )
      stopsBody.append(card)
    })
  })
  container.append(stopsSection)

  // 4. Day Titles
  const { section: daysSection, body: daysBody } = teSection("days", "📅 Day Titles")
  data.days.forEach((day, di) => {
    const dayLabel = teDayLabel(day.date)
    const card = el("div", { className: "te-card" },
      el("div", { className: "te-card-header" }, dayLabel),
      el("div", { className: "te-field" },
        el("div", { className: "te-field-label" }, "Title"),
        createTeInput("text", day.title, v => teUpdateDay(di, "title", v))
      )
    )
    daysBody.append(card)
  })
  container.append(daysSection)

  // 5. User Notes Overview
  const { section: notesSection, body: notesBody } = teSection("notes", "📝 Your Notes")
  const noteKeys = Object.keys(state.userNotes || {}).filter(k => state.userNotes[k])
  if (noteKeys.length === 0) {
    notesBody.append(el("div", { className: "te-empty" }, "No notes yet. Tap any stop to add a note."))
  } else {
    noteKeys.forEach(key => {
      const parts = key.split("-")
      const di = parseInt(parts[0])
      const day = data.days[di]
      if (!day) return
      let stopName = "Unknown", stopIcon = "📍"
      if (parts[1] === "a") {
        // Added stop
        const ai = parseInt(parts[2])
        const added = (state.added[di] || [])[ai]
        if (added) { stopName = added.name; stopIcon = added.icon || "📍" }
      } else {
        const si = parseInt(parts[1])
        const stop = getStop(di, si)
        if (stop) { stopName = stop.name; stopIcon = stop.icon || "📍" }
      }
      const card = el("div", { className: "te-card" },
        el("div", { className: "te-card-header" }, stopIcon + " " + stopName + " — " + teDayLabel(day.date)),
        el("div", { className: "te-field" },
          createTeTextarea(state.userNotes[key], v => {
            saveUserNote(key, v)
          })
        )
      )
      notesBody.append(card)
    })
  }
  container.append(notesSection)

  // Reset
  const resetBtn = el("button", { className: "te-reset-btn", onClick: resetTripEdits }, "Reset All Edits")
  container.append(resetBtn)
}

function teDayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00")
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return days[d.getDay()] + " " + d.getDate() + " " + months[d.getMonth()]
}

function createTeInput(type, value, onChange) {
  const input = el("input", { type: type, value: value || "" })
  let timer
  input.addEventListener("input", () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onChange(input.value)
      render()
    }, 400)
  })
  return input
}

function createTeTextarea(value, onChange) {
  const ta = el("textarea", { rows: "2" })
  ta.value = value || ""
  let timer
  ta.addEventListener("input", () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onChange(ta.value)
      render()
    }, 400)
  })
  return ta
}

function teUpdateHotel(index, field, value) {
  const edits = loadTripEdits()
  if (!edits.hotels) edits.hotels = []
  // Fill gaps so JSON serialisation doesn't create nulls
  for (let j = edits.hotels.length; j <= index; j++) edits.hotels[j] = {}
  edits.hotels[index][field] = value
  saveTripEdits(edits)
  data.hotels[index][field] = value
}

function teUpdateStop(dayIndex, stopIndex, field, value) {
  const edits = loadTripEdits()
  if (!edits.stops) edits.stops = {}
  const key = dayIndex + "-" + stopIndex
  if (!edits.stops[key]) edits.stops[key] = {}
  edits.stops[key][field] = value
  saveTripEdits(edits)
  data.days[dayIndex].stops[stopIndex][field] = value
}

function teUpdateDay(dayIndex, field, value) {
  const edits = loadTripEdits()
  if (!edits.days) edits.days = {}
  if (!edits.days[dayIndex]) edits.days[dayIndex] = {}
  edits.days[dayIndex][field] = value
  saveTripEdits(edits)
  data.days[dayIndex][field] = value
}

function resetTripEdits() {
  if (!confirm("Reset all trip edits? This will reload the original data.")) return
  localStorage.removeItem(TE_STORAGE_KEY)
  closeTripEditor()
  forceReload()
}

function forceReload() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .then(() => caches.keys())
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => location.reload())
      .catch(() => location.reload())
  } else {
    location.reload()
  }
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
    if (!day) return
    const hotel = getHotel(day.date)
    const effective = getEffectiveStops(dayIndex)

    if (!effective.length) return

    // Build pairs: hotel->first, stop->stop, last->hotel
    const pairs = []
    pairs.push({ a: hotel, b: effective[0].stop, key: dayIndex + "-h0" })
    for (let i = 0; i < effective.length - 1; i++) {
      pairs.push({ a: effective[i].stop, b: effective[i + 1].stop, key: dayIndex + "-e" + i })
    }
    pairs.push({ a: effective[effective.length - 1].stop, b: hotel, key: dayIndex + "-h1" })

    const modes = [["WALKING", "walk"], ["TRANSIT", "transit"], ["DRIVING", "drive"]]

    // Skip entirely if all pairs already have all modes cached
    const allCached = pairs.every(({ key }) => travelTimes[key]?.walk && travelTimes[key]?.transit && travelTimes[key]?.drive)
    if (allCached) return

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
            if (localKey === "walk") travelTimes[key].walkDist = res.rows[0].elements[0].distance.text
            clearTimeout(travelRenderTimer)
            travelRenderTimer = setTimeout(() => { mapCache = {}; render() }, 200)
          }
        })
      })
    })
  }).catch(e => { if (e && e.name !== "AbortError") console.warn(e) })
}

// --- Explore sheet (browse + swap) ---

let exploreFilter = new Set() // empty = all shown
let exploreDistances = {}
let exploreOriginLabel = ""
let exploreOriginMode = "auto" // "auto" (geo then fallback), "geo", "stop"
let exploreRenderTimer = null

function openGuides() {
  closeMenu()
  swapTarget = null
  exploreFilter = new Set()
  exploreDistances = {}
  exploreOriginLabel = ""
  exploreOriginMode = "auto"
  showExploreSheet()
}

function openSwap(stopIndex) {
  swapTarget = stopIndex
  exploreFilter = new Set()
  exploreDistances = {}
  exploreOriginLabel = ""
  exploreOriginMode = "auto"
  showExploreSheet()
}

function showExploreSheet() {
  renderExploreFilters()
  renderExplore()
  document.getElementById("guidesSheet").classList.add("open")
  document.getElementById("guidesOverlay").classList.add("show")
  fetchExploreDistances()
}

function closeGuides() {
  document.getElementById("guidesSheet").classList.remove("open")
  document.getElementById("guidesOverlay").classList.remove("show")
  swapTarget = null
}

function getExploreItems() {
  const items = []
  data.guides.forEach(guide => {
    guide.items.forEach(item => {
      items.push({
        name: item.name,
        note: item.note,
        address: item.address,
        icon: item.icon || guide.icon,
        category: guide.title,
        tag: item.tag || null,
        price: item.price || null,
        flatIndex: items.length
      })
    })
  })
  return items
}

function isAllFilters() {
  return exploreFilter.size === 0
}

function toggleFilter(cat) {
  if (isAllFilters()) {
    // From "All" mode, tapping a chip enters filter mode with just that category
    exploreFilter = new Set([cat])
  } else if (exploreFilter.has(cat)) {
    exploreFilter.delete(cat)
    // If none left, go back to "All"
    if (exploreFilter.size === 0) exploreFilter = new Set()
  } else {
    exploreFilter.add(cat)
  }
  renderExploreFilters()
  renderExplore()
}

function renderExploreFilters() {
  const container = document.getElementById("guidesFilters")
  const cats = data.guides.map(g => ({ title: g.title, icon: g.icon }))
  const allOn = isAllFilters()
  const chips = []

  chips.push(el("button", {
    className: "filterChip" + (allOn ? " active" : ""),
    title: "All",
    onclick: () => { exploreFilter = new Set(); renderExploreFilters(); renderExplore() }
  }, "All"))

  cats.forEach(cat => {
    const isOn = !allOn && exploreFilter.has(cat.title)
    const chip = el("button", {
      className: "filterChip filterChip-icon" + (isOn ? " active" : ""),
      title: cat.title,
      onclick: () => toggleFilter(cat.title)
    }, cat.icon)
    let pressTimer = null
    let tooltip = null
    const showTooltip = (e) => {
      e.preventDefault()
      if (tooltip) return
      tooltip = el("div", { className: "chipTooltip" }, cat.title)
      chip.appendChild(tooltip)
      setTimeout(() => { if (tooltip) { tooltip.remove(); tooltip = null } }, 1500)
    }
    chip.addEventListener("touchstart", (e) => { pressTimer = setTimeout(() => showTooltip(e), 400) }, { passive: false })
    chip.addEventListener("touchend", () => { clearTimeout(pressTimer); setTimeout(() => { if (tooltip) { tooltip.remove(); tooltip = null } }, 300) })
    chip.addEventListener("touchcancel", () => { clearTimeout(pressTimer) })
    chips.push(chip)
  })

  container.replaceChildren(...chips)
}

function cycleExploreOrigin() {
  if (swapTarget != null) return
  if (exploreOriginLabel === "You") {
    // Currently GPS — switch to selected stop
    exploreOriginMode = "stop"
  } else {
    // Currently a stop — switch to GPS
    exploreOriginMode = "geo"
  }
  exploreDistances = {}
  fetchExploreDistances()
  renderExplore()
}

function renderExplore() {
  const container = document.getElementById("guidesContent")
  const headerEl = document.getElementById("guidesTitle")
  const originBtn = document.getElementById("guidesOriginBtn")
  const nearbyBtn = document.getElementById("guidesNearbyBtn")

  if (swapTarget != null) {
    const original = data.days[state.day].stops[swapTarget]
    headerEl.textContent = "Swap"
    originBtn.textContent = ""
    originBtn.innerHTML = SVG_PIN
    originBtn.append(" from " + (original.icon || "") + " " + original.name)
    originBtn.style.display = ""
    originBtn.dataset.swapMode = "1"
    originBtn.style.cursor = "default"
    nearbyBtn.style.display = "none"
  } else {
    headerEl.textContent = "\u2605"
    originBtn.dataset.swapMode = ""
    originBtn.style.cursor = ""
    const nearbyOn = !isAllFilters() && exploreFilter.has("__nearby__")
    nearbyBtn.style.display = ""
    nearbyBtn.classList.toggle("active", nearbyOn)
    if (exploreOriginLabel) {
      const isGeo = exploreOriginLabel === "You"
      originBtn.textContent = ""
      originBtn.innerHTML = isGeo ? SVG_GPS : SVG_PIN
      originBtn.append(" " + exploreOriginLabel)
      originBtn.title = isGeo ? "From your location — tap for selected stop" : "From " + exploreOriginLabel + " — tap for your location"
      originBtn.style.display = ""
    } else {
      originBtn.style.display = "none"
    }
  }

  let items = getExploreItems()
  const allOn = isAllFilters()

  // If "Around Me" filter is active alone, show nearby Google Maps links
  if (!allOn && exploreFilter.has("__nearby__") && exploreFilter.size === 1) {
    const nearbyItems = [
      { icon: "\u2615", label: "Coffee", search: "coffee+near+me" },
      { icon: "\uD83C\uDF7D", label: "Food & Restaurants", search: "food+near+me" },
      { icon: "\uD83C\uDF55", label: "Pizza", search: "pizza+near+me" },
      { icon: "\uD83C\uDF78", label: "Bars & Cocktails", search: "bars+near+me" },
      { icon: "\uD83D\uDECD", label: "Shopping", search: "shopping+near+me" },
      { icon: "\uD83C\uDFEA", label: "Grocery & Bodega", search: "grocery+store+near+me" },
      { icon: "\uD83D\uDEBB", label: "Restrooms", search: "public+restroom+near+me" },
      { icon: "\uD83D\uDC8A", label: "Pharmacy", search: "pharmacy+near+me" },
      { icon: "\uD83C\uDFE7", label: "ATM", search: "atm+near+me" }
    ]
    const nearbyNodes = []
    nearbyNodes.push(el("div", { className: "exploreSectionHead" }, "\uD83E\uDDED Around Me"))
    nearbyItems.forEach(function(ni) {
      const card = el("a", {
        className: "guideItem nearbyLink",
        href: "https://www.google.com/maps/search/" + ni.search,
        target: "_blank",
        style: "text-decoration:none;display:block"
      },
        el("div", { className: "exploreCardTop" },
          el("div", { className: "exploreCardInfo" },
            el("div", { className: "guideName" }, ni.icon + " " + ni.label)
          ),
          el("div", { className: "exploreDist", style: "color:var(--stone);font-size:12px" }, "Maps \u203A")
        )
      )
      nearbyNodes.push(card)
    })
    container.replaceChildren(...nearbyNodes)
    return
  }

  if (!allOn) {
    items = items.filter(it => exploreFilter.has(it.category))
  }

  const hasDistances = Object.keys(exploreDistances).length > 0
  if (hasDistances) {
    items.sort((a, b) => {
      const da = exploreDistances[a.flatIndex]
      const db = exploreDistances[b.flatIndex]
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.seconds - db.seconds
    })
  }

  // Determine if we need section headings (multiple categories visible, no distance sort)
  const activeCats = new Set(items.map(it => it.category))
  const showSections = activeCats.size > 1 && !hasDistances
  const catIcons = {}
  data.guides.forEach(g => { catIcons[g.title] = g.icon })

  const nodes = []
  let lastCat = null
  let lastTag = null
  let sectionBody = null

  items.forEach(item => {
    if (showSections && item.category !== lastCat) {
      lastCat = item.category
      lastTag = null
      const key = "nyc-explore-col-" + item.category
      const isCollapsed = localStorage.getItem(key) === "1"
      const chevron = el("span", { className: "exploreSectionChevron" }, isCollapsed ? "▸" : "▾")
      const sectionInner = el("div", { className: "exploreSectionInner" })
      sectionBody = el("div", { className: "exploreSectionBody" + (isCollapsed ? " collapsed" : "") }, sectionInner)
      sectionBody._inner = sectionInner
      const head = el("div", { className: "exploreSectionHead", role: "button", tabindex: "0" },
        catIcons[item.category] + " " + item.category, chevron
      )
      head.onclick = () => {
        const col = sectionBody.classList.toggle("collapsed")
        chevron.textContent = col ? "▸" : "▾"
        localStorage.setItem(key, col ? "1" : "0")
      }
      head.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); head.onclick() } }
      nodes.push(head)
      nodes.push(sectionBody)
    }

    if (item.tag && item.tag !== lastTag && !hasDistances) {
      lastTag = item.tag
      const tagEl = el("div", { className: "exploreTagHead" }, item.tag)
      if (sectionBody && sectionBody._inner) sectionBody._inner.append(tagEl)
      else nodes.push(tagEl)
    }

    const dist = exploreDistances[item.flatIndex]
    const mapsUrl = "https://www.google.com/maps/search/" + encodeURIComponent(item.name + ", " + item.address)

    const rightSide = dist
      ? el("div", { className: "exploreDist", innerHTML: SVG_PIN })
      : (hasDistances ? el("div", { className: "exploreDist travelLoading" }, "...") : null)
    if (dist) rightSide.append(" " + dist.text)

    const nameEl = el("div", { className: "guideName" }, item.icon + " " + item.name)
    if (item.price) {
      nameEl.append(" ")
      nameEl.append(el("span", { className: "priceBadge" }, item.price))
    }

    const guideAction = () => {
      if (swapTarget != null) selectAlternative(item.flatIndex)
      else window.open(mapsUrl, "_blank")
    }
    const card = el("div", {
      className: "guideItem" + (swapTarget != null ? " swappable" : ""),
      role: "button",
      tabindex: "0",
      onclick: guideAction,
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); guideAction() } }
    },
      el("div", { className: "exploreCardTop" },
        el("div", { className: "exploreCardInfo" },
          nameEl,
          el("a", { className: "guideAddr", href: mapsUrl, target: "_blank", onclick: (e) => e.stopPropagation() }, item.address),
          el("div", { className: "guideNote" }, item.note)
        ),
        rightSide
      )
    )
    if (sectionBody && showSections && sectionBody._inner) sectionBody._inner.append(card)
    else nodes.push(card)
  })

  if (items.length === 0) {
    nodes.push(el("div", { className: "guideNote", style: "text-align:center;padding:20px" }, "No items in this category"))
  }

  container.replaceChildren(...nodes)
}

function fetchExploreDistances() {
  if (!localStorage.getItem("nyc-gmaps-key")) return

  if (swapTarget != null) {
    const stop = data.days[state.day].stops[swapTarget]
    exploreOriginLabel = stop.name
    fetchExploreDistancesFrom(stop.address)
    return
  }

  const useStop = () => {
    const stop = getStop(state.day, state.stop)
    exploreOriginLabel = stop.name
    fetchExploreDistancesFrom(stop.address)
    renderExploreFilters()
    renderExplore()
  }

  const useGeo = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        exploreOriginLabel = "You"
        fetchExploreDistancesFrom(p.coords.latitude + "," + p.coords.longitude)
        renderExploreFilters()
        renderExplore()
      }, useStop, { timeout: 3000 })
    } else {
      useStop()
    }
  }

  if (exploreOriginMode === "stop") {
    useStop()
  } else if (exploreOriginMode === "geo") {
    useGeo()
  } else {
    // "auto" — try geo, fallback to stop
    useGeo()
  }
}

function fetchExploreDistancesFrom(origin) {
  loadGoogleMaps().then(() => {
    if (!window.google?.maps) return
    const service = new google.maps.DistanceMatrixService()
    const items = getExploreItems()
    const batchSize = 25
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      service.getDistanceMatrix({
        origins: [origin],
        destinations: batch.map(it => it.address),
        travelMode: google.maps.TravelMode.WALKING
      }, (res, status) => {
        if (status !== "OK") return
        res.rows[0].elements.forEach((elem, j) => {
          if (elem.status === "OK") {
            exploreDistances[i + j] = {
              text: elem.duration.text,
              seconds: elem.duration.value
            }
          }
        })
        clearTimeout(exploreRenderTimer)
        exploreRenderTimer = setTimeout(renderExplore, 200)
      })
    }
  }).catch(e => { if (e && e.name !== "AbortError") console.warn(e) })
}

function selectAlternative(altIndex) {
  if (swapTarget == null) return
  const original = data.days[state.day].stops[swapTarget]
  if (original.type === "reserved") return
  if (!getAllAlternatives()[altIndex]) return
  state.swaps[state.day + "-" + swapTarget] = altIndex
  closeGuides()
  render()
}

function restoreStop(dayIndex, stopIndex) {
  delete state.swaps[dayIndex + "-" + stopIndex]
  render()
}

// --- Alerts ---

const ALERT_TYPES = {
  reservations: { label: "Reservations", desc: "Get ready & leave alerts based on travel time" },
  leaveNow:    { label: "Leave Now",    desc: "Travel time reminders to next stop" },
  weather:     { label: "Weather",      desc: "Rain alerts for today's stops" },
  sunset:      { label: "Sunset",       desc: "Golden hour reminder at sunset spots" }
}

function getAlertPref(type) {
  const v = localStorage.getItem("nyc-alert-" + type)
  return v === null ? true : v === "1"
}

function setAlertPref(type, on) {
  localStorage.setItem("nyc-alert-" + type, on ? "1" : "0")
  const btn = document.getElementById("alert-" + type)
  if (btn) btn.classList.toggle("active", on)
  if (on) requestAlertPermission()
}

function anyAlertsEnabled() {
  return Object.keys(ALERT_TYPES).some(t => getAlertPref(t))
}

function requestAlertPermission() {
  if (!("Notification" in window)) return
  if (Notification.permission === "default") {
    Notification.requestPermission()
  }
}

function sendAlert(tag, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return
  if (localStorage.getItem(tag)) return
  localStorage.setItem(tag, "1")
  new Notification("NYC Trip", {
    body: body,
    tag: tag,
    requireInteraction: true
  })
}

function getTodayIndex() {
  if (!data) return -1
  const now = new Date()
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0")
  return data.days.findIndex(d => d.date === today)
}

function checkAlerts() {
  if (!anyAlertsEnabled()) return
  if (!("Notification" in window) || Notification.permission !== "granted") return
  if (!data) return

  const dayIndex = getTodayIndex()
  if (dayIndex < 0) return

  const day = data.days[dayIndex]
  if (!day || !day.stops) return
  const effective = getEffectiveStops(dayIndex)
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()

  // --- Reservation alerts (travel-time-aware: "get ready" & "leave now") ---
  if (getAlertPref("reservations")) {
    effective.forEach((entry, ei) => {
      const stop = entry.stop
      if (stop.type !== "reserved" || !stop.time) return
      const [h, m] = stop.time.split(":").map(Number)
      const eventMins = h * 60 + m

      const tKey = ei === 0 ? dayIndex + "-h0" : dayIndex + "-e" + (ei - 1)
      const walkMins = getWalkMins(tKey)
      const getReadyAt = eventMins - walkMins - 15
      const leaveAt = eventMins - walkMins - 5
      const travelNote = walkMins > 0 ? " (" + walkMins + " min walk)" : ""

      if (nowMins >= getReadyAt && nowMins < getReadyAt + 2) {
        const tag = "nyc-a-res-" + day.date + "-" + entry.key + "-ready"
        sendAlert(tag, "Get ready! " + (stop.icon || "") + " " + stop.name + " at " + stop.time + travelNote + " — leave in ~10 min")
      }
      if (nowMins >= leaveAt && nowMins < leaveAt + 2) {
        const tag = "nyc-a-res-" + day.date + "-" + entry.key + "-leave"
        sendAlert(tag, "Leave now for " + (stop.icon || "") + " " + stop.name + " at " + stop.time + travelNote)
      }
    })
  }

  // --- Leave Now alerts (based on travel time to next non-reserved timed stop) ---
  if (getAlertPref("leaveNow")) {
    effective.forEach((entry, ei) => {
      const stop = entry.stop
      if (!stop.time || stop.type === "reserved") return
      const [h, m] = stop.time.split(":").map(Number)
      const eventMins = h * 60 + m

      const tKey = ei === 0 ? dayIndex + "-h0" : dayIndex + "-e" + (ei - 1)
      const walkMins = getWalkMins(tKey)
      if (walkMins === 0) return
      const leaveAt = eventMins - walkMins - 5

      if (nowMins >= leaveAt && nowMins < leaveAt + 2) {
        const times = travelTimes[tKey]
        const tag = "nyc-a-leave-" + day.date + "-" + entry.key
        sendAlert(tag, "Leave now for " + (stop.icon || "") + " " + stop.name + " (" + (times && times.walk ? times.walk : "?") + " walk, arrives " + stop.time + ")")
      }
    })
  }

  // --- Weather alerts (morning rain warning) ---
  if (getAlertPref("weather") && hourlyWeather) {
    const rainyStops = []
    effective.forEach((entry, ei) => {
      const stop = entry.stop
      const hour = stop.time ? parseInt(stop.time.split(":")[0], 10) : getStopHour(ei, effective.length)
      const rain = hourlyWeather.precipitation_probability[hour]
      if (rain >= 50) rainyStops.push({ rain, name: stop.name })
    })

    if (rainyStops.length > 0 && nowMins >= 420 && nowMins < 540) {
      const tag = "nyc-a-wx-" + day.date
      const worst = rainyStops.reduce((a, b) => a.rain > b.rain ? a : b)
      sendAlert(tag, "Rain likely today (" + worst.rain + "% at " + worst.name + "). Bring an umbrella!")
    }
  }

  // --- Sunset alerts (45 min before sunset at sunset spots) ---
  if (getAlertPref("sunset")) {
    const sunsetMins = 19 * 60 + 10  // ~7:10pm mid-March NYC
    const goldenStart = sunsetMins - 45

    effective.forEach((entry) => {
      const stop = entry.stop
      const text = (stop.note || "") + " " + (stop.name || "")
      if (!/sunset|rooftop|skyline|golden/i.test(text)) return

      if (nowMins >= goldenStart && nowMins < goldenStart + 2) {
        const tag = "nyc-a-sun-" + day.date + "-" + entry.key
        sendAlert(tag, "Golden hour starting! Head to " + (stop.icon || "") + " " + stop.name + " for sunset")
      }
    })
  }
}

let alertInterval = null
if (!alertInterval) alertInterval = setInterval(checkAlerts, 60000)

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkAlerts()
})

function initAlertSettings() {
  Object.keys(ALERT_TYPES).forEach(type => {
    const btn = document.getElementById("alert-" + type)
    if (btn) btn.classList.toggle("active", getAlertPref(type))
  })
}

// --- Add Place sheet ---

function openAddPlace() {
  closeMenu()
  const effective = getEffectiveStops(state.day)
  const sel = document.getElementById("addPlacePos")
  sel.replaceChildren()
  sel.add(new Option("Start of day", "0"))
  effective.forEach((entry, i) => {
    sel.add(new Option("After " + (i + 1) + ". " + entry.stop.name, String(i + 1)))
  })
  sel.value = String(effective.length)

  document.getElementById("addPlaceName").value = ""
  document.getElementById("addPlaceAddr").value = ""
  document.getElementById("addPlaceIcon").value = ""
  document.getElementById("addPlaceNote").value = ""
  document.getElementById("addPlaceTime").value = ""
  document.getElementById("addPlaceTypeFlex").classList.add("active")
  document.getElementById("addPlaceTypeRes").classList.remove("active")
  document.getElementById("addPlaceTimeRow").style.display = "none"

  document.getElementById("addPlaceSheet").classList.add("open")
  document.getElementById("addPlaceOverlay").classList.add("show")
}

function closeAddPlace() {
  document.getElementById("addPlaceSheet").classList.remove("open")
  document.getElementById("addPlaceOverlay").classList.remove("show")
}

function setAddPlaceType(type) {
  document.getElementById("addPlaceTypeFlex").classList.toggle("active", type === "flexible")
  document.getElementById("addPlaceTypeRes").classList.toggle("active", type === "reserved")
  document.getElementById("addPlaceTimeRow").style.display = type === "reserved" ? "" : "none"
}

function submitAddPlace() {
  const name = document.getElementById("addPlaceName").value.trim()
  const address = document.getElementById("addPlaceAddr").value.trim()
  if (!name || !address) { alert("Name and address are required"); return }

  const icon = document.getElementById("addPlaceIcon").value.trim() || "📍"
  const note = document.getElementById("addPlaceNote").value.trim()
  const isReserved = document.getElementById("addPlaceTypeRes").classList.contains("active")
  const type = isReserved ? "reserved" : "flexible"
  const time = isReserved ? document.getElementById("addPlaceTime").value : undefined
  const position = parseInt(document.getElementById("addPlacePos").value, 10)

  const stop = { name, address, icon, type, note, position }
  if (time) stop.time = time

  const key = String(state.day)
  if (!state.added[key]) state.added[key] = []
  state.added[key].push(stop)

  closeAddPlace()
  render()
}

// --- Removed Places sheet ---

function openRemoved() {
  closeMenu()
  renderRemoved()
  document.getElementById("removedSheet").classList.add("open")
  document.getElementById("removedOverlay").classList.add("show")
}

function closeRemoved() {
  document.getElementById("removedSheet").classList.remove("open")
  document.getElementById("removedOverlay").classList.remove("show")
}

function renderRemoved() {
  const container = document.getElementById("removedContent")
  const nodes = []
  const grouped = {}

  Object.keys(state.removed).forEach(key => {
    if (!state.removed[key]) return
    const parts = key.split("-")
    const dayIndex = parseInt(parts[0], 10)
    const dayTitle = data.days[dayIndex]?.title || "Day " + (dayIndex + 1)

    let stop
    if (parts[1] === "a") {
      // Added stop that was removed
      const addedIndex = parseInt(parts[2], 10)
      stop = (state.added[dayIndex] || [])[addedIndex]
    } else {
      // Original stop (may be swapped)
      const stopIndex = parseInt(parts[1], 10)
      stop = getStop(dayIndex, stopIndex)
    }
    if (!stop) return

    if (!grouped[dayTitle]) grouped[dayTitle] = []
    grouped[dayTitle].push({ stop, key, dayTitle })
  })

  Object.keys(grouped).forEach(dayTitle => {
    nodes.push(el("div", { className: "removedDayHead" }, dayTitle))
    grouped[dayTitle].forEach(({ stop, key }) => {
      const mapsUrl = "https://www.google.com/maps/search/" + encodeURIComponent(stop.name + ", " + stop.address)
      const card = el("div", { className: "removedCard" },
        el("div", { className: "removedCardTop" },
          el("a", { className: "removedCardName", href: mapsUrl, target: "_blank" },
            (stop.icon || "") + " " + stop.name),
          el("button", {
            className: "toggleBtn",
            onclick: () => { restoreRemovedStop(key) }
          }, "↩ Restore")
        ),
        el("div", { className: "removedCardAddr" }, stop.address)
      )
      nodes.push(card)
    })
  })

  if (nodes.length === 0) {
    nodes.push(el("div", { className: "removedEmpty" }, "No removed places"))
  }

  container.replaceChildren(...nodes)
}

function restoreRemovedStop(key) {
  delete state.removed[key]
  saveState()
  render()
  renderRemoved()
}

// --- Sync (copy/paste trip changes) ---

let pendingSyncData = null

function syncCopyChanges() {
  const btn = document.getElementById("syncCopyBtn")
  const status = document.getElementById("syncStatus")
  const tripEdits = loadTripEdits()
  const payload = {
    v: APP_VERSION,
    s: state.swaps,
    a: state.added,
    r: state.removed,
    o: state.reorder,
    n: state.userNotes,
    e: tripEdits
  }
  const hasChanges = Object.keys(payload.s).length || Object.keys(payload.a).length || Object.keys(payload.r).length || Object.keys(payload.o).length || Object.keys(payload.n).length || Object.keys(payload.e).length
  if (!hasChanges) {
    status.textContent = "Nothing to share — no changes yet."
    status.className = "syncStatus syncWarn"
    setTimeout(() => { status.textContent = ""; status.className = "syncStatus" }, 3000)
    return
  }
  const jsonStr = JSON.stringify(payload)
  const encoded = btoa(new TextEncoder().encode(jsonStr).reduce((s, b) => s + String.fromCharCode(b), ""))
  const shareUrl = location.origin + location.pathname + "#sync=" + encoded

  if (navigator.share) {
    navigator.share({ title: "NYC Trip Changes", url: shareUrl }).then(() => {
      btn.textContent = "Shared!"
      status.textContent = ""
      setTimeout(() => { btn.textContent = "Share My Changes" }, 2000)
    }).catch(() => {})
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      btn.textContent = "Link Copied!"
      status.textContent = "Send this link to your partner."
      status.className = "syncStatus syncOk"
      setTimeout(() => { btn.textContent = "Share My Changes"; status.textContent = ""; status.className = "syncStatus" }, 4000)
    }).catch(() => {
      status.textContent = "Could not copy — try manually selecting the URL."
      status.className = "syncStatus syncErr"
    })
  }
}

function parseSyncData(encoded) {
  try {
    const bytes = atob(encoded.trim())
    const decoded = new TextDecoder().decode(Uint8Array.from(bytes, c => c.charCodeAt(0)))
    return JSON.parse(decoded)
  } catch (e) {
    return null
  }
}

function validateSyncPayload(parsed) {
  if (!parsed || typeof parsed !== "object" || !parsed.v) return null
  const alts = getAllAlternatives()
  const cleanSwaps = {}
  if (parsed.s && typeof parsed.s === "object") {
    Object.keys(parsed.s).forEach(key => {
      const parts = key.split("-")
      const dayIdx = parseInt(parts[0], 10)
      const stopIdx = parseInt(parts[1], 10)
      const day = data.days[dayIdx]
      if (!day || !day.stops[stopIdx]) return
      if (day.stops[stopIdx].type === "reserved") return
      const altIdx = parsed.s[key]
      if (typeof altIdx !== "number" || !alts[altIdx]) return
      cleanSwaps[key] = altIdx
    })
  }
  const cleanAdded = (parsed.a && typeof parsed.a === "object") ? parsed.a : {}
  const cleanRemoved = (parsed.r && typeof parsed.r === "object") ? parsed.r : {}
  const cleanReorder = (parsed.o && typeof parsed.o === "object") ? parsed.o : {}
  const cleanNotes = {}
  if (parsed.n && typeof parsed.n === "object") {
    Object.keys(parsed.n).forEach(key => {
      if (typeof parsed.n[key] === "string" && parsed.n[key].trim()) {
        cleanNotes[key] = parsed.n[key].trim().slice(0, 200)
      }
    })
  }
  const cleanEdits = (parsed.e && typeof parsed.e === "object") ? parsed.e : {}
  const swapCount = Object.keys(cleanSwaps).length
  const addedCount = Object.values(cleanAdded).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
  const removedCount = Object.keys(cleanRemoved).filter(k => cleanRemoved[k]).length
  const reorderCount = Object.keys(cleanReorder).length
  const noteCount = Object.keys(cleanNotes).length
  const editCount = Object.keys(cleanEdits).length
  if (!swapCount && !addedCount && !removedCount && !reorderCount && !noteCount && !editCount) return null
  const summary = []
  if (swapCount) summary.push(swapCount + " swap" + (swapCount > 1 ? "s" : ""))
  if (addedCount) summary.push(addedCount + " added place" + (addedCount > 1 ? "s" : ""))
  if (removedCount) summary.push(removedCount + " removed stop" + (removedCount > 1 ? "s" : ""))
  if (reorderCount) summary.push(reorderCount + " reordered day" + (reorderCount > 1 ? "s" : ""))
  if (noteCount) summary.push(noteCount + " note" + (noteCount > 1 ? "s" : ""))
  if (editCount) summary.push("trip edits")
  return { data: { s: cleanSwaps, a: cleanAdded, r: cleanRemoved, o: cleanReorder, n: cleanNotes, e: cleanEdits }, summary: summary.join(", "), version: parsed.v }
}

function showSyncPreview(result) {
  const status = document.getElementById("syncStatus")
  const preview = document.getElementById("syncPreview")
  const previewText = document.getElementById("syncPreviewText")
  if (!result) {
    status.textContent = "No valid changes found."
    status.className = "syncStatus syncWarn"
    return
  }
  if (result.version !== APP_VERSION) {
    status.textContent = "App version mismatch (yours: " + APP_VERSION + ", theirs: " + result.version + "). Both do Force Reload first."
    status.className = "syncStatus syncErr"
    return
  }
  pendingSyncData = result.data
  previewText.textContent = "Apply " + result.summary + "? This will replace your current changes."
  preview.style.display = ""
  status.textContent = ""
  status.className = "syncStatus"
}

function syncPasteChanges() {
  const status = document.getElementById("syncStatus")
  navigator.clipboard.readText().then(text => {
    if (!text || !text.trim()) {
      status.textContent = "Clipboard is empty."
      status.className = "syncStatus syncErr"
      return
    }
    // Support both raw encoded data and full URLs with #sync=
    let encoded = text.trim()
    if (encoded.includes("#sync=")) encoded = encoded.split("#sync=")[1]
    const parsed = parseSyncData(encoded)
    const result = parsed ? validateSyncPayload(parsed) : null
    if (!result) {
      status.textContent = "That doesn't look like trip data."
      status.className = "syncStatus syncErr"
      return
    }
    showSyncPreview(result)
  }).catch(() => {
    status.textContent = "Can't read clipboard — paste permission needed."
    status.className = "syncStatus syncErr"
  })
}

function checkSyncHash() {
  const hash = location.hash
  if (!hash.startsWith("#sync=")) return
  const encoded = hash.slice(6)
  history.replaceState(null, "", location.pathname)
  const parsed = parseSyncData(encoded)
  if (!parsed) return
  const result = validateSyncPayload(parsed)
  if (!result) return
  openSettings()
  setTimeout(() => showSyncPreview(result), 300)
}

function syncApply() {
  if (!pendingSyncData) return
  state.swaps = pendingSyncData.s
  state.added = pendingSyncData.a
  state.removed = pendingSyncData.r
  state.reorder = pendingSyncData.o || {}
  state.userNotes = pendingSyncData.n || {}
  if (pendingSyncData.e && Object.keys(pendingSyncData.e).length) {
    saveTripEdits(pendingSyncData.e)
    applyTripEdits()
  }
  pendingSyncData = null
  document.getElementById("syncPreview").style.display = "none"
  const status = document.getElementById("syncStatus")
  status.textContent = "Done! Trip updated."
  status.className = "syncStatus syncOk"
  mapCache = {}
  travelTimes = {}
  clampState()
  render()
  setTimeout(() => { status.textContent = ""; status.className = "syncStatus" }, 3000)
}

function syncCancel() {
  pendingSyncData = null
  document.getElementById("syncPreview").style.display = "none"
  document.getElementById("syncStatus").textContent = ""
  document.getElementById("syncStatus").className = "syncStatus"
}

// --- Search ---

function openSearch() {
  document.getElementById("searchSheet").classList.add("open")
  document.getElementById("searchOverlay").classList.add("show")
  const input = document.getElementById("searchInput")
  input.value = ""
  document.getElementById("searchResults").replaceChildren()
  setTimeout(() => input.focus(), 100)
}

function closeSearch() {
  document.getElementById("searchSheet").classList.remove("open")
  document.getElementById("searchOverlay").classList.remove("show")
}

function renderSearchResults() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase()
  const container = document.getElementById("searchResults")
  if (!q) { container.replaceChildren(); return }

  const results = []

  // Search day stops
  data.days.forEach((day, di) => {
    const effective = getEffectiveStops(di)
    effective.forEach((entry, ei) => {
      const s = entry.stop
      const text = (s.name + " " + (s.note || "") + " " + (s.address || "")).toLowerCase()
      if (text.includes(q)) {
        results.push({ type: "day", dayIndex: di, stopIndex: ei, stop: s, dayTitle: day.title, date: day.date })
      }
    })
  })

  // Search guide items
  data.guides.forEach(guide => {
    guide.items.forEach(item => {
      const text = (item.name + " " + (item.note || "") + " " + (item.address || "")).toLowerCase()
      if (text.includes(q)) {
        // avoid duplicates if already in day results (fuzzy: check if day stop name contains guide name or vice versa)
        const gName = item.name.toLowerCase()
        const isDup = results.some(r => {
          if (r.type !== "day") return false
          const dName = r.stop.name.toLowerCase()
          return dName === gName || dName.includes(gName) || gName.includes(dName)
        })
        if (!isDup) {
          results.push({ type: "guide", item: item, category: guide.title, icon: item.icon || guide.icon })
        }
      }
    })
  })

  if (!results.length) {
    container.replaceChildren(el("div", { className: "searchEmpty" }, "No results for \u201c" + document.getElementById("searchInput").value.trim() + "\u201d"))
    return
  }

  const nodes = results.slice(0, 30).map(r => {
    if (r.type === "day") {
      const date = new Date(r.date + "T12:00:00")
      const label = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
      const action = () => { closeSearch(); state.day = r.dayIndex; state.stop = r.stopIndex; loadWeather(); render(); setTimeout(() => document.querySelector(".stop.active")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100) }
      return el("div", { className: "searchResult", role: "button", tabindex: "0", onclick: action, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action() } } },
        el("div", { className: "searchResultName" }, (r.stop.icon || "") + " " + r.stop.name),
        el("div", { className: "searchResultMeta" }, label + " \u2014 " + r.dayTitle)
      )
    } else {
      const mapsUrl = "https://www.google.com/maps/search/" + encodeURIComponent(r.item.name + ", " + r.item.address)
      const action = () => { window.open(mapsUrl, "_blank") }
      return el("div", { className: "searchResult", role: "button", tabindex: "0", onclick: action, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action() } } },
        el("div", { className: "searchResultName" }, (r.icon || "") + " " + r.item.name),
        el("div", { className: "searchResultMeta" }, r.category),
        el("div", { className: "searchResultNote" }, r.item.note || "")
      )
    }
  })

  container.replaceChildren(...nodes)
}

// --- Pull-to-refresh (standalone PWA) ---

;(function initPullToRefresh() {
  const isStandalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches
  if (!isStandalone) return

  const indicator = document.getElementById("ptrIndicator")
  const spinner = indicator && indicator.firstElementChild
  if (!indicator) return

  const THRESHOLD = 140
  const DEAD_ZONE = 30
  let startY = 0
  let pulling = false
  let committed = false

  document.addEventListener("touchstart", e => {
    if (window.scrollY === 0 && e.touches.length === 1) {
      startY = e.touches[0].clientY
      pulling = true
      committed = false
    }
  }, { passive: true })

  document.addEventListener("touchmove", e => {
    if (!pulling) return
    const dy = e.touches[0].clientY - startY
    if (dy < 0 || window.scrollY > 0) { pulling = false; indicator.className = ""; spinner.style.transform = ""; spinner.style.opacity = "0"; return }
    if (dy < DEAD_ZONE) return
    const progress = Math.min((dy - DEAD_ZONE) / (THRESHOLD - DEAD_ZONE), 1)
    committed = true
    indicator.className = "pulling"
    spinner.style.transform = "translateY(" + (progress * 50 - 40) + "px)"
    spinner.style.opacity = String(progress)
  }, { passive: true })

  document.addEventListener("touchend", () => {
    if (!pulling) return
    pulling = false
    if (committed && parseFloat(spinner.style.opacity || 0) >= 1) {
      indicator.className = "refreshing"
      spinner.style.transform = ""
      spinner.style.opacity = ""
      setTimeout(() => location.reload(), 300)
    } else {
      indicator.className = ""
      spinner.style.transform = ""
      spinner.style.opacity = "0"
    }
    committed = false
  }, { passive: true })
})()

// --- Service worker ---

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(e => { if (e && e.name !== "AbortError") console.warn(e) })
}
