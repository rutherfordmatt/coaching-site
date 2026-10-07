(function () {
    // ─── Old one-page anchor: How I work moved to the About page ───
    if (location.pathname === '/' && location.hash === '#process') {
        location.replace('/about/#process');
        return;
    }

    // ─── Nav scroll state ───
    const nav = document.getElementById('mainNav');
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ─── Mobile nav toggle ───
    const toggle   = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    const setMenu = (open) => {
        navLinks.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('open')) {
            setMenu(false);
            toggle.focus();
        }
    });

    // ─── Contact form (Formspree AJAX, falls back to a normal POST) ───
    const form = document.getElementById('contactForm');
    if (form) {
        const btn    = document.getElementById('submitBtn');
        const status = document.getElementById('formStatus');
        const label  = btn.textContent;

        // Links such as "Request a proposal" prefill the form:
        // /?subject=Proposal%20request&situation=sponsor#contact
        const params = new URLSearchParams(window.location.search);
        if (params.get('subject')) form.elements['_subject'].value = params.get('subject');
        if (params.get('situation')) {
            const option = form.querySelector(`#situation option[data-key="${params.get('situation')}"]`);
            if (option) option.selected = true;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            btn.textContent = 'Sending…';
            btn.disabled = true;
            status.textContent = '';
            status.classList.remove('is-error');

            try {
                const res = await fetch(form.action, {
                    method: 'POST',
                    body: new FormData(form),
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) throw new Error(res.status);
                form.reset();
                btn.hidden = true;
                status.textContent = "Thanks. I'll be in touch soon.";
            } catch {
                btn.textContent = label;
                btn.disabled = false;
                status.classList.add('is-error');
                status.textContent = 'That did not send. Please try again, or email me directly.';
            }
        });
    }

    // ─── Subtle fade-in on scroll ───
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.style.opacity = '1';
                    e.target.style.transform = 'translateY(0)';
                    observer.unobserve(e.target);
                }
            });
        }, { threshold: 0.1 });

        const faded = document.querySelectorAll('.package-card, .testimonial, .map-item, .step');
        faded.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease, background 0.3s, box-shadow 0.3s';
            observer.observe(el);
        });

        // Fail visible: if the observer has not fired after two seconds,
        // show whatever is still hidden rather than leave it blank.
        setTimeout(() => {
            faded.forEach(el => {
                if (el.style.opacity === '0') {
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                    observer.unobserve(el);
                }
            });
        }, 2000);
    }
})();
