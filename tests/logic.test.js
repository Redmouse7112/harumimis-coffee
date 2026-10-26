// Tests de la lógica pura (src/scripts/logic.js). Correr con: node --test tests/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATE_VERSION, MIGRATIONS, defaultState, migrateState,
  computeTotals, cashDifference, eventNameFor,
} = require('../src/scripts/logic.js');

const order = (total, method, extra) =>
  Object.assign({ id:'o', total, method, sessionId:1, voided:false }, extra);

describe('computeTotals (totales de sesión)', () => {
  test('sin pedidos devuelve todo en cero', () => {
    assert.deepEqual(computeTotals([]), { count:0, efectivo:0, transferencia:0, grand:0 });
  });

  test('separa efectivo de transferencia y suma el total', () => {
    const t = computeTotals([order(1000,'efectivo'), order(1500,'transferencia'), order(500,'efectivo')]);
    assert.deepEqual(t, { count:3, efectivo:1500, transferencia:1500, grand:3000 });
  });

  test('los pedidos anulados no cuentan ni suman', () => {
    const t = computeTotals([order(1000,'efectivo'), order(9999,'efectivo',{ voided:true })]);
    assert.deepEqual(t, { count:1, efectivo:1000, transferencia:0, grand:1000 });
  });

  test('no modifica la lista recibida', () => {
    const orders = [order(1,'efectivo'), order(2,'efectivo',{ voided:true })];
    const copy = JSON.parse(JSON.stringify(orders));
    computeTotals(orders);
    assert.deepEqual(orders, copy);
  });
});

describe('cashDifference (diferencia de arqueo)', () => {
  test('0 cuando lo contado coincide con efectivo + fondo', () => {
    assert.equal(cashDifference(3500, 2500, 1000), 0);
  });
  test('positivo cuando sobra', () => {
    assert.equal(cashDifference(3700, 2500, 1000), 200);
  });
  test('negativo cuando falta', () => {
    assert.equal(cashDifference(3000, 2500, 1000), -500);
  });
  test('sin fondo inicial compara solo contra el efectivo', () => {
    assert.equal(cashDifference(2500, 2500, 0), 0);
  });
});

describe('migrateState', () => {
  test('STATE_VERSION coincide con la cantidad de migraciones', () => {
    assert.equal(STATE_VERSION, MIGRATIONS.length);
  });

  test('sin datos guardados devuelve el estado por defecto en la versión actual', () => {
    for (const raw of [null, undefined, {}]) {
      const s = migrateState(raw);
      assert.equal(s.version, STATE_VERSION);
      assert.equal(s.menu.length, 6);
      assert.deepEqual(s.orders, []);
      assert.equal(s.sessionId, 1);
    }
  });

  test('v0 (sin version): agrega customerName y completa los campos nuevos', () => {
    const v0 = {
      menu: [{ id:'m1', name:'Café', price:1000 }],
      orders: [{ id:'a', total:1000, method:'efectivo', sessionId:1, items:[] }],
      closures: [],
      sessionId: 1,
      sessionSince: '2025-08-01T12:00:00.000Z',
    };
    const s = migrateState(v0);
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.orders[0].customerName, '');
    assert.equal(s.eventNameCustom, false);
    assert.equal(s.fondoInicial, 0);
    assert.equal(s.menu.length, 1); // conserva el menú guardado
  });

  test('v0 con eventNameSet=true: el nombre queda congelado como personalizado', () => {
    const s = migrateState({ orders: [], eventName:'Expo Formosa', eventNameSet:true });
    assert.equal(s.eventNameCustom, true);
    assert.equal(s.eventName, 'Expo Formosa');
  });

  test('v1 sin eventNameCustom (guardada antes de ese campo) lo infiere de eventNameSet', () => {
    const s = migrateState({ version:1, orders:[], eventName:'X', eventNameSet:true });
    assert.equal(s.eventNameCustom, true);
    assert.equal(s.version, STATE_VERSION);
  });

  test('v1 que ya tiene eventNameCustom/fondoInicial no los pisa', () => {
    const s = migrateState({
      version:1, orders:[], eventName:'', eventNameSet:true,
      eventNameCustom:false, fondoInicial:2000,
    });
    assert.equal(s.eventNameCustom, false);
    assert.equal(s.fondoInicial, 2000);
  });

  test('respeta el customerName de pedidos que ya lo tienen', () => {
    const s = migrateState({ version:1, orders:[{ id:'a', customerName:'Naru', total:1, method:'efectivo' }] });
    assert.equal(s.orders[0].customerName, 'Naru');
  });

  test('es idempotente: migrar dos veces da lo mismo', () => {
    const once = migrateState({ orders:[{ id:'a', total:5, method:'efectivo' }], sessionSince:'2025-08-01T12:00:00.000Z' });
    assert.deepEqual(migrateState(once), once);
  });

  test('una versión más nueva que la de la app no se degrada ni se migra', () => {
    const future = { version: STATE_VERSION + 5, orders:[{ id:'a' }], campoNuevo:true, sessionSince:'2025-08-01T12:00:00.000Z' };
    const s = migrateState(future);
    assert.equal(s.version, STATE_VERSION + 5);
    assert.equal(s.campoNuevo, true);
    assert.equal(s.orders[0].customerName, undefined);
  });

  test('no muta el objeto de entrada', () => {
    const raw = { orders:[{ id:'a' }] };
    const copy = JSON.parse(JSON.stringify(raw));
    migrateState(raw);
    assert.deepEqual(raw, copy);
  });

  test('defaultState no comparte referencias con el menú por defecto', () => {
    const a = defaultState(), b = defaultState();
    a.menu[0].price = 1;
    assert.notEqual(b.menu[0].price, 1);
  });
});

describe('eventNameFor (nombre del evento)', () => {
  // mediodía local: evita que la zona horaria cambie el día
  const now = new Date(2025, 7, 9, 12, 0, 0);

  test('sin nombre propio muestra "Evento del {hoy}"', () => {
    assert.equal(eventNameFor({ eventNameCustom:false, eventName:'' }, now), 'Evento del 09/08/2025');
  });

  test('el default sigue la fecha de hoy, no la de apertura de la sesión', () => {
    const st = { eventNameCustom:false, eventName:'', sessionSince:new Date(2025, 7, 1).toISOString() };
    assert.equal(eventNameFor(st, new Date(2025, 7, 20, 12)), 'Evento del 20/08/2025');
  });

  test('con nombre propio confirmado lo usa tal cual', () => {
    assert.equal(eventNameFor({ eventNameCustom:true, eventName:'Expo Formosa' }, now), 'Expo Formosa');
  });

  test('personalizado pero vacío vuelve al default', () => {
    assert.equal(eventNameFor({ eventNameCustom:true, eventName:'' }, now), 'Evento del 09/08/2025');
  });

  test('nombre guardado sin la marca de personalizado se ignora', () => {
    assert.equal(eventNameFor({ eventNameCustom:false, eventName:'Viejo' }, now), 'Evento del 09/08/2025');
  });
});
