
let data
let dayIndex=0
let currentStopIndex=0

const PAW="+4477684851513"
const LAW="+447956801171"

fetch("./data.json?v=31")
.then(r=>r.json())
.then(d=>{
data=d
setInitialDay()
renderDay()
})

function setInitialDay(){
let today=new Date().toISOString().slice(0,10)
let idx=data.days.findIndex(d=>d.date===today)
dayIndex=idx>=0?idx:0
}

function renderDay(){

let day=data.days[dayIndex]

let d=new Date(day.date)

let dayNum=String(dayIndex+1).padStart(2,"0")

document.getElementById("dayMeta").innerText=
"DAY "+dayNum+" · "+
d.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"})

document.getElementById("dayTitle").innerText=day.title

const container=document.getElementById("stops")

container.innerHTML=""

day.stops.forEach((s,i)=>{

let el=document.createElement("div")

el.className="stop"+(i===currentStopIndex?" current":"")

el.innerHTML=`

<div class="left">

<div class="badge">${String(i+1).padStart(2,"0")}</div>

<div>
<div>${s.icon} ${s.name}</div>
<div style="font-size:12px;color:#666">${s.address}</div>
</div>

</div>

<div class="right">
🌡 ${Math.round(5+Math.random()*5)}°
<br>
🌧 ${Math.round(Math.random()*40)}%
</div>

`

el.onclick=()=>{
currentStopIndex=i
renderDay()
}

container.appendChild(el)

})

updateNext()

}

function updateNext(){

let day=data.days[dayIndex]

let next=currentStopIndex+1

if(next>=day.stops.length){
document.getElementById("nextBtn").innerText="Return Hotel"
return
}

document.getElementById("nextBtn").innerText=
"NEXT → "+String(next+1).padStart(2,"0")

}

document.getElementById("nextBtn").onclick=()=>{

let day=data.days[dayIndex]

let stop=day.stops[currentStopIndex]

window.open("https://maps.google.com/?q="+encodeURIComponent(stop.address))

currentStopIndex++

if(currentStopIndex>=day.stops.length){
currentStopIndex=0
}

renderDay()

}



/***********************
DISTANCE TO CURRENT STOP
************************/

function updateDistances(){

if(!navigator.geolocation) return

navigator.geolocation.getCurrentPosition(pos=>{

let day=data.days[dayIndex]

day.stops.forEach((s,i)=>{

let row=document.querySelector(`[data-index="${i}"]`)
if(!row) return

let dist=getDistance(
pos.coords.latitude,
pos.coords.longitude,
s
)

let walk=Math.round(dist/80)  // ~80m/min

let dEl=row.querySelector(".distance")

if(dEl){
dEl.innerText=dist+"m · "+walk+" min walk"
}

})

})

}


function getDistance(lat,lon,stop){

let R=6371000

let parts=stop.address.split(",")

let dLat=(Math.random()*0.002)
let dLon=(Math.random()*0.002)

return Math.round(300+Math.random()*500)

}


/* refresh distances every minute */

setInterval(updateDistances,60000)


