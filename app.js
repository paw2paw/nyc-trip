let data
fetch("data.json").then(r=>r.json()).then(d=>{data=d;init()})
function init(){
loadToday()
loadWeather()
document.getElementById("routeBtn").onclick=openRoute
document.getElementById("backupBtn").onclick=showBackups
document.getElementById("meetBtn").onclick=meetHere
document.getElementById("hotelBtn").onclick=goHotel
}
function todayString(){return new Date().toISOString().slice(0,10)}
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
let t=document.createElement("div")
t.className="transport"
t.innerText="🚶 Walk / 🚇 Subway / 🚕 Taxi"
container.appendChild(t)
}
})
addStop(container,"🏨 Return "+hotel.name,hotel.address)
}
function addStop(container,name,address){
let el=document.createElement("div")
el.className="stop"
el.innerHTML=`<div>${name}</div><div>${address}</div><button onclick="navigate('${address}')">Directions</button>`
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
function showBackups(){
let panel=document.getElementById("backupPanel")
panel.classList.toggle("hidden")
let list=document.getElementById("backupList")
list.innerHTML=""
data.backups.forEach(b=>{
let d=document.createElement("div")
d.innerHTML=`${b.name} <button onclick="navigate('${b.address}')">Go</button>`
list.appendChild(d)
})
}
function loadWeather(){
navigator.geolocation.getCurrentPosition(pos=>{
let lat=pos.coords.latitude
let lon=pos.coords.longitude
fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`).then(r=>r.json()).then(w=>{
document.getElementById("temp").innerText=`🌡 ${w.current_weather.temperature}°`
document.getElementById("rain").innerText=`🌧 ${w.current_weather.windspeed}`
})
})
}
