let data
let currentIndex=0

fetch("./data.json?v=11").then(r=>r.json()).then(d=>{data=d;init()})

function init(){
loadToday()
loadWeather()
}

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
}

function todayString(){
return new Date().toISOString().slice(0,10)
}

function currentHotel(){
let today=todayString()
let hotel=data.hotels[0]
data.hotels.forEach(h=>{if(today>=h.from)hotel=h})
return hotel
}

function loadToday(){
let today=todayString()
let day=data.days.find(d=>d.date===today)||data.days[0]
document.getElementById("dayTitle").innerText=day.title
const container=document.getElementById("stops")
container.innerHTML=""

let hotel=currentHotel()

addStop(container,"🏨 "+hotel.name,hotel.address)

day.stops.forEach((s,i)=>{
addStop(container,s.icon+" "+s.name,s.address)

if(i<day.stops.length-1){
let next=day.stops[i+1]

let t=document.createElement("div")
t.className="transport"

t.innerHTML=`
🚶 <a target="_blank" href="https://www.google.com/maps/dir/${encodeURIComponent(s.address)}/${encodeURIComponent(next.address)}/data=!3m1!4b1!4m2!4m1!3e2">Walk</a> ·
🚇 <a target="_blank" href="https://www.google.com/maps/dir/${encodeURIComponent(s.address)}/${encodeURIComponent(next.address)}/data=!3m1!4b1!4m2!4m1!3e3">Subway</a> ·
🚕 <a target="_blank" href="https://www.google.com/maps/dir/${encodeURIComponent(s.address)}/${encodeURIComponent(next.address)}/data=!3m1!4b1!4m2!4m1!3e0">Taxi</a>
`

container.appendChild(t)
}

})

addStop(container,"🏨 Return "+hotel.name,hotel.address)
}

function addStop(container,name,address){
let el=document.createElement("div")
el.className="stop"
el.innerHTML=`
<div>${name}</div>
<div>${address}</div>
<button onclick="navigate('${address}')">Directions</button>
<button onclick="meetPlace('${name}','${address}')">Meet</button>
`
container.appendChild(el)
}

function navigate(addr){
window.open(`https://www.google.com/maps/search/${encodeURIComponent(addr)}`)
}

function openRoute(){
let today=todayString()
let day=data.days.find(d=>d.date===today)||data.days[0]
let hotel=currentHotel()

let stops=[hotel.address,...day.stops.map(s=>s.address),hotel.address]

let url="https://www.google.com/maps/dir/"+stops.map(s=>encodeURIComponent(s)).join("/")

window.open(url)
}

function nextStop(){
let today=todayString()
let day=data.days.find(d=>d.date===today)||data.days[0]

let stop=day.stops[currentIndex]

navigate(stop.address)

currentIndex++

if(currentIndex>=day.stops.length){
currentIndex=0
}
}

function goHotel(){
let hotel=currentHotel()
navigate(hotel.address)
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

function showBackups(){
alert("Backup feature coming next upgrade")
}

function loadWeather(){
navigator.geolocation.getCurrentPosition(pos=>{
let lat=pos.coords.latitude
let lon=pos.coords.longitude

fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
.then(r=>r.json())
.then(w=>{
document.getElementById("temp").innerText=`🌡 ${w.current_weather.temperature}°`
})
})
}
