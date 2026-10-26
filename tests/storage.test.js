// Carga del estado guardado: datos de versiones viejas y casos rotos.
// Todos los fixtures son inventados (nombres y montos de ejemplo).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATE_VERSION, BACKUP_V1_KEY, CORRUPT_STATE_KEY, loadStoredState,
} = require('../src/scripts/logic.js');

const KEY = 'harumimi-state';

/** Storage falso en memoria; failGet/failSet hacen fallar claves puntuales. */
function fakeStorage(initial, opts) {
  const data = new Map(Object.entries(initial || {}));
  const failSet = new Set((opts && opts.failSet) || []);
  const failGet = new Set((opts && opts.failGet) || []);
  return {
    data,
    getItem(k) {
      if (failGet.has(k)) throw new Error('getItem bloqueado');
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      if (failSet.has(k)) throw new Error('QuotaExceededError');
      data.set(k, String(v));
    },
  };
}

const order = (extra) => Object.assign({
  id: 'p1', timestamp: '2025-08-09T15:00:00.000Z', customerName: 'Cliente Uno',
  items: [{ name: 'Café', price: 1000, qty: 1 }], total: 1000, method: 'efectivo',
  sessionId: 1, voided: false,
}, extra);

const v1 = (extra) => Object.assign({
  version: 1,
  menu: [{ id: 'm1', name: 'Café', price: 1000 }],
  orders: [order()],
  closures: [],
  sessionId: 1,
  sessionSince: '2025-08-09T12:00:00.000Z',
  eventName: 'Expo de prueba',
  eventNameSet: true,
  eventNameCustom: true,
  fondoInicial: 500,
}, extra);

const without = (obj, ...keys) => { const c = Object.assign({}, obj); keys.forEach(k => delete c[k]); return c; };
const store = (obj) => fakeStorage({ [KEY]: JSON.stringify(obj) });

describe('datos version 1', () => {
  test('sin eventNameCustom: se infiere de eventNameSet y no se pierde nada', () => {
    const original = without(v1({ eventName: 'Expo de prueba', eventNameSet: true }), 'eventNameCustom');
    const res = loadStoredState(store(original), KEY);
    assert.equal(res.status, 'migrated');
    assert.equal(res.state.eventNameCustom, true);
    assert.equal(res.state.eventName, 'Expo de prueba');
    assert.equal(res.state.version, STATE_VERSION);
    assert.deepEqual(res.state.orders, original.orders);
    assert.equal(res.state.fondoInicial, 500);
  });

  test('sin eventNameCustom y sin nombre resuelto: queda siguiendo el default', () => {
    const res = loadStoredState(store(without(v1({ eventName: '', eventNameSet: false }), 'eventNameCustom')), KEY);
    assert.equal(res.state.eventNameCustom, false);
  });

  test('sin fondoInicial: arranca en 0', () => {
    const res = loadStoredState(store(without(v1(), 'fondoInicial')), KEY);
    assert.equal(res.status, 'migrated');
    assert.equal(res.state.fondoInicial, 0);
  });

  test('con cierres antiguos sin fondoInicial: los cierres quedan intactos', () => {
    const closures = [
      { id: 'c2', sessionId: 2, eventName: 'Evento B', closedAt: '2025-08-10T22:00:00.000Z',
        count: 3, efectivoEsperado: 4500, transferencia: 1500, grand: 6000, efectivoContado: 4500, diferencia: 0 },
      { id: 'c1', sessionId: 1, eventName: 'Evento A', closedAt: '2025-08-09T22:00:00.000Z',
        count: 1, efectivoEsperado: 1000, fondoInicial: 200, transferencia: 0, grand: 1000, efectivoContado: 1200, diferencia: 0 },
    ];
    const res = loadStoredState(store(v1({ closures, sessionId: 3 })), KEY);
    assert.equal(res.status, 'migrated');
    assert.deepEqual(res.state.closures, closures);
    assert.equal('fondoInicial' in res.state.closures[0], false); // no se inventa el dato
    assert.equal(res.state.sessionId, 3);
  });

  test('pedidos con customerName vacío siguen vacíos', () => {
    const orders = [order({ customerName: '' }), order({ id: 'p2', customerName: 'Cliente Dos' })];
    const res = loadStoredState(store(v1({ orders })), KEY);
    assert.equal(res.state.orders[0].customerName, '');
    assert.equal(res.state.orders[1].customerName, 'Cliente Dos');
  });

  test('pedidos de la v0 sin customerName reciben cadena vacía', () => {
    const old = { menu: [], orders: [without(order(), 'customerName')], closures: [], sessionId: 1, sessionSince: '2025-08-09T12:00:00.000Z' };
    const res = loadStoredState(store(old), KEY);
    assert.equal(res.state.orders[0].customerName, '');
  });
});

describe('copia cruda antes de migrar', () => {
  test('guarda el texto original exacto y después el estado migrado', () => {
    const raw = JSON.stringify(without(v1(), 'eventNameCustom', 'fondoInicial'));
    const st = fakeStorage({ [KEY]: raw });
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'migrated');
    assert.equal(st.data.get(BACKUP_V1_KEY), raw);
    const saved = JSON.parse(st.data.get(KEY));
    assert.equal(saved.version, STATE_VERSION);
    assert.equal(saved.fondoInicial, 0);
    assert.deepEqual(saved, res.state);
  });

  test('también para datos sin campo version', () => {
    const raw = JSON.stringify({ menu: [], orders: [], closures: [], sessionId: 1, sessionSince: '2025-08-09T12:00:00.000Z' });
    const st = fakeStorage({ [KEY]: raw });
    loadStoredState(st, KEY);
    assert.equal(st.data.get(BACKUP_V1_KEY), raw);
  });

  test('no pisa una copia existente', () => {
    const st = fakeStorage({ [KEY]: JSON.stringify(v1()), [BACKUP_V1_KEY]: 'primera copia' });
    loadStoredState(st, KEY);
    assert.equal(st.data.get(BACKUP_V1_KEY), 'primera copia');
  });

  test('cargar dos veces no cambia la copia: la segunda ya es version 2', () => {
    const raw = JSON.stringify(v1());
    const st = fakeStorage({ [KEY]: raw });
    assert.equal(loadStoredState(st, KEY).status, 'migrated');
    assert.equal(loadStoredState(st, KEY).status, 'ok');
    assert.equal(st.data.get(BACKUP_V1_KEY), raw);
  });

  test('con datos ya en la versión actual no crea copia ni reescribe', () => {
    const raw = JSON.stringify(Object.assign(v1(), { version: STATE_VERSION }));
    const st = fakeStorage({ [KEY]: raw });
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'ok');
    assert.equal(st.data.has(BACKUP_V1_KEY), false);
    assert.equal(st.data.get(KEY), raw);
  });

  test('si no se puede guardar la copia, no se toca lo guardado (pero la app arranca migrada)', () => {
    const raw = JSON.stringify(v1());
    const st = fakeStorage({ [KEY]: raw }, { failSet: [BACKUP_V1_KEY] });
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'migrated-unsaved');
    assert.equal(st.data.get(KEY), raw);
    assert.equal(res.state.version, STATE_VERSION);
  });

  test('si falla guardar el estado migrado, la copia cruda ya está hecha y lo viejo sigue ahí', () => {
    const raw = JSON.stringify(v1());
    const st = fakeStorage({ [KEY]: raw }, { failSet: [KEY] });
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'migrated-unsaved');
    assert.equal(st.data.get(BACKUP_V1_KEY), raw);
    assert.equal(st.data.get(KEY), raw);
  });
});

describe('estado vacío, inexistente o roto', () => {
  test('sin nada guardado: estado por defecto y no se escribe nada', () => {
    const st = fakeStorage();
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'empty');
    assert.equal(res.state.version, STATE_VERSION);
    assert.deepEqual(res.state.orders, []);
    assert.equal(st.data.size, 0);
  });

  test('objeto vacío {}: se migra a un estado válido y se conserva la copia', () => {
    const st = fakeStorage({ [KEY]: '{}' });
    const res = loadStoredState(st, KEY);
    assert.equal(res.status, 'migrated');
    assert.equal(res.state.version, STATE_VERSION);
    assert.equal(res.state.menu.length, 6);
    assert.equal(st.data.get(BACKUP_V1_KEY), '{}');
  });

  test('JSON corrupto: no lanza, arranca por defecto y conserva el texto aparte', () => {
    const corrupt = '{"version":1,"orders":[{"id":"p1","tot';
    const st = fakeStorage({ [KEY]: corrupt });
    let res;
    assert.doesNotThrow(() => { res = loadStoredState(st, KEY); });
    assert.equal(res.status, 'corrupt');
    assert.deepEqual(res.state.orders, []);
    assert.equal(st.data.get(KEY), corrupt);               // no se borra ni se pisa
    assert.equal(st.data.get(CORRUPT_STATE_KEY), corrupt); // y queda una copia aparte
    assert.equal(st.data.has(BACKUP_V1_KEY), false);
  });

  test('JSON válido pero que no es un objeto (null, número, lista, texto) se trata como corrupto', () => {
    for (const raw of ['null', '5', '[]', '"hola"', 'true']) {
      const st = fakeStorage({ [KEY]: raw });
      const res = loadStoredState(st, KEY);
      assert.equal(res.status, 'corrupt', raw);
      assert.equal(st.data.get(KEY), raw, raw);
    }
  });

  test('texto vacío guardado: corrupto, sin lanzar', () => {
    const st = fakeStorage({ [KEY]: '' });
    assert.equal(loadStoredState(st, KEY).status, 'corrupt');
  });

  test('una copia aparte previa de un estado corrupto no se pisa', () => {
    const st = fakeStorage({ [KEY]: '{rota', [CORRUPT_STATE_KEY]: 'anterior' });
    loadStoredState(st, KEY);
    assert.equal(st.data.get(CORRUPT_STATE_KEY), 'anterior');
  });

  test('storage que lanza al leer: estado por defecto, sin lanzar', () => {
    const st = fakeStorage({}, { failGet: [KEY] });
    let res;
    assert.doesNotThrow(() => { res = loadStoredState(st, KEY); });
    assert.equal(res.status, 'unreadable');
    assert.equal(res.state.version, STATE_VERSION);
  });
});
