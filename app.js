let data
let currentIndex=0
let dayIndex=0
let mapLoaded=false

fetch("./data.json?v=13").then(r=>r.json()).then(d=>{data=d;init()})

function init(){
loadDay()
loadWeather()
}

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
}

function loadDay(){
let day=data.days[dayIndex]
document.getElementById("dayTitle").innerText=day.title
document.getElementById("topLine").innerText=`DAY ${dayIndex+1} · NYC`

const container=document.getElementById("stops")
container.innerHTML=""

day.stops.forEach((s,i)=>{
addStop(container,s.icon+" "+s.name,s.address)

if(i<day.stops.length-1){
let next=day.stops[i+1]
let t=document.createElement("div")
t.className="transport"
t.innerText="Walk / Subway / Taxi available"
container.appendChild(t)
}
})
}

function prevDay(){
dayIndex--
if(dayIndex<0) dayIndex=data.days.length-1
loadDay()
}

function nextDay(){
dayIndex++
if(dayIndex>=data.days.length) dayIndex=0
loadDay()
}

function addStop(container,name,address){
let el=document.createElement("div")
el.className="stop"
el.innerHTML=`<div>${name}</div><div>${address}</div>
<button onclick="navigate('${address}')">Directions</button>
<button onclick="meetPlace('${name}','${address}')">Meet</button>`
container.appendChild(el)
}

function navigate(addr){
window.open(`https://www.google.com/maps/search/${encodeURIComponent(addr)}`)
}

function openRoute(){
let day=data.days[dayIndex]
let stops=day.stops.map(s=>s.address)
let url="https://www.google.com/maps/dir/"+stops.map(s=>encodeURIComponent(s)).join("/")
window.open(url)
}

function nextStop(){
let day=data.days[dayIndex]
let stop=day.stops[currentIndex]
navigate(stop.address)
currentIndex++
if(currentIndex>=day.stops.length) currentIndex=0
}

function meetHere(){
navigator.geolocation.getCurrentPosition(pos=>{
let lat=pos.coords.latitude
let lng=pos.coords.longitude
let msg=`Meet me here https://maps.google.com/?q=${lat},${lng}`
let url=`https://wa.me/${data.lawPhone}?text=${encodeURIComponent(msg)}`
window.open(url)
})
}

function meetPlace(name,address){
let msg=`Meet here: ${name} https://maps.google.com/?q=${encodeURIComponent(address)}`
let url=`https://wa.me/${data.lawPhone}?text=${encodeURIComponent(msg)}`
window.open(url)
}

function goHotel(){
let hotel=data.hotels[0]
navigate(hotel.address)
}

function showMap(){
let mapEl=document.getElementById("map")
mapEl.style.display="block"

if(!mapLoaded){
mapEl.innerHTML='<iframe width="100%" height="100%" style="border:0" loading="lazy" src="https://maps.google.com/maps?q=New%20York&z=13&output=embed"></iframe>'
mapLoaded=true
}
}

function nearbyCoffee(){
navigator.geolocation.getCurrentPosition(pos=>{
let url=`https://www.google.com/maps/search/coffee/@${pos.coords.latitude},${pos.coords.longitude},15z`
window.open(url)
})
}

function nearbyFood(){
navigator.geolocation.getCurrentPosition(pos=>{
let url=`https://www.google.com/maps/search/food/@${pos.coords.latitude},${pos.coords.longitude},15z`
window.open(url)
})
}

function loadWeather(){
navigator.geolocation.getCurrentPosition(pos=>{
let lat=pos.coords.latitude
let lon=pos.coords.longitude
fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability`)
.then(r=>r.json())
.then(w=>{
document.getElementById("temp").innerText=`🌡 ${w.current_weather.temperature}°`
let rain=w.hourly?.precipitation_probability?.[0]||0
document.getElementById("rain").innerText=`🌧 ${rain}%`
})
})
}
