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
<div class="seq">${(i+1).toString().padStart(2,"0")}</div>
<div class="info">
<b>${s.icon||""} ${s.name}</b><br>
${s.address}
</div>
</div>
`
})

document.getElementById("stops").innerHTML=html
updateNextButton()
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

function updateNextButton(){
let day=data.days[dayIndex]
let next=stopIndex+2
if(next<=day.stops.length){
document.getElementById("nextBtn").innerText="NEXT → "+next.toString().padStart(2,"0")
}else{
document.getElementById("nextBtn").innerText="DAY COMPLETE"
}
}

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
}

function closeMenu(){
document.getElementById("menu").classList.remove("open")
}

function returnHotel(){
closeMenu()
let h=data.hotels[0].address
window.open("https://maps.google.com/?q="+encodeURIComponent(h))
}

function showMap(){
closeMenu()
alert("Map view coming next")
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

let msg="Meet here: https://maps.google.com/?q="+lat+","+lon
let phone=data.lawPhone

window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg))
})
}
