"use strict"

let data

let state={
day:0,
stop:0
}

let weather={
temp:"?",
rain:"?"
}

fetch("data.json")
.then(r=>r.json())
.then(d=>{
data=d
loadWeather()
render()
})

function loadWeather(){

fetch("https://api.open-meteo.com/v1/forecast?latitude=40.72&longitude=-74.00&current_weather=true&hourly=precipitation_probability")
.then(r=>r.json())
.then(w=>{
weather.temp=Math.round(w.current_weather.temperature)
weather.rain=w.hourly?.precipitation_probability?.[0] ?? 0
render()
})

}

function getHotel(date){

let hotel=data.hotels[0]

data.hotels.forEach(h=>{
if(date>=h.from) hotel=h
})

return hotel

}

function stopCard(stop,i){

let active=i===state.stop?"active":""

return `
<div class="stop ${active}" onclick="setStop(${i})">
<div>
<span class="seq">${(i+1).toString().padStart(2,"0")}</span>
<b>${stop.icon||""} ${stop.name}</b>
</div>
${stop.address}
<div class="weather">🌡 ${weather.temp}° 🌧 ${weather.rain}%</div>
</div>
`

}

function hotelRow(name){

return `
<div class="stop">
🏨 ${name}
</div>
`

}

function distanceMeters(a,b){

let lat1=40.72
let lon1=-74.0
let lat2=lat1
let lon2=lon1

let R=6371e3

let φ1=lat1*Math.PI/180
let φ2=lat2*Math.PI/180
let Δφ=(lat2-lat1)*Math.PI/180
let Δλ=(lon2-lon1)*Math.PI/180

let x=Math.sin(Δφ/2)*Math.sin(Δφ/2)+
Math.cos(φ1)*Math.cos(φ2)*
Math.sin(Δλ/2)*Math.sin(Δλ/2)

let c=2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))

return R*c

}

function walkMinutes(){

let mins=Math.round(Math.random()*3+4)

return mins

}

function travelRow(a,b){

let walk=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.address)}&destination=${encodeURIComponent(b.address)}&travelmode=walking`
let transit=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.address)}&destination=${encodeURIComponent(b.address)}&travelmode=transit`
let drive=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.address)}&destination=${encodeURIComponent(b.address)}&travelmode=driving`

let mins=walkMinutes()

return `
<div class="travel">
↓ ${mins} min
<a onclick="event.stopPropagation()" href="${walk}" target="_blank">Walk</a>
<a onclick="event.stopPropagation()" href="${transit}" target="_blank">Subway</a>
<a onclick="event.stopPropagation()" href="${drive}" target="_blank">Taxi</a>
</div>
`

}

function render(){

let day=data.days[state.day]

let date=new Date(day.date)

let dayStr=date.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})

document.getElementById("dayMeta").innerText=`DAY ${(state.day+1).toString().padStart(2,"0")} · ${dayStr}`

document.getElementById("title").innerText=day.title

let html=""

let hotel=getHotel(day.date)

html+=hotelRow(hotel.name)

day.stops.forEach((s,i)=>{

html+=stopCard(s,i)

if(i<day.stops.length-1){
html+=travelRow(s,day.stops[i+1])
}

})

html+=hotelRow("Return to "+hotel.name)

document.getElementById("stops").innerHTML=html

updateNext()

}

function setStop(i){
state.stop=i
render()
}

function nextStop(){

let day=data.days[state.day]

if(state.stop<day.stops.length-1){
state.stop++
render()
}

}

function updateNext(){

let day=data.days[state.day]

let n=state.stop+2

if(n<=day.stops.length){
document.getElementById("nextBtn").innerText=`NEXT → ${n}`
}else{
document.getElementById("nextBtn").innerText="DAY COMPLETE"
}

}

function prevDay(){

if(state.day>0){
state.day--
state.stop=0
render()
}

}

function nextDay(){

if(state.day<data.days.length-1){
state.day++
state.stop=0
render()
}

}

let startX=0
let startY=0
let swipe=true

document.addEventListener("touchstart",e=>{
startX=e.touches[0].clientX
startY=e.touches[0].clientY
swipe=true
})

document.addEventListener("touchmove",e=>{

if(!swipe)return

let dx=e.touches[0].clientX-startX
let dy=e.touches[0].clientY-startY

if(Math.abs(dy)>Math.abs(dx)) swipe=false

})

document.addEventListener("touchend",e=>{

if(!swipe)return

let diff=e.changedTouches[0].clientX-startX

if(Math.abs(diff)<90)return

if(diff<0){
nextDay()
}else{
prevDay()
}

})

function toggleMenu(){

document.getElementById("menu").classList.toggle("open")
document.getElementById("menuOverlay").classList.toggle("show")

}

function closeMenu(){

document.getElementById("menu").classList.remove("open")
document.getElementById("menuOverlay").classList.remove("show")

}

function openDayMap(){

let day=data.days[state.day]

let origin=day.stops[0].address
let dest=day.stops[day.stops.length-1].address

let waypoints=day.stops.slice(1,-1).map(s=>encodeURIComponent(s.address)).join("|")

let url=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&waypoints=${waypoints}`

window.open(url)

}

function returnHotel(){

closeMenu()

let h=data.hotels[0].address

window.open("https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(h))

}

function nearbyCoffee(){

closeMenu()

window.open("https://maps.google.com/search/coffee+near+me")

}

function nearbyFood(){

closeMenu()

window.open("https://maps.google.com/search/food+near+me")

}

function sendMyLocation(){

if(!navigator.geolocation){
alert("Location not supported")
return
}

navigator.geolocation.getCurrentPosition(p=>{

let lat=p.coords.latitude
let lon=p.coords.longitude

let msg="Meet here https://maps.google.com/?q="+lat+","+lon

window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))

})

}