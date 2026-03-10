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

let stopsHTML=""

day.stops.forEach((s,i)=>{
stopsHTML+=`
<div class="stop" onclick="setStop(${i})">
<b>${i+1}. ${s.name}</b><br>
${s.address}
</div>`
})

document.getElementById("stops").innerHTML=stopsHTML

}

function setStop(i){
stopIndex=i
}

function toggleMenu(){
let m=document.getElementById("menu")
let o=document.getElementById("menuOverlay")

m.classList.toggle("open")
o.classList.toggle("show")
}

function returnHotel(){
alert("Return to hotel")
}

function showMap(){
alert("Map view")
}

function nearbyCoffee(){
window.open("https://maps.google.com/search/coffee+near+me")
}

function nearbyFood(){
window.open("https://maps.google.com/search/food+near+me")
}

function sendMyLocation(){
alert("Send location")
}
