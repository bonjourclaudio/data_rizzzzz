let emergencyToggle = false
let emergencyButton = document.getElementById('emergency-btn');
let navbar = document.getElementById('navbar');


if (emergencyButton && navbar) {
  emergencyButton.addEventListener('click', function() {
    emergencyToggle = !emergencyToggle;
    emergencyButton.innerHTML = emergencyToggle ? 'Resolve Emergency' : 'Emergency';
    emergencyButton.classList.toggle('active', emergencyToggle);
    navbar.classList.toggle('emergency', emergencyToggle);
  });
}