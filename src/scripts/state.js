/* ---------------- ESTADO + PERSISTENCIA + VERSIONADO ---------------- */

const STORAGE_KEY = 'harumimi-state';

let state = defaultState();
let currentOrder = []; // {itemId, name, price, qty}
let currentMethod = 'efectivo';
let currentCustomerName = '';

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
    // loadStoredState no lanza: con datos viejos guarda una copia cruda antes de
    // migrar, y con datos ilegibles conserva el texto original aparte.
    const res = loadStoredState(localStorage, STORAGE_KEY);
    state = res.state;
    if(res.status === 'corrupt'){
      showToast('⚠️ Los datos guardados estaban dañados: se conservó una copia aparte', { error:true, duration:5000 });
    }
  }catch(e){
    // localStorage inaccesible: se queda con el estado por defecto
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

/** Nombre a mostrar/congelar ahora mismo (la regla vive en logic.js). */
function currentEventName(){
  return eventNameFor(state, new Date());
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
  renderBackupStatus();
}
