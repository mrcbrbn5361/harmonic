/* ============================================
   Harmonic - UI Feedback Helpers (P0, streaming-only)
   Toast/confirm/panel primitifleri — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   Tek fark: closePanels'ta backdrop yoksa throw yerine no-op
   (pratikte backdrop hep vardır; crash'e bağımlı çağrı yok).
   Offline/download kapsam dışıdır.
   ============================================ */

import type { AppState } from './state';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type PanelState = Pick<AppState, 'panelOpen'>;

export function show(el: HTMLElement): void {
  el.classList.add('open', 'visible');
}

export function hide(el: HTMLElement): void {
  el.classList.remove('open', 'visible');
}

export function toggle(el: HTMLElement): void {
  if (el.classList.contains('open')) {
    hide(el);
  } else {
    show(el);
  }
}

/** Toast class kararı: `toast toast-${type}`. */
export function toastClassFor(type: ToastType = 'info'): string {
  return `toast toast-${type}`;
}

/** Toast stack konumu: gösterimdeki toast sayısına göre alt offset. */
export function toastBottomFor(existingShown: number): string {
  return `${100 + existingShown * 60}px`;
}

/** Toast DOM'unu kurar (ekleme/zamanlama showToast'tadır). */
export function buildToast(doc: Document, message: string, type: ToastType = 'info'): HTMLElement {
  const toast = doc.createElement('div');
  toast.className = toastClassFor(type);
  const span = doc.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  const closeBtn = doc.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  toast.appendChild(closeBtn);
  return toast as HTMLElement;
}

export function showToast(message: string, type: ToastType = 'info'): void {
  const toast = buildToast(document, message, type);
  document.body.appendChild(toast);

  // Stack: position based on existing toasts
  const existing = document.querySelectorAll('.toast.show');
  toast.style.bottom = toastBottomFor(existing.length);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);

  toast.querySelector('.toast-close')?.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });
}

// ── Generic Confirm (native confirm() yerine — P3-07) ──
export function confirmDialog(title: string, message: string, okLabel = 'Sil'): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.querySelector('#confirmModal') as HTMLElement | null;
    const titleEl = document.querySelector('#confirmTitle') as HTMLElement | null;
    const msgEl = document.querySelector('#confirmMessage') as HTMLElement | null;
    const okBtn = document.querySelector('#confirmOk') as HTMLButtonElement | null;
    const cancelBtn = document.querySelector('#confirmCancel') as HTMLElement | null;
    if (!modal || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }
    (titleEl as HTMLElement).textContent = title;
    (msgEl as HTMLElement).textContent = message;
    okBtn.textContent = okLabel;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
    };
    const done = (v: boolean) => {
      modal.classList.remove('visible');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      (modal as HTMLElement).onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
    (modal as HTMLElement).onclick = (e) => {
      if (e.target === modal) done(false);
    };
    document.addEventListener('keydown', onKey);
    modal.classList.add('visible');
  });
}

/** Panelleri kapatmanın saf çekirdeği: state sıfırla + verilen panelleri gizle. */
export function applyClosePanels(
  panelState: PanelState,
  panels: HTMLElement[],
  backdrop: HTMLElement | null | undefined
): void {
  panelState.panelOpen = null;
  for (const p of panels) hide(p);
  if (backdrop) hide(backdrop);
}

/** app.ts'teki closePanels ile aynı: state sıfırla + .panel'leri + backdrop'ı gizle. */
export function closePanels(panelState: PanelState): void {
  const panels = Array.from(document.querySelectorAll('.panel')) as HTMLElement[];
  const backdrop = document.querySelector('#panelBackdrop') as HTMLElement | null;
  applyClosePanels(panelState, panels, backdrop);
}
