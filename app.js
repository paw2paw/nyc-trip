let data
let dayIndex = 0
let currentIndex = 0

fetch("./data.json?v=21")
.then(r=>r.json())
.then(d=>{
data=d
setInitialDay()
renderDay()
loadWeather()
})

function setInitialDay(){

let today = new Date().toISOString().slice(0,10)

let index = data.days.findIndex(d => d.date === today)

if(index >= 0){
dayIndex = index
}else{
dayIndex = 0
}

}

function renderDay(){

let day = data.days[dayIndex]

document.getElementById("dayTitle").innerText = day.title

const container=document.getElementById("stops")
container.innerHTML=""

let hotel=getHotel()

addStop(container,"🏨 "+hotel.name,hotel.address)

day.stops.forEach(stop=>{
addStop(container,stop.icon+" "+stop.name,stop.address)
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
<button onclick="shareMeet('${name}','${address}')">💬 Meet</button>
`

container.appendChild(el)

}

function navigate(addr){
window.open("https://www.google.com/maps/search/"+encodeURIComponent(addr))
}

function nextDay(){
dayIndex=(dayIndex+1)%data.days.length
renderDay()
}

function prevDay(){
dayIndex=(dayIndex-1+data.days.length)%data.days.length
renderDay()
}

function getHotel(){

let today = data.days[dayIndex].date

let hotel=data.hotels[0]

data.hotels.forEach(h=>{
if(today>=h.from) hotel=h
})

return hotel

}

function shareMeet(name,address){

let msg="Meet here: "+name+" https://maps.google.com/?q="+encodeURIComponent(address)

window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))

}

function returnHotel(){
navigate(getHotel().address)
}

function nextStop(){

let day=data.days[dayIndex]

let stop=day.stops[currentIndex]

navigate(stop.address)

currentIndex++

if(currentIndex>=day.stops.length) currentIndex=0

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
