/* ---------------- ESTADO + PERSISTENCIA + VERSIONADO ---------------- */

const STORAGE_KEY = 'harumimi-state';
const STATE_VERSION = 1;

function defaultState(){
  return {
    menu: DEFAULT_MENU.map(function(i){ return Object.assign({}, i); }),
    orders: [],
    closures: [],
    sessionId: 1,
    sessionSince: new Date().toISOString(),
    eventName: '',
    eventNameSet: false,
    eventNameCustom: false,
    fondoInicial: 0,
    version: STATE_VERSION,
  };
}

let state = defaultState();
let currentOrder = []; // {itemId, name, price, qty}
let currentMethod = 'efectivo';
let currentCustomerName = '';

/**
 * Migra datos guardados por versiones anteriores al modelo de estado actual.
 * `raw` puede ser el objeto ya parseado desde storage, o null/undefined si
 * todavía no hay nada guardado.
 *
 * La v1 (single-file, sin `state.version`) no tenía `order.customerName`.
 * Detectamos esos datos "legacy" por la ausencia del campo `version` y les
 * completamos ese dato faltante antes de seguir. Futuros cambios de modelo
 * se agregan como pasos adicionales acá abajo, sin tocar el resto de la app.
 */
function migrateState(raw){
  const saved = raw || {};
  const isLegacy = !('version' in saved);
  const merged = Object.assign(defaultState(), saved);

  if(isLegacy){
    merged.orders = (merged.orders || []).map(function(o){
      return Object.assign({ customerName:'' }, o);
    });
  }

  // `eventNameCustom` se sumó despues de `eventNameSet`: en sesiones guardadas
  // que ya tenian un nombre "resuelto" (el usuario cerro el modal, aceptando el
  // default o escribiendo uno propio) no podemos distinguir cual fue — el
  // criterio mas seguro es congelarlo como personalizado en vez de arriesgarnos
  // a pisar en silencio un nombre que Rudy ya viene viendo hace dias.
  if(!('eventNameCustom' in saved)){
    merged.eventNameCustom = !!merged.eventNameSet;
  }

  merged.version = STATE_VERSION;

  // Futuros pasos de migración, ej:
  // if(merged.version < 2){ ...; merged.version = 2; }

  return merged;
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  }catch(e){
    console.error('No se pudo guardar', e);
    showToast('⚠️ No se pudo guardar — revisá esto antes de seguir', { error:true, duration:4500 });
    return false;
  }
}

async function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      state = migrateState(JSON.parse(raw));
    }
  }catch(e){
    // no hay datos guardados todavía, se queda con el estado por defecto
  }
  render();
  onStateLoaded();
}

/* ---------------- UTILS COMPARTIDOS ---------------- */

function fmt(n){
  return '$' + Number(n||0).toLocaleString('es-AR', {maximumFractionDigits:0});
}

function timeFmt(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
}

function dateFmt(iso){
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}

function uid(){ return Math.random().toString(36).slice(2,9); }

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str); }

function showToast(msg, opts){
  opts = opts || {};
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!opts.error);
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), opts.duration || 1800);
}

/* ---------------- MODAL HELPERS ---------------- */
function openModal(html){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
}
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='modalOverlay') closeModal();
});

/* ---------------- NAV ---------------- */
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view));
});
function switchView(name){
  document.querySelectorAll('.nav-btn').forEach(b=> b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.id==='view-'+name));
  if(name==='historial') renderHistory();
  if(name==='menu') renderMenuManage();
  if(name==='cierre') renderCierre();
}

function renderSessionPill(){
  document.getElementById('sessionSince').textContent = timeFmt(state.sessionSince);
  document.getElementById('eventNameDisplay').textContent = currentEventName();
}

/* ---------------- NOMBRE DEL EVENTO ---------------- */

function defaultEventNameFor(iso){
  const d = new Date(iso);
  return 'Evento del ' + d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'});
}

/**
 * El default ("Evento del {hoy}") se calcula contra la fecha real del
 * sistema en el momento de mostrarlo, no contra la fecha en que arrancó la
 * sesión — así una sesión abierta hace varios días sigue mostrando la fecha
 * de hoy mientras nadie le puso un nombre propio.
 */
function liveDefaultEventName(){
  return defaultEventNameFor(new Date().toISOString());
}

/**
 * Nombre a mostrar/congelar en este momento: el personalizado si el usuario
 * ya confirmó uno distinto del default, o el default recalculado en vivo
 * mientras eso no pase.
 */
function currentEventName(){
  return (state.eventNameCustom && state.eventName) ? state.eventName : liveDefaultEventName();
}

function promptEventName(){
  const current = currentEventName();
  openModal(`
    <h3>Nombre del evento</h3>
    <p style="color:var(--ink-soft); font-size:13px; margin:-6px 0 4px; line-height:1.5;">
      Así vas a reconocer esta sesión en el Historial más adelante. Podés cambiarlo cuando quieras con el lápiz del encabezado.
    </p>
    <label>Nombre</label>
    <input type="text" id="eventNameInputModal" value="${escapeAttr(current)}" placeholder="Ej: Expo Formosa Agosto">
    <div class="modal-actions">
      <button class="btn-secondary" id="eventNameSkip">Dejar así</button>
      <button class="btn-primary" id="eventNameSave">Guardar</button>
    </div>
  `);
  const input = document.getElementById('eventNameInputModal');
  input.focus();
  input.select();
  document.getElementById('eventNameSkip').addEventListener('click', ()=>{
    state.eventNameSet = true;
    saveState();
    closeModal();
    renderSessionPill();
  });
  document.getElementById('eventNameSave').addEventListener('click', ()=>{
    const val = input.value.trim();
    if(!val){
      // lo vaciaron: vuelve a seguir el default en vivo
      state.eventName = '';
      state.eventNameCustom = false;
    } else if(val !== current){
      // escribieron algo distinto de lo que ya se estaba mostrando: se congela
      state.eventName = val;
      state.eventNameCustom = true;
    }
    // si val === current (aceptaron el prellenado tal cual), no se toca nada:
    // si ya era personalizado sigue igual, si era el default sigue en vivo.
    state.eventNameSet = true;
    const saved = saveState();
    closeModal();
    renderSessionPill();
    if(saved) showToast('Nombre del evento guardado');
  });
}

document.getElementById('editEventNameBtn').addEventListener('click', promptEventName);

function render(){
  renderMenuGrid();
  renderReceipt();
  renderSessionPill();
}
