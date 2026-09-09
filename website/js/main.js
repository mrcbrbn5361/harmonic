// Harmonic Website - Main Script
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mobileMenuBtn');
  const links = document.querySelector('.nav-links');
  const actions = document.querySelector('.nav-actions');
  function closeMenu() { links?.classList.remove('mobile-open'); actions?.classList.remove('mobile-open'); btn?.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
  function openMenu() { links?.classList.add('mobile-open'); actions?.classList.add('mobile-open'); btn?.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; }
  btn?.setAttribute('aria-label','Menüyü aç'); btn?.setAttribute('aria-expanded','false');
  btn?.addEventListener('click', () => {
    const isOpen = links?.classList.contains('mobile-open');
    isOpen ? closeMenu() : openMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('click', e => { if (!e.target.closest('.navbar') && links?.classList.contains('mobile-open')) closeMenu(); });
  links?.querySelectorAll('a').forEach(a=>a.addEventListener('click', closeMenu));

  document.querySelectorAll('.faq-question').forEach(q => {
    q.setAttribute('aria-expanded','false');
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => { i.classList.remove('active'); i.querySelector('.faq-question')?.setAttribute('aria-expanded','false'); });
      if (!wasActive) { item.classList.add('active'); q.setAttribute('aria-expanded','true'); }
    });
  });

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPage) a.classList.add('active');
  });
});
