/* ---------------- INSTALAR APP (PWA) ---------------- */
// Chrome/Android: capturamos `beforeinstallprompt` y mostramos un chip discreto
// en el header. iOS/Safari no tiene ese evento: ahi solo mostramos una pista
// ("Compartir -> Agregar a pantalla de inicio"). Nunca es un modal ni toca el
// flujo de caja; se puede descartar y esa decision se recuerda.

const INSTALL_DISMISSED_KEY = 'harumimi-install-dismissed';
let deferredInstallPrompt = null;
let appJustInstalled = false;

function isStandalone(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

function isIOS(){
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se reporta como "MacIntel" pero con pantalla tactil
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installDismissed(){
  try{ return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'; }catch(e){ return false; }
}

function rememberInstallDismissed(){
  try{ localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); }catch(e){}
}

function renderInstallUI(){
  const row = document.getElementById('installRow');
  const btn = document.getElementById('installBtn');
  const hint = document.getElementById('installHint');
  const eligible = !appJustInstalled && !isStandalone() && !installDismissed();
  const canPrompt = !!deferredInstallPrompt;
  const showIOSHint = eligible && !canPrompt && isIOS();
  btn.hidden = !(eligible && canPrompt);
  hint.hidden = !showIOSHint;
  row.hidden = btn.hidden && hint.hidden;
}

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallUI();
});

window.addEventListener('appinstalled', ()=>{
  appJustInstalled = true;
  deferredInstallPrompt = null;
  renderInstallUI();
});

document.getElementById('installBtn').addEventListener('click', ()=>{
  if(!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  // el evento solo se puede usar una vez
  deferredInstallPrompt = null;
  renderInstallUI();
  promptEvent.prompt();
});

document.getElementById('installClose').addEventListener('click', ()=>{
  rememberInstallDismissed();
  renderInstallUI();
});

if(window.matchMedia){
  const standaloneMq = window.matchMedia('(display-mode: standalone)');
  if(standaloneMq.addEventListener) standaloneMq.addEventListener('change', renderInstallUI);
}

renderInstallUI();
