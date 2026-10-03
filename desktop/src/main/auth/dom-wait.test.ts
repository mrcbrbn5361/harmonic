// M-13: buildDomWaitScript — üretilen script saf JS olmalı (executeJavaScript SyntaxError
// tuzağına karşı new Function derlemesi), MutationObserver + üst sınır taşınmalı,
// node ortamında stub DOM ile çalıştırılabilir olmalı.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDomWaitScript } from './dom-wait';

interface StubState {
  present: boolean;
  fire: () => void;
}

function stubDom(): StubState {
  const state: StubState = { present: false, fire: () => {} };
  let cb: (() => void) | null = null;
  const doc = {
    documentElement: {},
    querySelector: () => (state.present ? { el: true } : null)
  };
  class MutationObserverStub {
    constructor(callback: () => void) {
      cb = callback;
    }
    observe(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('document', doc);
  vi.stubGlobal('MutationObserver', MutationObserverStub);
  state.fire = () => {
    state.present = true;
    if (cb) cb();
  };
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('buildDomWaitScript (M-13)', () => {
  it('üretilen script saf JS olarak derlenir (TS casting yok — SyntaxError tuzağına karşı)', () => {
    expect(() => new Function(buildDomWaitScript('ytmusic-nav-bar #avatar img, #account-name', 1500))).not.toThrow();
    const script = buildDomWaitScript('ytd-active-account-header-renderer #account-name', 1500);
    expect(script).not.toMatch(/\bas\s+[A-Za-z_]/);
  });

  it('seçici + MutationObserver + timeout üst sınırı script içinde taşınır', () => {
    const script = buildDomWaitScript('ytmusic-nav-bar #avatar img, #account-name', 1500);
    expect(script).toContain(JSON.stringify('ytmusic-nav-bar #avatar img, #account-name'));
    expect(script).toContain('MutationObserver');
    expect(script).toContain('},1500);');
  });

  it('negatif timeout 0\u0027a sabitlenir', () => {
    const script = buildDomWaitScript('#x', -5);
    expect(script).toContain('},0);');
  });

  it('seçici hazırken anında resolve(true) döner', async () => {
    const state = stubDom();
    state.present = true;
    const run = new Function(`return ${buildDomWaitScript('#account-name', 5000)}`);
    expect(await run()).toBe(true);
  });

  it('timeout\u0027ta resolve(false) döner (üst sınır)', async () => {
    stubDom();
    vi.useFakeTimers();
    const run = new Function(`return ${buildDomWaitScript('#account-name', 50)}`);
    const p = run();
    await vi.advanceTimersByTimeAsync(50);
    expect(await p).toBe(false);
  });

  it('mutation sonrası erken resolve(true) döner (olay-tabanlı)', async () => {
    const state = stubDom();
    vi.useFakeTimers();
    const run = new Function(`return ${buildDomWaitScript('#account-name', 5000)}`);
    const p = run();
    await vi.advanceTimersByTimeAsync(10);
    state.fire();
    expect(await p).toBe(true);
  });
});
