'use strict';

/**
 * Stub de KYC — imita el contrato ASÍNCRONO real de Truora (dev.truora.com)
 * para el Experimento 1 de arquitectura de Solventa (ver
 * 01-hoja-de-trabajo/03-diseno-experimento-arquitectura/README.md,
 * sección "Refinamiento de diseño").
 *
 * Este archivo es andamiaje de prueba de un solo uso: deliberadamente NO
 * lleva estructura de puertos/adaptadores (esa capa hexagonal es del
 * ACL Worker, no de este stub).
 *
 * Contrato imitado:
 *   POST /v1/validations           -> 201 + { validation_id, status: "pending" }
 *   GET  /v1/validations/:id       -> { validation_id, status: "pending"|"success"|"failure" }
 *   Header obligatorio: Truora-API-Key (401 si falta o está vacío)
 *
 * Modos de falla, cambiables en caliente sin reiniciar el proceso:
 *   POST /control/mode { "mode": "healthy" | "pending-forever" | "error-429" | "down" }
 *   GET  /control/mode -> { mode }
 */

const express = require('express');
const { randomUUID } = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 4000;
const SIM_LATENCY_MIN_MS = parseInt(process.env.SIM_LATENCY_MIN_MS, 10) || 200;
const SIM_LATENCY_MAX_MS = parseInt(process.env.SIM_LATENCY_MAX_MS, 10) || 500;

const VALID_MODES = ['healthy', 'pending-forever', 'error-429', 'down'];
const TRUORA_429_MESSAGE =
  'There are too many high priority background checks being processed. Please try again later.';

// --- Estado en memoria (suficiente para un stub de experimento) ---
let currentMode = 'healthy';
/** @type {Map<string, { validation_id: string, status: 'pending'|'success'|'failure', createdAt: number, resolveAt: number }>} */
const validations = new Map();

function randomLatencyMs() {
  return SIM_LATENCY_MIN_MS + Math.floor(Math.random() * (SIM_LATENCY_MAX_MS - SIM_LATENCY_MIN_MS + 1));
}

const app = express();
app.use(express.json());

// --- Endpoints de control (no forman parte del contrato de Truora) ---

app.get('/control/mode', (req, res) => {
  res.status(200).json({ mode: currentMode });
});

app.post('/control/mode', (req, res) => {
  const { mode } = req.body || {};
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: 'invalid_mode',
      message: `mode debe ser uno de: ${VALID_MODES.join(', ')}`,
    });
  }
  currentMode = mode;
  return res.status(200).json({ mode: currentMode });
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, mode: currentMode });
});

// --- Middleware específico de /v1/validations* ---

// 1) Modo "down": el servidor simula una caída total y NO responde en
//    absoluto. No se cierra la conexión ni se envía nada: un cliente con
//    timeout corto (como debe tener el ACL Worker) lo notará al expirar su
//    propio timeout, tal como pasaría contra un proveedor real caído.
app.use('/v1/validations', (req, res, next) => {
  if (currentMode === 'down') {
    // Deliberadamente no se llama a res.send()/res.end()/res.json().
    // El socket queda abierto y colgado hasta que el cliente lo cancele.
    return;
  }
  next();
});

// 2) Autenticación: header Truora-API-Key obligatorio en todo /v1/validations*
app.use('/v1/validations', (req, res, next) => {
  const apiKey = req.header('Truora-API-Key');
  if (!apiKey || apiKey.trim() === '') {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Falta el header Truora-API-Key o está vacío.',
    });
  }
  next();
});

// 3) Modo "error-429": rate limit del proveedor, tanto en creación como en consulta.
app.use('/v1/validations', (req, res, next) => {
  if (currentMode === 'error-429') {
    return res.status(429).json({
      error: 'too_many_requests',
      message: TRUORA_429_MESSAGE,
    });
  }
  next();
});

// --- Contrato asíncrono ---

app.post('/v1/validations', (req, res) => {
  const validation_id = randomUUID();
  const now = Date.now();
  validations.set(validation_id, {
    validation_id,
    status: 'pending',
    createdAt: now,
    resolveAt: now + randomLatencyMs(),
  });

  return res.status(201).json({ validation_id, status: 'pending' });
});

app.get('/v1/validations/:id', (req, res) => {
  const record = validations.get(req.params.id);
  if (!record) {
    return res.status(404).json({
      error: 'not_found',
      message: `No existe una validación con id ${req.params.id}`,
    });
  }

  // El modo se evalúa en caliente en cada consulta, no se congela al crear
  // la validación: así un cambio de modo vía /control/mode afecta de
  // inmediato a validaciones ya creadas, que es justo lo que necesita el
  // experimento para inyectar fallas a mitad de una corrida de carga.
  if (currentMode === 'pending-forever') {
    return res.status(200).json({ validation_id: record.validation_id, status: 'pending' });
  }

  // Modo "healthy" (y cualquier otro modo no controlado explícitamente):
  // resuelve a success una vez pasa la latencia simulada.
  if (record.status === 'pending' && Date.now() >= record.resolveAt) {
    record.status = 'success';
  }

  return res.status(200).json({ validation_id: record.validation_id, status: record.status });
});

const server = app.listen(PORT, () => {
  console.log(`[stub-kyc] escuchando en puerto ${PORT}, modo inicial: ${currentMode}`);
});

// Sin estos límites, el propio servidor HTTP de Node cortaría por su cuenta
// las peticiones colgadas del modo "down" (Node 18+ trae un requestTimeout
// por defecto de 5 min). Se desactivan para que "down" cuelgue de verdad
// hasta que el cliente decida abortar.
server.requestTimeout = 0;
server.headersTimeout = 0;

module.exports = server;
