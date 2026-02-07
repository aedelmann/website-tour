// Main JavaScript for World Tour Website

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initializeAnimations();
    initializeMap();
    initializePhotoGallery();
    initializeContactForm();
});

// Animation and scroll effects
function initializeAnimations() {
    // Fade in elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);

    // Observe all cards and sections
    document.querySelectorAll('.card, .stat-item, .contact-info').forEach(el => {
        observer.observe(el);
    });

    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    });
}

// Map functionality
function initializeMap() {
    // This will be handled by individual map pages
    console.log('Map functionality initialized');
}

// Photo gallery functionality
function initializePhotoGallery() {
    // Lightbox effect for gallery images
    const galleryImages = document.querySelectorAll('.photo-gallery img');
    
    galleryImages.forEach(img => {
        img.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('galleryModal'));
            document.getElementById('modalImage').src = this.src;
            const capEl = document.getElementById('modalImageCaption');
            if (capEl) {
                const desc = (this.getAttribute && this.getAttribute('data-caption')) || this.alt || '';
                if (desc && desc.trim()) {
                    capEl.textContent = desc.trim();
                    capEl.style.display = 'block';
                } else {
                    capEl.textContent = '';
                    capEl.style.display = 'none';
                }
            }
            modal.show();
        });
    });

    // Lazy loading for images
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src || img.src;
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

// Contact form functionality
function initializeContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
    }
}

function handleContactForm(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const resultDiv = document.getElementById('formResult');
    
    // Show loading state
    resultDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin me-2"></i>Sending message...</div>';
    
    // Simulate API call (replace with actual form handling service)
    setTimeout(() => {
        const email = formData.get('email');
        const name = formData.get('name');
        const subject = formData.get('subject');
        const message = formData.get('message');
        
        // Create mailto link as fallback
        const mailtoBody = `From: ${name} (${email})\n\n${message}`;
        const mailtoLink = `mailto:alexander.edelmann80@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`;
        
        resultDiv.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Thank you for your message, ${name}! 
                <a href="${mailtoLink}" class="alert-link">Click here to send via email</a>
            </div>
        `;
        
        e.target.reset();
    }, 1500);
}

// Utility functions
function formatDistance(km) {
    if (km >= 1000) {
        return (km / 1000).toFixed(1) + 'k km';
    }
    return km + ' km';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Search functionality
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(performSearch, 300));
    }
}

function performSearch(e) {
    const query = e.target.value.toLowerCase();
    const posts = document.querySelectorAll('.post-item');
    
    posts.forEach(post => {
        const title = post.querySelector('.card-title').textContent.toLowerCase();
        const summary = post.querySelector('.card-text').textContent.toLowerCase();
        const location = post.dataset.location ? post.dataset.location.toLowerCase() : '';
        
        if (title.includes(query) || summary.includes(query) || location.includes(query)) {
            post.style.display = 'block';
        } else {
            post.style.display = 'none';
        }
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Tesla-specific utilities
function calculateTeslaStats(distance, weather, elevation) {
    const baseEfficiency = 0.18; // kWh per km
    const weatherFactor = weather < 10 ? 1.2 : weather > 30 ? 1.1 : 1.0;
    const elevationFactor = elevation > 1000 ? 1.15 : 1.0;
    
    const estimatedEnergy = distance * baseEfficiency * weatherFactor * elevationFactor;
    const chargingStops = Math.ceil(distance / 400); // Assuming 400km between charges
    
    return {
        energyUsed: Math.round(estimatedEnergy),
        chargingStops: chargingStops,
        efficiency: (estimatedEnergy / distance * 100).toFixed(1) + ' kWh/100km'
    };
}

// Export functions for use in other scripts
window.WorldTourUtils = {
    formatDistance,
    formatDate,
    calculateTeslaStats,
    debounce
};
