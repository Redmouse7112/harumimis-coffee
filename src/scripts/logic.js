/* ---------------- LÓGICA PURA (sin DOM ni localStorage) ----------------
 * En el navegador estas funciones quedan en el scope global del bundle; en
 * Node se cargan con require() para los tests (`node --test`). Nada de acá
 * puede tocar `document`, `localStorage` ni el `state` global.
 */

// En Node no hay scope compartido: el menú por defecto se trae con require().
const MENU_DEFAULTS = (typeof DEFAULT_MENU !== 'undefined')
  ? DEFAULT_MENU
  : require('../data/defaultMenu.js');

const STATE_VERSION = 2; // = MIGRATIONS.length

function defaultState(){
  return {
    menu: MENU_DEFAULTS.map(function(i){ return Object.assign({}, i); }),
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

/**
 * Migraciones numeradas: MIGRATIONS[n] lleva un estado de la versión n a la
 * n+1 (muta y devuelve `st`). STATE_VERSION siempre es MIGRATIONS.length.
 * Para un cambio de modelo: agregar un paso al final y subir STATE_VERSION.
 *
 * Historia: la v0 es la app de un solo archivo (sin campo `version`). La v1 se
 * guardó con `version: 1` durante todos los cambios de esquema posteriores
 * (nunca se incrementó), así que los datos con version 1 pueden o no tener ya
 * `eventNameCustom` y `fondoInicial`. Por eso el paso 1→2 es idempotente y
 * chequea si el campo ya existe: es la única detección por presencia que queda.
 */
const MIGRATIONS = [
  // 0 → 1: la v0 no tenía `order.customerName`
  function(st){
    st.orders = (st.orders || []).map(function(o){
      return Object.assign({ customerName:'' }, o);
    });
    return st;
  },
  // 1 → 2: `eventNameCustom` y `fondoInicial` se sumaron sin subir la versión.
  // `eventNameCustom` vino después de `eventNameSet`: en sesiones que ya tenían
  // un nombre "resuelto" no podemos distinguir si fue el default o uno propio —
  // lo más seguro es congelarlo como personalizado antes que pisar en silencio
  // un nombre que Rudy ya viene viendo hace días.
  function(st){
    if(!('eventNameCustom' in st)) st.eventNameCustom = !!st.eventNameSet;
    if(!('fondoInicial' in st)) st.fondoInicial = 0;
    return st;
  },
];

/**
 * Migra datos guardados por versiones anteriores al modelo de estado actual.
 * `raw` puede ser el objeto ya parseado desde storage, o null/undefined si
 * todavía no hay nada guardado. Un estado sin `version` (o inválida) cuenta
 * como v0; uno con una versión más nueva que la de esta app no se toca.
 */
function migrateState(raw){
  let st = Object.assign({}, raw || {});
  let v = (Number.isInteger(st.version) && st.version > 0) ? st.version : 0;
  for(; v < STATE_VERSION; v++){
    st = MIGRATIONS[v](st);
    st.version = v + 1;
  }
  return Object.assign(defaultState(), st);
}

/* ---------------- CARGA DESDE STORAGE ---------------- */

const BACKUP_V1_KEY = 'harumimi-state-backup-v1';
const CORRUPT_STATE_KEY = 'harumimi-state-corrupto';
const RAW_BACKUP_BELOW_VERSION = 2; // los datos guardados con version < 2 se copian crudos antes de migrar

/** Guarda `raw` bajo `key` solo si esa clave todavía no existe. true = queda guardado. */
function keepOnce(storage, key, raw){
  try{
    if(storage.getItem(key) === null) storage.setItem(key, raw);
    return true;
  }catch(e){
    return false;
  }
}

/**
 * Lee el estado guardado en `storage` (algo con getItem/setItem, p. ej.
 * localStorage) y devuelve { state, status } sin lanzar nunca:
 *  - 'empty' / 'unreadable': no hay nada (o no se pudo leer); estado por defecto, no se escribe nada.
 *  - 'corrupt': el JSON no se puede leer; estado por defecto y el texto original
 *    queda aparte en CORRUPT_STATE_KEY (la clave principal no se toca).
 *  - 'ok': datos ya en la versión actual.
 *  - 'migrated': datos viejos (version < 2). Antes de migrar se guarda una copia
 *    cruda en BACKUP_V1_KEY (solo si no existía, para no pisar la primera copia)
 *    y recién después se guarda el estado migrado.
 *  - 'migrated-unsaved': se migró en memoria pero no se pudo guardar la copia
 *    cruda o el estado nuevo; lo guardado queda como estaba.
 */
function loadStoredState(storage, key){
  let raw;
  try{ raw = storage.getItem(key); }
  catch(e){ return { state: defaultState(), status: 'unreadable' }; }
  if(raw === null || raw === undefined) return { state: defaultState(), status: 'empty' };

  let parsed;
  try{ parsed = JSON.parse(raw); }catch(e){ parsed = null; }
  if(!isPlainObject(parsed)){
    keepOnce(storage, CORRUPT_STATE_KEY, raw);
    return { state: defaultState(), status: 'corrupt' };
  }

  const migrated = migrateState(parsed);
  const version = Number.isInteger(parsed.version) ? parsed.version : 0;
  if(version >= RAW_BACKUP_BELOW_VERSION) return { state: migrated, status: 'ok' };

  if(!keepOnce(storage, BACKUP_V1_KEY, raw)) return { state: migrated, status: 'migrated-unsaved' };
  try{
    storage.setItem(key, JSON.stringify(migrated));
  }catch(e){
    return { state: migrated, status: 'migrated-unsaved' };
  }
  return { state: migrated, status: 'migrated' };
}

/**
 * Totales de una lista de pedidos: los anulados no suman. Sirve tanto para
 * la sesión abierta (Cierre) como para cualquier evento (Historial).
 */
function computeTotals(orders){
  const valid = orders.filter(function(o){ return !o.voided; });
  const sumBy = function(method){
    return valid.filter(function(o){ return o.method===method; })
      .reduce(function(s,o){ return s+o.total; }, 0);
  };
  const efectivo = sumBy('efectivo');
  const transferencia = sumBy('transferencia');
  return { count: valid.length, efectivo, transferencia, grand: efectivo+transferencia };
}

/** Diferencia de arqueo: positivo = sobra, negativo = falta. */
function cashDifference(counted, efectivo, fondo){
  return counted - (efectivo + fondo);
}

/* ---------------- NOMBRE DEL EVENTO ---------------- */

function defaultEventNameFor(iso){
  const d = new Date(iso);
  return 'Evento del ' + d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'});
}

/**
 * Nombre del evento a mostrar/congelar: el personalizado si el usuario ya
 * confirmó uno distinto del default, o el default recalculado contra `now`
 * mientras eso no pase. El default se calcula con la fecha real del sistema
 * (no con la de apertura de la sesión) para que una sesión abierta hace
 * varios días siga mostrando la fecha de hoy mientras nadie le puso nombre.
 */
function eventNameFor(st, now){
  return (st.eventNameCustom && st.eventName) ? st.eventName : defaultEventNameFor(now.toISOString());
}

/* ---------------- COPIA DE SEGURIDAD ---------------- */

const BACKUP_APP_ID = 'harumimi-coffee';
const BACKUP_MAX_AGE_DAYS = 7;
const PAYMENT_METHODS = ['efectivo', 'transferencia'];

/** Contenido del archivo de copia: el estado completo más metadatos. */
function buildBackup(st, now){
  return {
    app: BACKUP_APP_ID,
    schemaVersion: st.version,
    exportedAt: now.toISOString(),
    state: st,
  };
}

function isFiniteNumber(n){ return typeof n === 'number' && Number.isFinite(n); }
function isPlainObject(o){ return o !== null && typeof o === 'object' && !Array.isArray(o); }

/**
 * Valida el texto de un archivo de copia antes de reemplazar nada. Devuelve
 * { ok:true, state, exportedAt, summary } con el estado ya migrado, o
 * { ok:false, error } con un mensaje para mostrarle a la persona.
 */
function validateBackup(text){
  let data;
  try{ data = JSON.parse(text); }
  catch(e){ return { ok:false, error:'El archivo no es un JSON válido.' }; }

  if(!isPlainObject(data) || data.app !== BACKUP_APP_ID){
    return { ok:false, error:"Este archivo no es una copia de Harumimi's Coffee." };
  }
  if(!Number.isInteger(data.schemaVersion) || data.schemaVersion < 0){
    return { ok:false, error:'La copia no indica de qué versión es.' };
  }
  if(data.schemaVersion > STATE_VERSION){
    return { ok:false, error:'La copia es de una versión más nueva de la app. Actualizá la app e intentá de nuevo.' };
  }
  if(!isPlainObject(data.state)){
    return { ok:false, error:'La copia no tiene datos de estado.' };
  }

  // Se valida el estado ya migrado, que es el que va a usar la app.
  const st = migrateState(Object.assign({}, data.state, { version: data.schemaVersion }));
  const fail = function(what){ return { ok:false, error:'La copia está dañada: ' + what + '.' }; };

  if(!Array.isArray(st.menu) || !st.menu.every(function(m){
    return isPlainObject(m) && typeof m.id === 'string' && typeof m.name === 'string' && isFiniteNumber(m.price);
  })) return fail('el menú es inválido');

  if(!Array.isArray(st.orders) || !st.orders.every(function(o){
    return isPlainObject(o) && isFiniteNumber(o.total) && PAYMENT_METHODS.includes(o.method)
      && isFiniteNumber(o.sessionId) && Array.isArray(o.items) && typeof o.timestamp === 'string'
      && !Number.isNaN(new Date(o.timestamp).getTime());
  })) return fail('hay pedidos inválidos');

  if(!Array.isArray(st.closures) || !st.closures.every(function(c){
    return isPlainObject(c) && isFiniteNumber(c.sessionId);
  })) return fail('hay cierres inválidos');

  if(!Number.isInteger(st.sessionId) || st.sessionId < 1) return fail('el número de sesión es inválido');
  if(typeof st.sessionSince !== 'string' || Number.isNaN(new Date(st.sessionSince).getTime())){
    return fail('falta la fecha de apertura de la sesión');
  }
  if(!isFiniteNumber(st.fondoInicial)) return fail('el fondo inicial es inválido');

  return {
    ok: true,
    state: st,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    summary: { orders: st.orders.length, closures: st.closures.length, menuItems: st.menu.length },
  };
}

/**
 * ¿Hay que avisar de que falta backup? Solo si hay algo que perder (pedidos o
 * cierres) y nunca se exportó o pasaron más de BACKUP_MAX_AGE_DAYS días.
 */
function backupStatus(lastExportIso, st, now){
  const hasData = st.orders.length > 0 || st.closures.length > 0;
  const last = lastExportIso ? new Date(lastExportIso) : null;
  const valid = last && !Number.isNaN(last.getTime());
  const days = valid ? Math.floor((now.getTime() - last.getTime()) / 86400000) : null;
  const due = hasData && (!valid || days > BACKUP_MAX_AGE_DAYS);
  return { due, days, hasData };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    STATE_VERSION, MIGRATIONS, defaultState, migrateState,
    computeTotals, cashDifference, defaultEventNameFor, eventNameFor,
    BACKUP_V1_KEY, CORRUPT_STATE_KEY, loadStoredState,
    BACKUP_APP_ID, BACKUP_MAX_AGE_DAYS, buildBackup, validateBackup, backupStatus,
  };
}
