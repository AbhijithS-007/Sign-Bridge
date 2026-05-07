/**
 * SignBridge — app.js
 * Scroll animations, floating nav highlighting, reveal-on-scroll
 */

document.addEventListener("DOMContentLoaded", () => {
  // ── Section backgrounds ──
  document.querySelectorAll(".scroll-section").forEach(sec => {
    const bg = sec.querySelector(".section-bg");
    const url = sec.dataset.bg;
    if (bg && url) bg.style.backgroundImage = `url('${url}')`;
  });

  // ── Floating nav: highlight active section ──
  const sections = document.querySelectorAll(".scroll-section");
  const navPills = document.querySelectorAll(".nav-pill");

  const setActive = (id) => {
    navPills.forEach(p => {
      p.classList.toggle("active", p.dataset.section === id);
    });
  };

  // Click to scroll
  navPills.forEach(pill => {
    pill.addEventListener("click", () => {
      const target = document.getElementById(pill.dataset.section);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Intersection Observer for nav highlighting
  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActive(entry.target.id);
    });
  }, { threshold: 0.4 });

  sections.forEach(s => navObserver.observe(s));

  // ── Reveal on scroll ──
  const revealEls = document.querySelectorAll("[data-reveal]");
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealEls.forEach(el => revealObserver.observe(el));

  // ── Parallax on section backgrounds ──
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        sections.forEach(sec => {
          const bg = sec.querySelector(".section-bg");
          if (!bg) return;
          const rect = sec.getBoundingClientRect();
          const offset = rect.top * 0.15;
          bg.style.transform = `translateY(${offset}px) scale(1.1)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  });

  // ── Floating nav: shrink on scroll ──
  const island = document.querySelector(".nav-island");
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    island.style.padding = y > 100 ? "4px 6px" : "";
    island.style.gap     = y > 100 ? "2px"   : "";
  });

  // ── Build sign grids ──
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const DIGITS  = '0123456789'.split('');

  function buildGrid(containerId, signs) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    signs.forEach(sign => {
      const card = document.createElement('div');
      card.className = 'sign-card';
      card.title = `ASL sign for "${sign}"`;

      const src = `assets/images/signs/${sign.toLowerCase()}.jpg`;
      const img = document.createElement('img');
      img.alt = `ASL ${sign}`;
      img.loading = 'lazy';

      // Show placeholder until image loads; hide placeholder on success
      const placeholder = document.createElement('div');
      placeholder.className = 'sign-placeholder';
      placeholder.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 11V6.5a2.5 2.5 0 0 0-5 0v3m0 0V6.5a2.5 2.5 0 0 0-5 0V15l-1.5-1.5a2 2 0 0 0-2.83 2.83L7 19a6 6 0 0 0 4.24 1.76H15a5 5 0 0 0 5-5v-4"/>
        </svg>
        <span>Run Notebook 4</span>`;

      img.onload  = () => { placeholder.remove(); card.insertBefore(img, label); };
      img.onerror = () => { /* placeholder stays */ };
      img.src = src;

      const label = document.createElement('div');
      label.className = 'sign-label';
      label.textContent = sign;

      card.appendChild(placeholder);
      card.appendChild(label);

      card.addEventListener('click', () => openLightbox(src, sign));
      grid.appendChild(card);
    });
  }

  buildGrid('letters-grid', LETTERS);
  buildGrid('numbers-grid', DIGITS);
});

// ── Tab switching ──
function switchSignTab(tab) {
  ['letters','numbers','tips'].forEach(t => {
    document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
}

// ── Lightbox ──
function openLightbox(src, label) {
  const lb = document.getElementById('sign-lightbox');
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-label').textContent = label;
  lb.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('sign-lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}
