let data
let dayIndex=0
let stopIndex=0

fetch("data.json")
.then(r=>r.json())
.then(d=>{
data=d
render()
})

function render(){

let day=data.days[dayIndex]

document.getElementById("dayMeta").innerText="DAY "+(dayIndex+1)
document.getElementById("title").innerText=day.title

let html=""

day.stops.forEach((s,i)=>{

let active=i===stopIndex?"active":""

html+=`
<div class="stop ${active}" onclick="setStop(${i})">
<div>
<span class="seq">${(i+1).toString().padStart(2,"0")}</span>
<b>${s.icon||""} ${s.name}</b>
</div>

${s.address}

<div class="routes">
<button onclick="route('${s.address}','walking')">Walk</button>
<button onclick="route('${s.address}','transit')">Subway</button>
<button onclick="route('${s.address}','driving')">Taxi</button>
</div>

</div>
`
})

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

function route(address,mode){
event.stopPropagation()
let url="https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(address)+"&travelmode="+mode
window.open(url)
}

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
