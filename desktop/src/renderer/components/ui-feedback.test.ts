import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  show,
  hide,
  toggle,
  toastClassFor,
  toastBottomFor,
  buildToast,
  showToast,
  confirmDialog,
  applyClosePanels,
  closePanels,
  type PanelState,
} from './ui-feedback';

// ── Minimal fake DOM (node env'de çalışır) ──
function makeClassList(initial: string[] = []) {
  const set = new Set<string>(initial);
  return {
    add: (...c: string[]) => {
      c.forEach((x) => set.add(x));
    },
    remove: (...c: string[]) => {
      c.forEach((x) => set.delete(x));
    },
    contains: (c: string) => set.has(c),
    has: (c: string) => set.has(c),
  };
}

function makeEl(initial: string[] = []) {
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const el: any = {
    classList: makeClassList(initial),
    style: {} as Record<string, string>,
    textContent: '',
    className: '',
    children: [] as any[],
    onclick: null as any,
    removed: false,
    appendChild(child: any) {
      el.children.push(child);
      return child;
    },
    addEventListener(t: string, fn: (e: any) => void) {
      (listeners[t] ??= []).push(fn);
    },
    removeEventListener(t: string, fn: (e: any) => void) {
      listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
    },
    querySelector(sel: string) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return el.children.find((c: any) => c.className === cls) ?? null;
      }
      return null;
    },
    remove() {
      el.removed = true;
    },
    _listeners: listeners,
    _fire(t: string, e: any) {
      (listeners[t] || []).forEach((f) => f(e));
    },
  };
  return el;
}

const asHtml = (el: any) => el as unknown as HTMLElement;

describe('show / hide / toggle', () => {
  it('open+visible ekler/kaldırır, toggle duruma göre çevirir', () => {
    const el = makeEl();
    show(asHtml(el));
    expect(el.classList.has('open')).toBe(true);
    expect(el.classList.has('visible')).toBe(true);

    toggle(asHtml(el));
    expect(el.classList.has('open')).toBe(false);
    expect(el.classList.has('visible')).toBe(false);

    toggle(asHtml(el));
    expect(el.classList.has('open')).toBe(true);
    expect(el.classList.has('visible')).toBe(true);

    hide(asHtml(el));
    expect(el.classList.has('open')).toBe(false);
    expect(el.classList.has('visible')).toBe(false);
  });
});

describe('toastClassFor / toastBottomFor', () => {
  it('tip sınıfını ve varsayılan info sınıfını üretir', () => {
    expect(toastClassFor('success')).toBe('toast toast-success');
    expect(toastClassFor('error')).toBe('toast toast-error');
    expect(toastClassFor()).toBe('toast toast-info');
  });

  it('stack offsetini 100 + 60*n formülüyle üretir', () => {
    expect(toastBottomFor(0)).toBe('100px');
    expect(toastBottomFor(2)).toBe('220px');
  });
});

describe('buildToast', () => {
  it('mesaj + kapatma düğmesi içeren toast kurar', () => {
    const created: any[] = [];
    const fakeDoc = {
      createElement: (tag: string) => {
        const el = makeEl();
        el.tag = tag;
        created.push(el);
        return el;
      },
    } as unknown as Document;
    const toast = buildToast(fakeDoc, 'Merhaba', 'warning');
    expect(toast.className).toBe('toast toast-warning');
    expect(created.length).toBe(3);
    expect(created[1].textContent).toBe('Merhaba');
    expect(created[2].className).toBe('toast-close');
    expect(created[2].textContent).toBe('×');
  });
});

describe('showToast', () => {
  const realDoc = (globalThis as any).document;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (realDoc === undefined) delete (globalThis as any).document;
    else (globalThis as any).document = realDoc;
    vi.restoreAllMocks();
  });

  function stubDoc(existingShown: any[]) {
    const created: any[] = [];
    const appended: any[] = [];
    const toastHolder: { el: any | null } = { el: null };
    const fakeDoc: any = {
      createElement: (tag: string) => {
        const el = makeEl();
        el.tag = tag;
        created.push(el);
        if (tag === 'div' && toastHolder.el === null && created.length === 1) toastHolder.el = el;
        return el;
      },
      body: {
        appendChild: (el: any) => {
          appended.push(el);
        },
      },
      querySelectorAll: (_sel: string) => existingShown,
    };
    (globalThis as any).document = fakeDoc;
    return { created, appended, toastHolder };
  }

  it('toast ekler, stack offset uygular, zamanla kaldırır', () => {
    const { appended } = stubDoc([{}, {}]); // 2 gösterimde toast
    showToast('Kayıt silindi', 'success');
    expect(appended.length).toBe(1);
    const toast = appended[0];
    expect(toast.className).toBe('toast toast-success');
    expect(toast.style.bottom).toBe('220px');

    expect(toast.classList.has('show')).toBe(false);
    vi.advanceTimersByTime(10);
    expect(toast.classList.has('show')).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(toast.classList.has('show')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(toast.removed).toBe(true);
  });

  it('kapatma düğmesi toastı erken kapatır', () => {
    const { appended } = stubDoc([]);
    showToast('Bilgi', 'info');
    const toast = appended[0];
    vi.advanceTimersByTime(10);
    const closeBtn = toast.querySelector('.toast-close');
    expect(closeBtn).not.toBeNull();
    closeBtn._fire('click', {});
    expect(toast.classList.has('show')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(toast.removed).toBe(true);
  });
});

describe('confirmDialog', () => {
  const realDoc = (globalThis as any).document;

  afterEach(() => {
    if (realDoc === undefined) delete (globalThis as any).document;
    else (globalThis as any).document = realDoc;
    vi.restoreAllMocks();
  });

  function stubConfirm(parts: Record<string, any>) {
    const keyHandlers: Array<(e: any) => void> = [];
    const fakeDoc: any = {
      querySelector: (sel: string) => parts[sel] ?? null,
      addEventListener: vi.fn((_t: string, fn: (e: any) => void) => {
        keyHandlers.push(fn);
      }),
      removeEventListener: vi.fn((t: string, fn: (e: any) => void) => {
        const i = keyHandlers.indexOf(fn);
        if (i >= 0 && t === 'keydown') keyHandlers.splice(i, 1);
      }),
    };
    (globalThis as any).document = fakeDoc;
    return { fakeDoc, keyHandlers };
  }

  function fullParts() {
    return {
      '#confirmModal': makeEl(),
      '#confirmTitle': makeEl(),
      '#confirmMessage': makeEl(),
      '#confirmOk': makeEl(),
      '#confirmCancel': makeEl(),
    };
  }

  it('modal yoksa false çözer', async () => {
    stubConfirm({});
    await expect(confirmDialog('T', 'M')).resolves.toBe(false);
  });

  it('metinleri yazar, ok onayında true döner ve temizler', async () => {
    const parts = fullParts();
    const { fakeDoc } = stubConfirm(parts);
    const p = confirmDialog('Listeyi Sil', 'Emin misin?', 'Evet');
    expect(parts['#confirmTitle'].textContent).toBe('Listeyi Sil');
    expect(parts['#confirmMessage'].textContent).toBe('Emin misin?');
    expect(parts['#confirmOk'].textContent).toBe('Evet');
    expect(parts['#confirmModal'].classList.has('visible')).toBe(true);
    parts['#confirmOk'].onclick();
    await expect(p).resolves.toBe(true);
    expect(parts['#confirmModal'].classList.has('visible')).toBe(false);
    expect(parts['#confirmOk'].onclick).toBeNull();
    expect(parts['#confirmCancel'].onclick).toBeNull();
    expect(fakeDoc.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('varsayılan ok etiketi Sil olur, vazgeç false döner', async () => {
    const parts = fullParts();
    stubConfirm(parts);
    const p = confirmDialog('T', 'M');
    expect(parts['#confirmOk'].textContent).toBe('Sil');
    parts['#confirmCancel'].onclick();
    await expect(p).resolves.toBe(false);
  });

  it('backdrop tıklaması false döner, içeri tıklama bekler', async () => {
    const parts = fullParts();
    stubConfirm(parts);
    const p = confirmDialog('T', 'M');
    let settled: boolean | null = null;
    p.then((v) => {
      settled = v;
    });
    parts['#confirmModal'].onclick({ target: {} });
    await Promise.resolve();
    expect(settled).toBeNull();
    parts['#confirmModal'].onclick({ target: parts['#confirmModal'] });
    await expect(p).resolves.toBe(false);
  });

  it('Escape false döner, başka tuş bekletir', async () => {
    const parts = fullParts();
    const { keyHandlers } = stubConfirm(parts);
    const p = confirmDialog('T', 'M');
    let settled: boolean | null = null;
    p.then((v) => {
      settled = v;
    });
    keyHandlers.forEach((h) => h({ key: 'Enter' }));
    await Promise.resolve();
    expect(settled).toBeNull();
    keyHandlers.slice().forEach((h) => h({ key: 'Escape' }));
    await expect(p).resolves.toBe(false);
  });
});

describe('applyClosePanels / closePanels', () => {
  const realDoc = (globalThis as any).document;

  afterEach(() => {
    if (realDoc === undefined) delete (globalThis as any).document;
    else (globalThis as any).document = realDoc;
  });

  it('state sıfırlar, panelleri ve backdropı gizler', () => {
    const s: PanelState = { panelOpen: 'lyrics' };
    const p1 = makeEl(['open', 'visible']);
    const p2 = makeEl(['open', 'visible']);
    const bd = makeEl(['open', 'visible']);
    applyClosePanels(s, [asHtml(p1), asHtml(p2)], asHtml(bd));
    expect(s.panelOpen).toBeNull();
    expect(p1.classList.has('open')).toBe(false);
    expect(p2.classList.has('visible')).toBe(false);
    expect(bd.classList.has('open')).toBe(false);
  });

  it('backdrop yoksa çökmeden kapatır', () => {
    const s: PanelState = { panelOpen: 'queue' };
    const p1 = makeEl(['open']);
    expect(() =>
      applyClosePanels(s, [asHtml(p1)], null)
    ).not.toThrow();
    expect(s.panelOpen).toBeNull();
  });

  it('closePanels document üzerinden panelleri toplar', () => {
    const s: PanelState = { panelOpen: 'queue' };
    const p1 = makeEl(['open', 'visible']);
    const bd = makeEl(['visible']);
    (globalThis as any).document = {
      querySelectorAll: (sel: string) => (sel === '.panel' ? [p1] : []),
      querySelector: (sel: string) => (sel === '#panelBackdrop' ? bd : null),
    };
    closePanels(s);
    expect(s.panelOpen).toBeNull();
    expect(p1.classList.has('open')).toBe(false);
    expect(bd.classList.has('visible')).toBe(false);
  });
});
