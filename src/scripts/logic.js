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

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    STATE_VERSION, MIGRATIONS, defaultState, migrateState,
    computeTotals, cashDifference, defaultEventNameFor, eventNameFor,
  };
}
