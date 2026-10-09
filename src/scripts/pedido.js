/* ---------------- MENU GRID / PEDIDO ---------------- */
function renderMenuGrid(){
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  state.menu.forEach(item=>{
    const tile = document.createElement('button');
    tile.className = 'menu-tile';
    tile.innerHTML = `<span class="name">${escapeHtml(item.name)}</span><span class="price">${fmt(item.price)}</span>`;
    tile.addEventListener('click', ()=> addToOrder(item));
    grid.appendChild(tile);
  });
  const addTile = document.createElement('button');
  addTile.className = 'menu-tile add-tile';
  addTile.textContent = '+ Otro (agregado del evento)';
  addTile.addEventListener('click', openTempItemModal);
  grid.appendChild(addTile);
}

function addToOrder(item){
  const existing = currentOrder.find(l=> l.itemId===item.id);
  if(existing){ existing.qty += 1; }
  else{ currentOrder.push({itemId:item.id, name:item.name, price:item.price, qty:1}); }
  renderReceipt();
}

function changeQty(itemId, delta){
  const line = currentOrder.find(l=> l.itemId===itemId);
  if(!line) return;
  line.qty += delta;
  if(line.qty<=0) currentOrder = currentOrder.filter(l=> l.itemId!==itemId);
  renderReceipt();
}

function renderReceipt(){
  const wrap = document.getElementById('receiptLines');
  const total = currentOrder.reduce((s,l)=> s + l.price*l.qty, 0);
  document.getElementById('orderTotal').textContent = fmt(total);

  if(currentOrder.length===0){
    wrap.innerHTML = '<div class="receipt-empty">Todavía no agregaste nada</div>';
  } else {
    wrap.innerHTML = '';
    currentOrder.forEach(l=>{
      const row = document.createElement('div');
      row.className = 'receipt-line';
      row.innerHTML = `
        <span class="rl-name">${escapeHtml(l.name)}</span>
        <span class="rl-qty">
          <button class="qtybtn" data-act="minus">–</button>
          <span>${l.qty}</span>
          <button class="qtybtn" data-act="plus">+</button>
        </span>
        <span class="rl-price">${fmt(l.price*l.qty)}</span>`;
      row.querySelector('[data-act="minus"]').addEventListener('click', ()=> changeQty(l.itemId,-1));
      row.querySelector('[data-act="plus"]').addEventListener('click', ()=> changeQty(l.itemId,1));
      wrap.appendChild(row);
    });
  }
  updateConfirmState();
}

function updateConfirmState(){
  const nameOk = currentCustomerName.trim().length > 0;
  document.getElementById('confirmOrderBtn').disabled = currentOrder.length===0 || !nameOk;
}

document.getElementById('customerNameInput').addEventListener('input', (e)=>{
  currentCustomerName = e.target.value;
  document.getElementById('customerField').classList.remove('missing');
  updateConfirmState();
});

document.getElementById('btnEfectivo').addEventListener('click', ()=> setMethod('efectivo'));
document.getElementById('btnTransferencia').addEventListener('click', ()=> setMethod('transferencia'));
function setMethod(m){
  currentMethod = m;
  document.getElementById('btnEfectivo').classList.toggle('active', m==='efectivo');
  document.getElementById('btnTransferencia').classList.toggle('active', m==='transferencia');
}

document.getElementById('clearOrderBtn').addEventListener('click', ()=>{
  currentOrder = [];
  currentCustomerName = '';
  document.getElementById('customerNameInput').value = '';
  document.getElementById('customerField').classList.remove('missing');
  renderReceipt();
});

document.getElementById('confirmOrderBtn').addEventListener('click', ()=>{
  if(currentOrder.length===0) return;
  const name = currentCustomerName.trim();
  if(!name){
    document.getElementById('customerField').classList.add('missing');
    document.getElementById('customerNameInput').focus();
    showToast('Ingresá el nombre de quien pide');
    return;
  }
  const total = currentOrder.reduce((s,l)=> s + l.price*l.qty, 0);
  const order = {
    id: uid(),
    timestamp: new Date().toISOString(),
    customerName: name,
    items: currentOrder.map(l=> ({name:l.name, price:l.price, qty:l.qty})),
    total,
    method: currentMethod,
    sessionId: state.sessionId,
    voided: false,
  };
  state.orders.unshift(order);
  currentOrder = [];
  currentCustomerName = '';
  document.getElementById('customerNameInput').value = '';
  renderReceipt();
  const saved = saveState();
  if(saved) showToast('Pedido confirmado · ' + fmt(total));
});

/* ---------------- TEMP ITEM (agregado puntual) ---------------- */
function openTempItemModal(){
  openModal(`
    <h3>Agregar producto puntual</h3>
    <label>Nombre</label>
    <input type="text" id="tmpName" placeholder="Ej: Budín de limón">
    <label>Precio ($)</label>
    <input type="number" inputmode="decimal" id="tmpPrice" placeholder="0">
    <div class="modal-actions">
      <button class="btn-secondary" id="tmpCancel">Cancelar</button>
      <button class="btn-primary" id="tmpAdd">Agregar al pedido</button>
    </div>
  `);
  document.getElementById('tmpCancel').addEventListener('click', closeModal);
  document.getElementById('tmpAdd').addEventListener('click', ()=>{
    const name = document.getElementById('tmpName').value.trim();
    const price = parseFloat(document.getElementById('tmpPrice').value);
    if(!name || !price || price<=0){ showToast('Poné nombre y precio válidos'); return; }
    currentOrder.push({itemId:'tmp-'+uid(), name, price, qty:1});
    renderReceipt();
    closeModal();
  });
}
