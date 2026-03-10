let data
let dayIndex=0

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
html+=`<div class="stop"><b>${i+1}. ${s.name}</b><br>${s.address}</div>`
})
document.getElementById("stops").innerHTML=html
}

function toggleMenu(){
document.getElementById("menu").classList.toggle("open")
}

function returnHotel(){alert("Return Hotel")}
function showMap(){alert("Map")}
function nearbyCoffee(){window.open("https://maps.google.com/search/coffee+near+me")}
function nearbyFood(){window.open("https://maps.google.com/search/food+near+me")}
function sendMyLocation(){alert("Location")}
