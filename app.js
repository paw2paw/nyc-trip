let data
let dayIndex=0
let stopIndex=0
let weatherTemp="?"
let weatherRain="?"

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
weatherTemp=Math.round(w.current_weather.temperature)
weatherRain=w.hourly?.precipitation_probability?.[0] ?? 0
render()
})
}

function render(){

let day=data.days[dayIndex]

document.getElementById("dayMeta").innerText="DAY "+(dayIndex+1)
document.getElementById("title").innerText=day.title

let html=""

for(let i=0;i<day.stops.length;i++){

let s=day.stops[i]
let active=i===stopIndex?"active":""

html+=`
<div class="stop ${active}" onclick="setStop(${i})">
<div><span class="seq">${(i+1).toString().padStart(2,"0")}</span><b>${s.icon||""} ${s.name}</b></div>
${s.address}
<div class="weather">🌡 ${weatherTemp}° &nbsp; 🌧 ${weatherRain}%</div>
</div>
`

if(i<day.stops.length-1){

let next=day.stops[i+1]

let walk=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.address)}&destination=${encodeURIComponent(next.address)}&travelmode=walking`
let transit=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.address)}&destination=${encodeURIComponent(next.address)}&travelmode=transit`
let drive=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.address)}&destination=${encodeURIComponent(next.address)}&travelmode=driving`

html+=`
<div class="travel">
🚶 <a onclick="event.stopPropagation()" href="${walk}" target="_blank">Walk</a>
🚇 <a onclick="event.stopPropagation()" href="${transit}" target="_blank">Subway</a>
🚕 <a onclick="event.stopPropagation()" href="${drive}" target="_blank">Taxi</a>
</div>
`
}

}

document.getElementById("stops").innerHTML=html
updateNext()
}

function setStop(i){
stopIndex=i
render()
}

function nextStop(){
let day=data.days[dayIndex]
if(stopIndex<day.stops.length-1){
stopIndex++
render()
}
}

function updateNext(){
let day=data.days[dayIndex]
let n=stopIndex+2
if(n<=day.stops.length){
document.getElementById("nextBtn").innerText="NEXT → "+n
}else{
document.getElementById("nextBtn").innerText="DAY COMPLETE"
}
}

function prevDay(){
if(dayIndex>0){
dayIndex--
stopIndex=0
render()
}
}

function nextDay(){
if(dayIndex<data.days.length-1){
dayIndex++
stopIndex=0
render()
}
}

let touchStartX=0
let touchStartY=0
let swipeActive=false

document.addEventListener("touchstart",e=>{
touchStartX=e.touches[0].clientX
touchStartY=e.touches[0].clientY
swipeActive=true
})

document.addEventListener("touchmove",e=>{
if(!swipeActive)return
let dx=e.touches[0].clientX-touchStartX
let dy=e.touches[0].clientY-touchStartY
if(Math.abs(dy)>Math.abs(dx)) swipeActive=false
})

document.addEventListener("touchend",e=>{
if(!swipeActive)return
let endX=e.changedTouches[0].clientX
let diff=endX-touchStartX
if(Math.abs(diff)<90)return
if(diff<0){nextDay()}else{prevDay()}
swipeActive=false
})

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
document.getElementById("menuOverlay").classList.toggle("show")
}

function closeMenu(){
document.getElementById("menu").classList.remove("open")
document.getElementById("menuOverlay").classList.remove("show")
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
if(!navigator.geolocation){alert("Location not supported");return}
navigator.geolocation.getCurrentPosition(p=>{
let lat=p.coords.latitude
let lon=p.coords.longitude
let msg="Meet here https://maps.google.com/?q="+lat+","+lon
window.open("https://wa.me/"+data.lawPhone+"?text="+encodeURIComponent(msg))
})
}
