'use strict';

/**
 * Consumidor simplificado de UNDER (Suscripción) para el Experimento 1
 * (Circuit Breaker/Retry en el ACL Worker de KYC) de arquitectura de
 * Solventa. Ver 01-hoja-de-trabajo/03-diseno-experimento-arquitectura/README.md
 * (fila 6/7 de la tabla del Experimento 1 y sección "Refinamiento de diseño").
 *
 * Este archivo es andamiaje de prueba de un solo uso: deliberadamente NO
 * lleva estructura de puertos/adaptadores (esa capa hexagonal es del
 * ACL Worker, no de este consumidor ni del stub de KYC).
 *
 * Expone DOS endpoints porque el criterio de éxito (a) del experimento
 * compara explícitamente la latencia de solicitudes dependientes de KYC
 * contra las que NO dependen de KYC:
 *
 *   POST /suscripcion/con-kyc  -> llama al ACL Worker con un timeout propio
 *                                 corto. Nunca propaga un 5xx: si el ACL
 *                                 Worker responde "degradado", o si el
 *                                 timeout propio se cumple, la suscripción
 *                                 queda "pendiente de verificación" sin
 *                                 error visible al usuario.
 *   POST /suscripcion/sin-kyc -> NO toca el ACL Worker en absoluto. Es el
 *                                 control del experimento: debe mantenerse
 *                                 rápido y dentro de su SLA normal aunque
 *                                 KYC esté caído.
 */

const express = require('express');

const UNDER_PORT = parseInt(process.env.UNDER_PORT, 10) || 6000;
const ACL_WORKER_URL = process.env.ACL_WORKER_URL || 'http://localhost:5000';
// Debe ser mayor al peor caso documentado del ACL Worker en fallo (~3.1 s
// con los defaults de KYC_TIMEOUT_MS/RETRY_ATTEMPTS — ver acl-worker/README.md)
// para no cortar una llamada legítima, pero nunca esperar indefinidamente.
const UNDER_HTTP_TIMEOUT_MS = parseInt(process.env.UNDER_HTTP_TIMEOUT_MS, 10) || 4000;
// Trabajo trivial simulado del flujo sin-KYC, para no responder instantáneo.
const SIN_KYC_MIN_MS = parseInt(process.env.SIN_KYC_MIN_MS, 10) || 20;
const SIN_KYC_MAX_MS = parseInt(process.env.SIN_KYC_MAX_MS, 10) || 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomTrivialWorkMs() {
  return SIN_KYC_MIN_MS + Math.floor(Math.random() * (SIN_KYC_MAX_MS - SIN_KYC_MIN_MS + 1));
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, aclWorkerUrl: ACL_WORKER_URL });
});

// --- Control: flujo de suscripción que SÍ depende de KYC ---
app.post('/suscripcion/con-kyc', async (req, res) => {
  const { clienteId } = req.body || {};
  const inicio = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UNDER_HTTP_TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${ACL_WORKER_URL}/verificaciones/kyc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId }),
      signal: controller.signal,
    });

    const duracionMs = Date.now() - inicio;

    // Contrato documentado del ACL Worker: siempre 200, nunca un 5xx crudo.
    // Por robustez del consumidor, igual se trata cualquier respuesta no-200
    // como "no disponible" en vez de propagarla.
    if (!respuesta.ok) {
      return res.status(200).json({
        estado: 'pendiente_verificacion',
        motivo: 'kyc_respuesta_inesperada',
        clienteId,
        duracionMs,
      });
    }

    const cuerpo = await respuesta.json();

    if (cuerpo.estado === 'degradado') {
      return res.status(200).json({
        estado: 'pendiente_verificacion',
        motivo: cuerpo.motivo || 'kyc_no_disponible',
        mensaje: 'Tu suscripción quedó registrada y está pendiente de verificación de identidad. Te notificaremos cuando se complete.',
        clienteId,
        duracionMs,
      });
    }

    // aprobado/rechazado: resultado normal del flujo de KYC, no es un error
    // del sistema — la suscripción sigue su curso con ese resultado.
    return res.status(200).json({
      estado: cuerpo.estado === 'aprobado' ? 'suscripcion_aprobada' : 'suscripcion_rechazada',
      kyc: cuerpo.estado,
      clienteId,
      duracionMs,
    });
  } catch (error) {
    // Cubre tanto el timeout propio (AbortError) como cualquier error de red
    // hacia el ACL Worker. Nunca se propaga un 5xx: la suscripción queda
    // pendiente de verificación, sin error visible al usuario final.
    const duracionMs = Date.now() - inicio;
    const motivo = error.name === 'AbortError' ? 'under_timeout' : 'acl_worker_no_disponible';
    return res.status(200).json({
      estado: 'pendiente_verificacion',
      motivo,
      mensaje: 'Tu suscripción quedó registrada y está pendiente de verificación de identidad. Te notificaremos cuando se complete.',
      clienteId,
      duracionMs,
    });
  } finally {
    clearTimeout(timeoutId);
  }
});

// --- Control: flujo de suscripción que NO depende de KYC ---
app.post('/suscripcion/sin-kyc', async (req, res) => {
  const { clienteId } = req.body || {};
  const inicio = Date.now();

  // Simula trabajo trivial de suscripción (validaciones locales, escritura
  // de borrador, etc.) que no depende de ningún proveedor externo.
  await sleep(randomTrivialWorkMs());

  const duracionMs = Date.now() - inicio;
  return res.status(200).json({
    estado: 'suscripcion_creada',
    clienteId,
    duracionMs,
  });
});

const server = app.listen(UNDER_PORT, () => {
  console.log(`[consumidor-under] escuchando en puerto ${UNDER_PORT}, ACL_WORKER_URL=${ACL_WORKER_URL}, UNDER_HTTP_TIMEOUT_MS=${UNDER_HTTP_TIMEOUT_MS}`);
});

module.exports = server;
