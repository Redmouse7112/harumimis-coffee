/* ---------------- COPIA DE SEGURIDAD (exportar / importar) ---------------- */
// Los datos viven solo en este dispositivo (localStorage): sin una copia, borrar
// los datos del navegador o cambiar de celular pierde todo el historial. El
// archivo es un JSON con el estado completo y su schemaVersion.

const LAST_EXPORT_KEY = 'harumimi-last-export';
const PREV_STATE_KEY = 'harumimi-state-before-import';

function lastExportIso(){
  try{ return localStorage.getItem(LAST_EXPORT_KEY); }catch(e){ return null; }
}

function dayStamp(d){
  const p = n=> String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

function renderBackupStatus(){
  const st = backupStatus(lastExportIso(), state, new Date());
  const el = document.getElementById('backupStatus');
  const last = lastExportIso();
  if(st.days === null){
    el.textContent = st.hasData
      ? '⚠️ Todavía no exportaste ninguna copia. Si se borran los datos del navegador, se pierde todo.'
      : 'Todavía no exportaste ninguna copia.';
  } else {
    const when = st.days === 0 ? 'hoy' : (st.days === 1 ? 'hace 1 día' : 'hace ' + st.days + ' días');
    el.textContent = (st.due ? '⚠️ ' : '✅ ') + 'Última copia exportada: ' + when + ' (' + dateFmt(last) + ').'
      + (st.due ? ' Hace más de ' + BACKUP_MAX_AGE_DAYS + ' días: conviene exportar una nueva.' : '');
  }
  el.className = 'diff-banner ' + (st.due ? 'bad' : (st.days === null ? 'neutral' : 'ok'));
  document.querySelector('.nav-btn[data-view="cierre"]').classList.toggle('needs-backup', st.due);
}

document.getElementById('exportBackupBtn').addEventListener('click', ()=>{
  const now = new Date();
  const blob = new Blob([JSON.stringify(buildBackup(state, now), null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'harumimis-coffee-copia-' + dayStamp(now) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
  try{ localStorage.setItem(LAST_EXPORT_KEY, now.toISOString()); }catch(e){}
  renderBackupStatus();
  showToast('Copia exportada · guardala en un lugar seguro');
});

document.getElementById('importBackupBtn').addEventListener('click', ()=>{
  document.getElementById('importBackupFile').click();
});

document.getElementById('importBackupFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = ''; // permite volver a elegir el mismo archivo
  if(!file) return;
  const reader = new FileReader();
  reader.onerror = ()=> showToast('⚠️ No se pudo leer el archivo', { error:true, duration:4000 });
  reader.onload = ()=>{
    const res = validateBackup(String(reader.result));
    if(!res.ok){
      showToast('⚠️ ' + res.error, { error:true, duration:5000 });
      return;
    }
    confirmImport(res);
  };
  reader.readAsText(file);
});

function confirmImport(res){
  const s = res.summary;
  openModal(`
    <h3>Importar copia</h3>
    <p style="color:var(--ink-soft); font-size:13px; line-height:1.5;">
      La copia${res.exportedAt ? ' del <b>' + dateFmt(res.exportedAt) + '</b>' : ''} tiene
      <b>${s.orders}</b> pedido(s), <b>${s.closures}</b> cierre(s) y <b>${s.menuItems}</b> producto(s).
    </p>
    <p style="color:var(--bad); font-size:13px; line-height:1.5; font-weight:700;">
      Esto reemplaza todo lo que hay ahora en este dispositivo
      (${state.orders.length} pedido(s), ${state.closures.length} cierre(s)). Si no estás seguro, exportá una copia primero.
    </p>
    <div class="modal-actions">
      <button class="btn-secondary" id="importCancel">Cancelar</button>
      <button class="btn-danger" id="importConfirm">Reemplazar todo</button>
    </div>
  `);
  document.getElementById('importCancel').addEventListener('click', closeModal);
  document.getElementById('importConfirm').addEventListener('click', ()=>{
    const previous = state;
    // red de seguridad por si fue un error: queda el estado anterior guardado aparte
    try{ localStorage.setItem(PREV_STATE_KEY, JSON.stringify(previous)); }catch(e){}
    state = res.state;
    if(!saveState()){
      state = previous;
      closeModal();
      return;
    }
    currentOrder = [];
    document.getElementById('cashCountInput').value = '';
    closeModal();
    render();
    renderCierre();
    showToast('Copia importada · ' + s.orders + ' pedido(s) restaurados');
  });
}

