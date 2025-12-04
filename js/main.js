let emergencyToggle = false
let emergencyButton = document.getElementById('emergency-btn');
let navbar = document.getElementById('navbar');

let warnlogToggle = false
let warnlogButton = document.getElementById('log-btn');
let warnlogPanel = document.getElementById('log-panel');


// if (emergencyButton && navbar) {
emergencyButton.addEventListener('click', function() {
    emergencyToggle = !emergencyToggle;
    emergencyButton.innerHTML = emergencyToggle ? 'Resolve Emergency' : 'Emergency';
    emergencyButton.classList.toggle('active', emergencyToggle);
    navbar.classList.toggle('emergency', emergencyToggle);
});
// }

if (warnlogButton && warnlogPanel) {
    warnlogButton.addEventListener('click', function() {
    warnlogToggle = !warnlogToggle;
    // warnlogButton.classList.toggle('active', warnlogToggle);
    warnlogPanel.style.display = warnlogToggle ? 'block' : 'none';
});
}