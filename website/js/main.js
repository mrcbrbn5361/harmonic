// Harmonic Website - Main Script
document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu
  const btn = document.getElementById('mobileMenuBtn');
  const links = document.querySelector('.nav-links');
  const actions = document.querySelector('.nav-actions');

  btn?.addEventListener('click', () => {
    links?.classList.toggle('active');
    actions?.classList.toggle('active');
  });

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  });

  // Download button
  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const href = btn.getAttribute('href');
      if (href && href.startsWith('http')) {
        return; // GitHub releases link — let it navigate naturally
      }
      e.preventDefault();
      const platform = btn.dataset.platform;
      const modal = document.createElement('div');
      modal.className = 'download-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <button class="modal-close">&times;</button>
          <h3>İndirme Başlıyor</h3>
          <p>Harmonic ${platform === 'windows' ? 'Windows 11' : ''} sürümü indiriliyor...</p>
          <div class="download-progress">
            <div class="progress-bar"><div class="progress-fill"></div></div>
            <span class="progress-text">Hazırlanıyor...</span>
          </div>
          <p style="font-size:13px;color:#666;margin-top:12px">Tarayıcınızın indirme yöneticisini kontrol edin.</p>
        </div>
      `;
      const style = document.createElement('style');
      style.textContent = `
        .download-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fadeIn .3s}
        .modal-content{background:#1a1a1a;border-radius:16px;padding:32px;max-width:400px;width:90%;text-align:center;position:relative}
        .modal-close{position:absolute;top:16px;right:16px;background:none;border:none;color:#666;font-size:24px;cursor:pointer}
        .modal-close:hover{color:#fff}
        .modal-content h3{font-size:20px;margin-bottom:8px}
        .modal-content p{color:#a0a0a0;margin-bottom:16px}
        .progress-bar{height:6px;background:#333;border-radius:3px;overflow:hidden;margin-bottom:8px}
        .progress-fill{height:100%;background:#ff0000;width:0%;animation:prog 2s ease-out forwards}
        .progress-text{font-size:12px;color:#666}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes prog{0%{width:0%}50%{width:70%}100%{width:100%}}
      `;
      document.head.appendChild(style);
      document.body.appendChild(modal);
      modal.querySelector('.modal-close').onclick = () => modal.remove();
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
    });
  });

  // Nav link active state
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPage) a.classList.add('active');
  });
});
