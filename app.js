let data
let currentIndex=0
let dayIndex=0

fetch("./data.json?v=15")
.then(r=>r.json())
.then(d=>{
data=d
loadDay()
loadWeather()
})

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
}

function todayString(){
return new Date().toISOString().slice(0,10)
}

function getTodayDay(){
let today=todayString()
let day=data.days.find(d=>d.date===today)
return day || data.days[0]
}

function getHotel(){
let today=todayString()
let hotel=data.hotels[0]

data.hotels.forEach(h=>{
if(today>=h.from) hotel=h
})

return hotel
}

function loadDay(){

let day=getTodayDay()

document.getElementById("dayTitle").innerText=day.title

const container=document.getElementById("stops")
container.innerHTML=""

let hotel=getHotel()

addStop(container,"🏨 "+hotel.name,hotel.address)

day.stops.forEach((s,i)=>{

let el=document.createElement("div")
el.className="stop"

el.innerHTML=`
<div>${s.icon} ${s.name}</div>
<div>${s.address}</div>
<button onclick="navigate('${s.address}')">Directions</button>
<button onclick="sendStopLocation('${s.name}','${s.address}')">💬 Meet</button>
`

container.appendChild(el)

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
<button onclick="sendStopLocation('${name}','${address}')">💬 Meet</button>
`

container.appendChild(el)

}

function navigate(addr){
window.open("https://www.google.com/maps/search/"+encodeURIComponent(addr))
}

function navigateDay(){

let day=getTodayDay()

let hotel=getHotel()

let stops=[hotel.address,...day.stops.map(s=>s.address),hotel.address]

let url="https://www.google.com/maps/dir/"+stops.map(s=>encodeURIComponent(s)).join("/")

window.open(url)

}

function nextStop(){

let day=getTodayDay()

let stop=day.stops[currentIndex]

navigate(stop.address)

currentIndex++

if(currentIndex>=day.stops.length){
currentIndex=0
}

}

function returnHotel(){
let hotel=getHotel()
navigate(hotel.address)
}

function sendMyLocation(){

navigator.geolocation.getCurrentPosition(pos=>{

let lat=pos.coords.latitude
let lng=pos.coords.longitude

let msg=`PAW: Meet here https://maps.google.com/?q=${lat},${lng}`

window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))

})

}

function sendStopLocation(name,address){

let msg=`PAW: Meet at ${name} https://maps.google.com/?q=${encodeURIComponent(address)}`

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
.then(r=>r.json())
.then(w=>{

document.getElementById("temp").innerText="🌡 "+w.current_weather.temperature+"°"

let rain=w.hourly?.precipitation_probability?.[0]||0

document.getElementById("rain").innerText=" 🌧 "+rain+"%"

})

})

}
