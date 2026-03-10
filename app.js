let data
let dayIndex=0
let currentStopIndex=0
let watchId=null

fetch("./data.json?v=30")
.then(r=>r.json())
.then(d=>{
data=d
setInitialDay()
renderDay()
startGPS()
})

function setInitialDay(){
let today=new Date().toISOString().slice(0,10)
let index=data.days.findIndex(d=>d.date===today)
dayIndex=index>=0?index:0
}

function getHotel(){
let dayDate=data.days[dayIndex].date
let hotel=data.hotels[0]
data.hotels.forEach(h=>{
if(dayDate>=h.from) hotel=h
})
return hotel
}

function renderDay(){

let day=data.days[dayIndex]
let hotel=getHotel()

document.getElementById("dayTitle").innerText=day.title

const container=document.getElementById("stops")
container.innerHTML=""

addStop(container,"🏨 "+hotel.name,hotel.address,-1)

day.stops.forEach((s,i)=>{
addStop(container,s.icon+" "+s.name,s.address,i)
})

addStop(container,"🏨 Return "+hotel.name,hotel.address,-2)

highlightCurrent()

}

function addStop(container,name,address,index){

let el=document.createElement("div")
el.className="stop"
el.dataset.index=index

let badge=index>=0?String(index+1).padStart(2,"0"):""

el.innerHTML=`
<div class="row">
<span class="badge">${badge}</span>
<span class="title">${name}</span>
</div>
<div>${address}</div>
<button onclick="navigate('${address}')">Navigate</button>
<button onclick="meet('${name}','${address}')">💬 Meet</button>
`

if(index>=0){
el.onclick=()=>{
currentStopIndex=index
highlightCurrent()
}
}

container.appendChild(el)
}

function highlightCurrent(){

document.querySelectorAll(".stop").forEach(e=>{
e.classList.remove("current")
})

let el=document.querySelector(`[data-index="${currentStopIndex}"]`)
if(el) el.classList.add("current")

}

function navigate(addr){
window.open("https://www.google.com/maps/search/"+encodeURIComponent(addr))
}

function meet(name,address){
let msg="Meet at "+name+" https://maps.google.com/?q="+encodeURIComponent(address)
window.location.href="https://api.whatsapp.com/send?phone="+data.lawPhone+"&text="+encodeURIComponent(msg)
}

function startGPS(){

if(!navigator.geolocation) return

watchId=navigator.geolocation.watchPosition(pos=>{

let day=data.days[dayIndex]
let stop=day.stops[currentStopIndex]
if(!stop) return

let dist=distance(pos.coords.latitude,pos.coords.longitude,stop)

if(dist<60){
currentStopIndex++
highlightCurrent()
}

})

}

function distance(lat,lon,stop){

let url="https://maps.googleapis.com/maps/api/distancematrix/json"

return 999

}
