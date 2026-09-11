/**
 * baseline.js — Experimento 1 (Circuit Breaker/Retry en ACL Worker de KYC),
 * escenario de línea base.
 *
 * Supuesto: el stub de KYC (stub-kyc, puerto 4000) ya está en modo "healthy"
 * ANTES de correr este script y se mantiene así durante toda la corrida —
 * este script no toca /control/mode. Solo golpea consumidor-under (UNDER),
 * nunca directo al ACL Worker: el punto es medir el impacto en "Suscripción".
 *
 * Carga: VUs constantes moderados golpeando ambos endpoints:
 *   - POST {UNDER_URL}/suscripcion/con-kyc  (tag endpoint=con-kyc)
 *   - POST {UNDER_URL}/suscripcion/sin-kyc  (tag endpoint=sin-kyc)
 *
 * Uso:
 *   1. Asegurar stub-kyc en modo healthy: curl -X POST http://localhost:4000/control/mode \
 *        -H "Content-Type: application/json" -d '{"mode":"healthy"}'
 *   2. k6 run baseline.js
 *
 * Variables de entorno (con default):
 *   UNDER_URL  (default http://localhost:6000)
 *   VUS        (default 8)
 *   DURATION   (default 30s)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const UNDER_URL = __ENV.UNDER_URL || 'http://localhost:6000';
const VUS = parseInt(__ENV.VUS || '8', 10);
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    carga: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:con-kyc}': ['p(95)<10000'],
    'http_req_duration{endpoint:sin-kyc}': ['p(95)<1000'],
  },
};

export default function () {
  const clienteId = `cliente-${__VU}-${__ITER}`;
  const payload = JSON.stringify({ clienteId });
  const headers = { headers: { 'Content-Type': 'application/json' } };

  const resConKyc = http.post(`${UNDER_URL}/suscripcion/con-kyc`, payload, {
    ...headers,
    tags: { endpoint: 'con-kyc' },
  });
  check(resConKyc, {
    'con-kyc responde 200': (r) => r.status === 200,
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
