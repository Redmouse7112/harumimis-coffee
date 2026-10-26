/* ---------------- CIERRE ---------------- */
function sessionTotals(){
  return computeTotals(state.orders.filter(o=> o.sessionId===state.sessionId));
}

function renderCierre(){
  renderBackupStatus();
  const t = sessionTotals();
  document.getElementById('closeCount').textContent = t.count;
  document.getElementById('closeEfectivo').textContent = fmt(t.efectivo);
  document.getElementById('closeTransferencia').textContent = fmt(t.transferencia);
  document.getElementById('closeGrand').textContent = fmt(t.grand);
  const fondoInput = document.getElementById('fondoInicialInput');
  if(document.activeElement !== fondoInput){
    fondoInput.value = state.fondoInicial ? state.fondoInicial : '';
  }
  updateExpectedInCaja();
  updateDiff();
}

function updateExpectedInCaja(){
  const t = sessionTotals();
  const fondo = parseFloat(document.getElementById('fondoInicialInput').value)||0;
  document.getElementById('closeExpectedInCaja').textContent = fmt(t.efectivo + fondo);
}

document.getElementById('fondoInicialInput').addEventListener('input', (e)=>{
  state.fondoInicial = parseFloat(e.target.value)||0;
  saveState();
  updateExpectedInCaja();
  updateDiff();
});

function updateDiff(){
  const t = sessionTotals();
  const fondo = parseFloat(document.getElementById('fondoInicialInput').value)||0;
  const input = document.getElementById('cashCountInput');
  const banner = document.getElementById('diffBanner');
  const closeBtn = document.getElementById('closeCajaBtn');
  const val = input.value;
  if(val===''){
    banner.className = 'diff-banner neutral';
    banner.textContent = 'Ingresá el efectivo contado para comparar.';
    closeBtn.disabled = true;
    return;
  }
  const counted = parseFloat(val)||0;
  const diff = cashDifference(counted, t.efectivo, fondo);
  closeBtn.disabled = false;
  if(diff===0){
    banner.className = 'diff-banner ok';
    banner.textContent = '✅ Coincide perfecto — caja lista para cerrar.';
  } else if(diff>0){
    banner.className = 'diff-banner bad';
    banner.textContent = `⚠️ Sobran ${fmt(diff)} respecto a lo esperado.`;
  } else {
    banner.className = 'diff-banner bad';
    banner.textContent = `⚠️ Faltan ${fmt(Math.abs(diff))} respecto a lo esperado.`;
  }
}
document.getElementById('cashCountInput').addEventListener('input', updateDiff);

document.getElementById('closeCajaBtn').addEventListener('click', ()=>{
  const t = sessionTotals();
  const fondo = parseFloat(document.getElementById('fondoInicialInput').value)||0;
  const counted = parseFloat(document.getElementById('cashCountInput').value)||0;
  const closure = {
    id: uid(),
    sessionId: state.sessionId,
    eventName: currentEventName(),
    closedAt: new Date().toISOString(),
    count: t.count,
    efectivoEsperado: t.efectivo,
    fondoInicial: fondo,
    transferencia: t.transferencia,
    grand: t.grand,
    efectivoContado: counted,
    diferencia: cashDifference(counted, t.efectivo, fondo),
  };
  openModal(`
    <h3>Cerrar caja</h3>
    <p style="color:var(--ink-soft); font-size:13px; line-height:1.5;">
      Se guarda el arqueo con ${t.count} pedido(s) y una diferencia de <b>${fmt(closure.diferencia)}</b>.
      Se descarga un reporte del evento y se abre una sesión nueva para el próximo.
    </p>
    <div class="modal-actions">
      <button class="btn-secondary" id="closeCancel">Cancelar</button>
      <button class="btn-primary" id="closeConfirm">Confirmar cierre</button>
    </div>
  `);
  document.getElementById('closeCancel').addEventListener('click', closeModal);
  document.getElementById('closeConfirm').addEventListener('click', ()=>{
    const closedOrders = state.orders.filter(o=> o.sessionId===state.sessionId);
    state.closures.unshift(closure);
    state.sessionId += 1;
    state.sessionSince = new Date().toISOString();
    state.eventName = '';
    state.eventNameCustom = false;
    state.eventNameSet = false;
    state.fondoInicial = 0;
    document.getElementById('cashCountInput').value = '';
    const saved = saveState();
    closeModal();
    renderSessionPill();
    renderCierre();
    downloadClosureReport({ sessionId: closure.sessionId, eventName: closure.eventName, orders: closedOrders, closure });
    if(saved) showToast('Caja cerrada · reporte descargado · nueva sesión abierta');
    promptEventName();
  });
});
