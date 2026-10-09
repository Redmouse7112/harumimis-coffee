/* ---------------- HISTORIAL POR EVENTOS (SESIONES) ---------------- */

/**
 * Junta orders + closure de cada sessionId en una sola unidad ("evento").
 * La sesión abierta actual aparece siempre primero, tenga o no pedidos.
 */
function getEvents(){
  const ids = new Set();
  state.orders.forEach(o=> ids.add(o.sessionId));
  state.closures.forEach(c=> ids.add(c.sessionId));
  ids.add(state.sessionId);

  return Array.from(ids).sort((a,b)=> b-a).map(id=>{
    const orders = state.orders.filter(o=> o.sessionId===id);
    const closure = state.closures.find(c=> c.sessionId===id) || null;
    const isOpen = id===state.sessionId && !closure;
    const eventName = closure
      ? (closure.eventName || ('Evento #' + id))
      : (isOpen ? currentEventName() : ('Evento #' + id));
    return {
      sessionId: id,
      eventName,
      orders,
      closure,
      isOpen,
    };
  });
}

function eventTotals(orders){
  const valid = orders.filter(o=> !o.voided);
  const efectivo = valid.filter(o=> o.method==='efectivo').reduce((s,o)=> s+o.total,0);
  const transferencia = valid.filter(o=> o.method==='transferencia').reduce((s,o)=> s+o.total,0);
  return { count: valid.length, efectivo, transferencia, grand: efectivo+transferencia };
}

function renderHistory(){
  const list = document.getElementById('historyList');
  const events = getEvents();

  if(events.length===0 || (events.length===1 && events[0].orders.length===0 && !events[0].closure)){
    list.innerHTML = '<p class="empty-note">Todavía no hay pedidos cargados.</p>';
    return;
  }

  list.innerHTML = '';
  events.forEach((ev, idx)=>{
    const t = eventTotals(ev.orders);
    const firstOrder = ev.orders[ev.orders.length-1];
    const dateLabel = ev.closure ? dateFmt(ev.closure.closedAt)
      : (firstOrder ? dateFmt(firstOrder.timestamp) : dateFmt(state.sessionSince));

    const details = document.createElement('details');
    details.className = 'event-card';
    if(idx===0) details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'event-summary';
    summary.innerHTML = `
      <div class="ev-info">
        <span class="ev-date">${escapeHtml(ev.eventName)}</span>
        <span class="ev-meta">${dateLabel} · ${t.count} pedido(s) válidos</span>
      </div>
      <div class="ev-right">
        <span class="event-status ${ev.isOpen ? 'open':'closed'}">${ev.isOpen ? 'En curso' : 'Cerrado'}</span>
        <span class="ev-total">${fmt(t.grand)}</span>
        <span class="event-chevron">▾</span>
      </div>`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'event-body';

    if(ev.orders.length===0){
      body.innerHTML = '<p class="empty-note">Sin pedidos cargados en este evento.</p>';
    } else {
      ev.orders.forEach(o=>{
        const card = document.createElement('div');
        card.className = 'order-card' + (o.voided ? ' voided':'');
        const itemsTxt = o.items.map(i=> `${i.qty}× ${i.name}`).join(' · ');
        card.innerHTML = `
          <div class="order-card-top">
            <span class="order-time">${timeFmt(o.timestamp)}</span>
            <span class="order-total">${fmt(o.total)}</span>
          </div>
          <div class="order-customer">👤 ${escapeHtml(o.customerName || 'Sin nombre')}</div>
          <div class="order-items">${escapeHtml(itemsTxt)}</div>
          <div class="order-bottom">
            <span class="badge ${o.method}">${o.method==='efectivo' ? '💵 Efectivo':'📲 Transferencia'}</span>
            ${ev.isOpen ? `<button class="void-btn">${o.voided ? 'Restaurar' : 'Anular'}</button>` : ''}
          </div>`;
        if(ev.isOpen){
          card.querySelector('.void-btn').addEventListener('click', ()=> toggleVoid(o.id));
        }
        body.appendChild(card);
      });
    }

    if(ev.closure){
      const c = ev.closure;
      const diffOk = c.diferencia===0;
      const arqueo = document.createElement('div');
      arqueo.className = 'event-arqueo';
      arqueo.innerHTML = `
        <div class="close-row"><span>💵 Efectivo esperado</span><span class="v">${fmt(c.efectivoEsperado)}</span></div>
        <div class="close-row"><span>🏦 Fondo inicial</span><span class="v">${fmt(c.fondoInicial||0)}</span></div>
        <div class="close-row"><span>📲 Transferencia</span><span class="v">${fmt(c.transferencia)}</span></div>
        <div class="close-row"><span>🧮 Efectivo contado</span><span class="v">${fmt(c.efectivoContado)}</span></div>
        <div class="diff-line ${diffOk ? 'ok':'bad'}">
          ${diffOk ? '✅ Cuadró perfecto' : (c.diferencia>0 ? `⚠️ Sobraron ${fmt(c.diferencia)}` : `⚠️ Faltaron ${fmt(Math.abs(c.diferencia))}`)}
        </div>
        <button class="event-download" data-session="${ev.sessionId}">⬇️ Descargar reporte del evento</button>
      `;
      body.appendChild(arqueo);
      arqueo.querySelector('.event-download').addEventListener('click', ()=> downloadClosureReport(ev));
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'event-delete';
    delBtn.textContent = '🗑 Eliminar evento';
    delBtn.addEventListener('click', ()=> confirmDeleteEvent(ev));
    body.appendChild(delBtn);

    details.appendChild(body);
    list.appendChild(details);
  });
}

function confirmDeleteEvent(ev){
  const count = ev.orders.length;
  const salesTxt = count===0 ? 'No tiene ventas cargadas.' : `Se borran también ${count} venta(s) asociada(s).`;
  openModal(`
    <h3>¿Eliminar "${escapeHtml(ev.eventName)}"?</h3>
    <p style="color:var(--ink-soft); font-size:13px; line-height:1.5;">
      ${salesTxt} Esto no se puede deshacer.
    </p>
    <div class="modal-actions">
      <button class="btn-secondary" id="delEventCancel">Cancelar</button>
      <button class="btn-danger" id="delEventConfirm">Eliminar evento</button>
    </div>
  `);
  document.getElementById('delEventCancel').addEventListener('click', closeModal);
  document.getElementById('delEventConfirm').addEventListener('click', ()=>{
    state.orders = state.orders.filter(o=> o.sessionId!==ev.sessionId);
    if(ev.closure){
      state.closures = state.closures.filter(c=> c.sessionId!==ev.sessionId);
    } else {
      // era la sesión activa: reinicia limpia sin correr el número de sesión
      state.sessionSince = new Date().toISOString();
      state.eventName = '';
      state.eventNameCustom = false;
      state.eventNameSet = false;
      state.fondoInicial = 0;
    }
    const saved = saveState();
    closeModal();
    renderHistory();
    renderSessionPill();
    renderCierre();
    if(saved) showToast('Evento eliminado');
    if(!ev.closure) promptEventName();
  });
}

function toggleVoid(orderId){
  const o = state.orders.find(x=> x.id===orderId);
  if(!o) return;
  o.voided = !o.voided;
  const saved = saveState();
  renderHistory();
  if(saved) showToast(o.voided ? 'Pedido anulado' : 'Pedido restaurado');
}
