// Tests de la lógica pura (src/scripts/logic.js). Correr con: node --test tests/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATE_VERSION, MIGRATIONS, defaultState, migrateState,
  computeTotals, cashDifference, eventNameFor,
  BACKUP_MAX_AGE_DAYS, buildBackup, validateBackup, backupStatus,
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

describe('copia de seguridad', () => {
  const now = new Date(2025, 7, 20, 12);
  const fullOrder = (extra) => Object.assign({
    id:'o1', timestamp:'2025-08-09T15:00:00.000Z', customerName:'Naru',
    items:[{ name:'Café', price:1000, qty:1 }], total:1000, method:'efectivo',
    sessionId:1, voided:false,
  }, extra);
  const sample = () => Object.assign(defaultState(), { orders:[fullOrder()] });
  const roundtrip = (backup) => validateBackup(JSON.stringify(backup));

  test('exportar y volver a importar devuelve el mismo estado', () => {
    const st = sample();
    const res = roundtrip(buildBackup(st, now));
    assert.equal(res.ok, true);
    assert.deepEqual(res.state, st);
    assert.deepEqual(res.summary, { orders:1, closures:0, menuItems:6 });
    assert.equal(res.exportedAt, now.toISOString());
  });

  test('el archivo lleva app, schemaVersion y exportedAt', () => {
    const b = buildBackup(sample(), now);
    assert.equal(b.app, 'harumimi-coffee');
    assert.equal(b.schemaVersion, STATE_VERSION);
    assert.equal(b.exportedAt, now.toISOString());
  });

  test('una copia de una versión vieja se migra al importar', () => {
    const b = buildBackup(sample(), now);
    delete b.state.eventNameCustom;
    b.state.eventNameSet = true;
    b.schemaVersion = 1;
    const res = roundtrip(b);
    assert.equal(res.ok, true);
    assert.equal(res.state.version, STATE_VERSION);
    assert.equal(res.state.eventNameCustom, true);
  });

  test('rechaza texto que no es JSON', () => {
    assert.equal(validateBackup('hola').ok, false);
    assert.equal(validateBackup('').ok, false);
  });

  test('rechaza JSON que no es una copia de la app', () => {
    assert.equal(validateBackup('[]').ok, false);
    assert.equal(validateBackup('null').ok, false);
    assert.equal(validateBackup(JSON.stringify(sample())).ok, false); // estado pelado, sin sobre
    const b = buildBackup(sample(), now); b.app = 'otra-app';
    assert.equal(roundtrip(b).ok, false);
  });

  test('rechaza una copia de una versión más nueva', () => {
    const b = buildBackup(sample(), now); b.schemaVersion = STATE_VERSION + 1;
    const res = roundtrip(b);
    assert.equal(res.ok, false);
    assert.match(res.error, /más nueva/);
  });

  test('rechaza schemaVersion faltante o inválido', () => {
    for (const v of [undefined, '2', -1, 1.5]) {
      const b = buildBackup(sample(), now); b.schemaVersion = v;
      assert.equal(roundtrip(b).ok, false, String(v));
    }
  });

  test('rechaza estados dañados', () => {
    const mutate = (fn) => { const b = buildBackup(sample(), now); fn(b.state); return roundtrip(b); };
    assert.equal(mutate(s => { s.orders = 'x'; }).ok, false);
    assert.equal(mutate(s => { s.orders[0].total = 'mil'; }).ok, false);
    assert.equal(mutate(s => { s.orders[0].method = 'cripto'; }).ok, false);
    assert.equal(mutate(s => { s.orders[0].timestamp = 'ayer'; }).ok, false);
    assert.equal(mutate(s => { s.closures = [null]; }).ok, false);
    assert.equal(mutate(s => { s.menu[0].price = null; }).ok, false);
    assert.equal(mutate(s => { s.sessionId = 0; }).ok, false);
    assert.equal(mutate(s => { s.sessionSince = 'x'; }).ok, false);
    assert.equal(mutate(s => { s.fondoInicial = 'x'; }).ok, false);
    assert.equal(mutate(s => { delete s.state; s.menu = null; }).ok, false);
  });

  test('un estado sin datos con campos opcionales ausentes sigue siendo válido', () => {
    const b = buildBackup(sample(), now);
    delete b.state.fondoInicial;
    assert.equal(roundtrip(b).ok, true);
  });

  describe('backupStatus (aviso de backup)', () => {
    const withData = sample();
    const empty = defaultState();
    const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

    test('sin datos no hay nada que avisar', () => {
      assert.equal(backupStatus(null, empty, now).due, false);
    });
    test('hay datos y nunca se exportó: avisa', () => {
      const s = backupStatus(null, withData, now);
      assert.equal(s.due, true);
      assert.equal(s.days, null);
    });
    test('exportó hace menos de 7 días: no avisa', () => {
      assert.equal(backupStatus(daysAgo(3), withData, now).due, false);
      assert.equal(backupStatus(daysAgo(BACKUP_MAX_AGE_DAYS), withData, now).due, false);
    });
    test('pasaron más de 7 días: avisa', () => {
      const s = backupStatus(daysAgo(8), withData, now);
      assert.equal(s.due, true);
      assert.equal(s.days, 8);
    });
    test('una fecha guardada ilegible cuenta como nunca exportado', () => {
      assert.equal(backupStatus('basura', withData, now).due, true);
    });
    test('solo cierres (sin pedidos) también cuenta como datos', () => {
      const s = Object.assign(defaultState(), { closures:[{ sessionId:1 }] });
      assert.equal(backupStatus(null, s, now).due, true);
    });
  });
});
