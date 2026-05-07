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

  // Create shared tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'sign-tooltip';
  tooltip.innerHTML = `<div class="sign-tooltip-inner">
    <img id="tt-img" src="" alt=""/>
    <div class="sign-tooltip-label" id="tt-label"></div>
  </div>`;
  document.body.appendChild(tooltip);

  const ttImg   = tooltip.querySelector('#tt-img');
  const ttLabel = tooltip.querySelector('#tt-label');
  let hideTimer = null;

  function positionTooltip(cardEl) {
    const r = cardEl.getBoundingClientRect();
    const tw = 180, th = 210; // tooltip approx size
    let left = r.left + r.width / 2 - tw / 2;
    let top  = r.top - th - 10;          // prefer above
    if (top < 8) top = r.bottom + 10;    // flip below if no room
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }

  function buildGrid(containerId, signs) {
    const grid = document.getElementById(containerId);
    if (!grid) return;

    signs.forEach(sign => {
      const card = document.createElement('div');
      card.className = 'sign-card';

      const src = `assets/images/signs/${sign.toLowerCase()}.jpg`;

      // Pre-load image to know if it exists
      const preload = new Image();
      preload.onload  = () => card.classList.remove('no-image');
      preload.onerror = () => card.classList.add('no-image');
      preload.src = src;

      // Letter label only — centered, large
      const label = document.createElement('div');
      label.className = 'sign-label';
      label.textContent = sign;
      card.appendChild(label);

      // Hover: show tooltip popup
      card.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        ttImg.src   = src;
        ttLabel.textContent = sign;
        positionTooltip(card);
        tooltip.classList.add('visible');
      });
      card.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(() => tooltip.classList.remove('visible'), 80);
      });

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

// Remove old lightbox functions (replaced by hover tooltip)
function openLightbox(){}
function closeLightbox(){}
