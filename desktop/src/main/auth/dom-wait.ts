// M-13: sabit aralıklı poll yerine olay-tabanlı DOM bekleme yardımcıları.
// executeJavaScript/Runtime.evaluate sayfada SAF JS çalıştırır — üretilen script'te
// TS sözdizimi YOK (bk. memory: chromium-executejavascript-syntaxerror-with-typescript-casting).
// MutationObserver, seçici DOM'da göründüğü anda resolve eder; timeoutMs üst sınır korunur.

export function buildDomWaitScript(selector: string, timeoutMs: number): string {
  const bounded = Math.max(0, Math.floor(timeoutMs));
  return (
    '(function(){return new Promise(function(resolve){' +
    'var sel=' + JSON.stringify(selector) + ';' +
    'if(document.querySelector(sel)){resolve(true);return;}' +
    'var done=false;' +
    'var obs=new MutationObserver(function(){if(!done&&document.querySelector(sel)){done=true;obs.disconnect();clearTimeout(tid);resolve(true);}});' +
    'obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true});' +
    'var tid=setTimeout(function(){if(!done){done=true;obs.disconnect();resolve(false);}},' + bounded + ');' +
    '})})()'
  );
}
