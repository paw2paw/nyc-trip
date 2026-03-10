let data
let currentIndex=0
let dayIndex=0

fetch("./data.json?v=14").then(r=>r.json()).then(d=>{data=d;loadDay();loadWeather()})

function toggleMenu(){document.getElementById("menu").classList.toggle("open")}

function loadDay(){
let day=data.days[dayIndex]
document.getElementById("dayTitle").innerText=day.title
const container=document.getElementById("stops")
container.innerHTML=""
day.stops.forEach((s,i)=>{
let el=document.createElement("div")
el.className="stop"
el.innerHTML=\`
<div>\${s.icon} \${s.name}</div>
<div>\${s.address}</div>
<button onclick="navigate('\${s.address}')">Directions</button>
<button onclick="sendStopLocation('\${s.name}','\${s.address}')">💬 Meet Here</button>\`
container.appendChild(el)
})
}

function prevDay(){dayIndex=(dayIndex-1+data.days.length)%data.days.length;loadDay()}
function nextDay(){dayIndex=(dayIndex+1)%data.days.length;loadDay()}

function navigate(addr){
window.open("https://www.google.com/maps/search/"+encodeURIComponent(addr))
}

function navigateDay(){
let stops=data.days[dayIndex].stops.map(s=>s.address)
window.open("https://www.google.com/maps/dir/"+stops.map(s=>encodeURIComponent(s)).join("/"))
}

function nextStop(){
let stop=data.days[dayIndex].stops[currentIndex]
navigate(stop.address)
currentIndex=(currentIndex+1)%data.days[dayIndex].stops.length
}

function returnHotel(){
let hotel=data.hotels[0]
navigate(hotel.address)
}

function sendMyLocation(){
navigator.geolocation.getCurrentPosition(pos=>{
let url="https://maps.google.com/?q="+pos.coords.latitude+","+pos.coords.longitude
let msg="Meet me here "+url
window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))
})
}

function sendStopLocation(name,address){
let msg="Meet at "+name+" https://maps.google.com/?q="+encodeURIComponent(address)
window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))
}

function showMap(){
let m=document.getElementById("map")
m.style.display="block"
m.innerHTML='<iframe width="100%" height="100%" style="border:0" src="https://maps.google.com/maps?q=New%20York&z=13&output=embed"></iframe>'
}

function nearbyCoffee(){
navigator.geolocation.getCurrentPosition(p=>{
window.open("https://www.google.com/maps/search/coffee/@"+p.coords.latitude+","+p.coords.longitude+",15z")
})
}

function nearbyFood(){
navigator.geolocation.getCurrentPosition(p=>{
window.open("https://www.google.com/maps/search/food/@"+p.coords.latitude+","+p.coords.longitude+",15z")
})
}

function loadWeather(){
navigator.geolocation.getCurrentPosition(pos=>{
fetch("https://api.open-meteo.com/v1/forecast?latitude="+pos.coords.latitude+"&longitude="+pos.coords.longitude+"&current_weather=true&hourly=precipitation_probability")
.then(r=>r.json()).then(w=>{
document.getElementById("temp").innerText="🌡 "+w.current_weather.temperature+"°"
let rain=w.hourly?.precipitation_probability?.[0]||0
document.getElementById("rain").innerText="🌧 "+rain+"%"
})
})
}
