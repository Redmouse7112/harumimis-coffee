/* ---------------- SPLASH ---------------- */
let splashDismissed = false;
let stateReady = false;

function hideSplash(){
  const s = document.getElementById('splash');
  s.classList.add('out');
  setTimeout(()=>{ s.style.display = 'none'; }, 550);
  splashDismissed = true;
  maybePromptEventName();
}

function onStateLoaded(){
  stateReady = true;
  maybePromptEventName();
}

/**
 * Solo pide el nombre del evento una vez que la splash ya se cerró (para no
 * abrir un modal detrás de una pantalla con z-index mayor) y una vez que el
 * estado ya terminó de cargar (para no pisar una edición del usuario cuando
 * loadState() reemplaza `state` por los datos migrados).
 */
function maybePromptEventName(){
  if(stateReady && splashDismissed && !state.eventNameSet){
    promptEventName();
  }
}

/* ---------------- BOOTSTRAP ---------------- */
loadState();
