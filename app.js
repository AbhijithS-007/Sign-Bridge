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
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y > 100) {
      island.style.padding = "4px 6px";
      island.style.gap = "2px";
    } else {
      island.style.padding = "";
      island.style.gap = "";
    }
    lastScroll = y;
  });
});
