/* ---------------- MENU MANAGE ---------------- */
function renderMenuManage(){
  const list = document.getElementById('itemList');
  list.innerHTML = '';
  state.menu.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="price">${fmt(item.price)}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="edit">✎</button>
        <button class="icon-btn danger" data-act="del">🗑</button>
      </div>`;
    row.querySelector('[data-act="edit"]').addEventListener('click', ()=> openEditItemModal(item.id));
    row.querySelector('[data-act="del"]').addEventListener('click', ()=> confirmDeleteItem(item.id));
    list.appendChild(row);
  });
}

document.getElementById('addMenuItemBtn').addEventListener('click', ()=> openEditItemModal(null));

function openEditItemModal(itemId){
  const item = itemId ? state.menu.find(i=> i.id===itemId) : null;
  openModal(`
    <h3>${item ? 'Editar producto' : 'Nuevo producto'}</h3>
    <label>Nombre</label>
    <input type="text" id="miName" value="${item ? escapeAttr(item.name) : ''}">
    <label>Precio ($)</label>
    <input type="number" inputmode="decimal" id="miPrice" value="${item ? item.price : ''}">
    <div class="modal-actions">
      <button class="btn-secondary" id="miCancel">Cancelar</button>
      <button class="btn-primary" id="miSave">Guardar</button>
    </div>
  `);
  document.getElementById('miCancel').addEventListener('click', closeModal);
  document.getElementById('miSave').addEventListener('click', ()=>{
    const name = document.getElementById('miName').value.trim();
    const price = parseFloat(document.getElementById('miPrice').value);
    if(!name || !price || price<=0){ showToast('Poné nombre y precio válidos'); return; }
    if(item){ item.name = name; item.price = price; }
    else{ state.menu.push({id:'m-'+uid(), name, price}); }
    const saved = saveState();
    renderMenuManage();
    renderMenuGrid();
    closeModal();
    if(saved) showToast('Producto guardado');
  });
}

function confirmDeleteItem(itemId){
  const item = state.menu.find(i=> i.id===itemId);
  openModal(`
    <h3>¿Eliminar "${escapeHtml(item.name)}"?</h3>
    <p style="color:var(--ink-soft); font-size:13px;">Esto no borra pedidos ya cargados, solo lo saca del menú.</p>
    <div class="modal-actions">
      <button class="btn-secondary" id="delCancel">Cancelar</button>
      <button class="btn-danger" id="delConfirm">Eliminar</button>
    </div>
  `);
  document.getElementById('delCancel').addEventListener('click', closeModal);
  document.getElementById('delConfirm').addEventListener('click', ()=>{
    state.menu = state.menu.filter(i=> i.id!==itemId);
    const saved = saveState();
    renderMenuManage();
    renderMenuGrid();
    closeModal();
    if(saved) showToast('Producto eliminado');
  });
}
