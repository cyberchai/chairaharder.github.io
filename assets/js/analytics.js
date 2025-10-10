// Track navigation clicks
document.querySelectorAll('#navbar .nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
        window.dataLayer.push({
            'event': 'navigation_click',
            'navigation_name': this.textContent,
            'navigation_url': this.getAttribute('href')
        });
    });
});

// Track social media clicks
document.querySelectorAll('.social-links a').forEach(link => {
    link.addEventListener('click', function(e) {
        window.dataLayer.push({
            'event': 'social_click',
            'social_platform': this.className,
            'social_url': this.getAttribute('href')
        });
    });
});

// Track portfolio filter clicks
document.querySelectorAll('#portfolio-flters li').forEach(filter => {
    filter.addEventListener('click', function(e) {
        window.dataLayer.push({
            'event': 'portfolio_filter',
            'filter_category': this.getAttribute('data-filter')
        });
    });
});

// Track portfolio item clicks
document.querySelectorAll('.portfolio-links a').forEach(link => {
    link.addEventListener('click', function(e) {
        const portfolioItem = this.closest('.portfolio-item');
        const category = portfolioItem.className.split(' ').find(cls => cls.startsWith('filter-')).replace('filter-', '');
        const title = portfolioItem.querySelector('h4').textContent;
        
        window.dataLayer.push({
            'event': 'portfolio_click',
            'portfolio_category': category,
            'portfolio_title': title,
            'click_type': this.querySelector('i').className.includes('plus') ? 'preview' : 'details'
        });
    });
});

// Track resume download
document.querySelectorAll('a[download="ChairaHarderResume.pdf"]').forEach(link => {
    link.addEventListener('click', function(e) {
        window.dataLayer.push({
            'event': 'resume_download',
            'download_location': this.closest('section') ? this.closest('section').id : 'header'
        });
    });
});

// Track skill section visibility
const skillsSection = document.querySelector('.skills');
if (skillsSection) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                window.dataLayer.push({
                    'event': 'skills_view',
                    'visibility_time': new Date().toISOString()
                });
                observer.unobserve(entry.target);
            }
        });
    });
    observer.observe(skillsSection);
}