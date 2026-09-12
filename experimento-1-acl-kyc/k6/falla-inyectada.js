/**
 * falla-inyectada.js — Experimento 1 (Circuit Breaker/Retry en ACL Worker de
 * KYC), escenario de falla inyectada. Reproduce la ventana caída->recuperación
 * exigida por el criterio de éxito (a) del experimento: que la latencia p95
 * de Suscripción para solicitudes NO dependientes de KYC se mantenga dentro
 * de su SLA normal aun con KYC caído.
 *
 * Dos scenarios corriendo en PARALELO durante 60s en total:
 *
 *   - "carga": VUs constantes (mismos parámetros que baseline.js) golpeando
 *     con-kyc y sin-kyc en consumidor-under (UNDER), nunca directo al ACL
 *     Worker, con los mismos tags {endpoint: 'con-kyc'|'sin-kyc'} para poder
 *     comparar p95 por separado en el resumen.
 *
 *   - "controlador": 1 VU, línea de tiempo única contra el stub de KYC
 *     (stub-kyc, POST {STUB_URL}/control/mode):
 *       t=0s   -> "healthy"          (forzado explícito, por si quedó en
 *                                     otro modo de una corrida anterior)
 *       t=15s  -> "pending-forever"  (KYC deja de resolver: dispara timeouts
 *                                     en el ACL Worker y, tras varios fallos
 *                                     consecutivos, abre el circuito)
 *       t=45s  -> "healthy"          (KYC se recupera; el circuito debe
 *                                     cerrar automáticamente dentro de su
 *                                     ventana de recuperación)
 *     La corrida completa dura 60s para dejar ~15s de observación después
 *     de la recuperación.
 *
 * Uso:
 *   k6 run falla-inyectada.js
 *
 * Variables de entorno (con default):
 *   UNDER_URL  (default http://localhost:6000)
 *   STUB_URL   (default http://localhost:4000)
 *   VUS        (default 8)
 *   DURATION   (default 60s) — duración total del scenario "carga"
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const UNDER_URL = __ENV.UNDER_URL || 'http://localhost:6000';
const STUB_URL = __ENV.STUB_URL || 'http://localhost:4000';
const VUS = parseInt(__ENV.VUS || '8', 10);
const DURATION = __ENV.DURATION || '60s';
const DURATION_SECONDS = parseInt(DURATION.replace('s', ''), 10) || 60;

export const options = {
  scenarios: {
    carga: {
      executor: 'constant-vus',
      exec: 'carga',
      vus: VUS,
      duration: DURATION,
    },
    controlador: {
      executor: 'shared-iterations',
      exec: 'controlador',
      vus: 1,
      iterations: 1,
      maxDuration: DURATION,
    },
  },
  thresholds: {
    // El threshold de sin-kyc es el que de verdad importa (control del
    // experimento). El de con-kyc es deliberadamente laxo (no debe fallar
    // la corrida durante la ventana de falla inyectada) — está declarado
    // solo para que k6 muestre el desglose de p95 por tag en el resumen.
    'http_req_duration{endpoint:sin-kyc}': ['p(95)<1000'],
    'http_req_duration{endpoint:con-kyc}': ['p(95)<10000'],
  },
};

export function carga() {
  const clienteId = `cliente-${__VU}-${__ITER}`;
  const payload = JSON.stringify({ clienteId });
  const headers = { headers: { 'Content-Type': 'application/json' } };

  const resConKyc = http.post(`${UNDER_URL}/suscripcion/con-kyc`, payload, {
    ...headers,
    tags: { endpoint: 'con-kyc' },
  });
  check(resConKyc, {
    'con-kyc responde 200 (nunca 5xx)': (r) => r.status === 200,
  });

  const resSinKyc = http.post(`${UNDER_URL}/suscripcion/sin-kyc`, payload, {
    ...headers,
    tags: { endpoint: 'sin-kyc' },
  });
  check(resSinKyc, {
    'sin-kyc responde 200': (r) => r.status === 200,
  });

  sleep(1);
}

function setStubMode(mode) {
  const res = http.post(
    `${STUB_URL}/control/mode`,
    JSON.stringify({ mode }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'control' } },
  );
  check(res, {
    [`stub-kyc modo -> ${mode} (200)`]: (r) => r.status === 200,
  });
}

export function controlador() {
  // t=0s: forzar "healthy" explícitamente por si quedó en otro modo de una
  // corrida anterior.
  setStubMode('healthy');

  sleep(15);
  // t=15s: KYC deja de resolver.
  setStubMode('pending-forever');

  sleep(30);
  // t=45s: KYC se recupera.
  setStubMode('healthy');

  // Deja correr el resto de la ventana de observación (hasta t=60s) sin
  // más cambios de modo.
  const restante = DURATION_SECONDS - 45;
  if (restante > 0) {
    sleep(restante);
  }
}
