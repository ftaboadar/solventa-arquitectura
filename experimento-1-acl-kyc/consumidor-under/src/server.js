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
const Redis = require('ioredis');

const UNDER_PORT = parseInt(process.env.UNDER_PORT, 10) || 6000;
const ACL_WORKER_URL = process.env.ACL_WORKER_URL || 'http://localhost:5000';
// Debe ser mayor al peor caso documentado del ACL Worker en fallo (~3.1 s
// con los defaults de KYC_TIMEOUT_MS/RETRY_ATTEMPTS — ver acl-worker/README.md)
// para no cortar una llamada legítima, pero nunca esperar indefinidamente.
const UNDER_HTTP_TIMEOUT_MS = parseInt(process.env.UNDER_HTTP_TIMEOUT_MS, 10) || 4000;
// Trabajo trivial simulado del flujo sin-KYC, para no responder instantáneo.
const SIN_KYC_MIN_MS = parseInt(process.env.SIN_KYC_MIN_MS, 10) || 20;
const SIN_KYC_MAX_MS = parseInt(process.env.SIN_KYC_MAX_MS, 10) || 50;
// Redis compartido con acl-worker/ (que encola) y consolidador-kyc/ (que
// escribe kyc:estado:<clienteId>) — ver "Extensión de diseño: Consolidador
// KYC" en DISENO-EXPERIMENTOS.md.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cliente Redis para la lectura síncrona de "estado consolidado" (punto 6
// del contrato del Consolidador KYC). maxRetriesPerRequest/commandTimeout
// bajos son deliberados: esta lectura debe ser rápida (~1ms) y NUNCA puede
// convertirse en el nuevo cuello de botella de con-kyc si Redis está caído
// — en ese caso simplemente se ignora y se usa el placeholder genérico que
// ya existía, tal como exige el diseño.
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  commandTimeout: 300,
  retryStrategy: (intento) => Math.min(intento * 500, 5000),
});

redis.on('error', (error) => {
  console.error(`[consumidor-under] error de conexión a Redis (no bloqueante): ${error.message}`);
});

/**
 * Lee `kyc:estado:<clienteId>` en Redis. Devuelve `null` si no existe o si
 * la lectura falla (Redis caído, timeout, etc.) — nunca lanza hacia el
 * llamador: el fallback siempre es el placeholder genérico
 * `pendiente_verificacion` que ya existía antes del Consolidador KYC.
 */
async function leerEstadoConsolidado(clienteId) {
  try {
    const crudo = await redis.get(`kyc:estado:${clienteId}`);
    if (!crudo) return null;
    return JSON.parse(crudo);
  } catch (error) {
    console.error(
      `[consumidor-under] fallo leyendo estado consolidado de Redis para clienteId=${clienteId} (no bloqueante, se usa el placeholder genérico): ${error.message}`,
    );
    return null;
  }
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
      // Extensión "Consolidador KYC" (ver DISENO-EXPERIMENTOS.md): antes de
      // usar el placeholder genérico, se lee el estado consolidado de un
      // intento de reconciliación anterior. Lectura rápida y no bloqueante
      // — si no hay nada (o Redis falla), se cae al comportamiento previo.
      const estadoConsolidado = await leerEstadoConsolidado(clienteId);
      if (estadoConsolidado) {
        return res.status(200).json({
          estado: estadoConsolidado.estado === 'aprobado' ? 'suscripcion_aprobada' : 'suscripcion_rechazada',
          kyc: estadoConsolidado.estado,
          motivo: 'kyc_reconciliado_por_consolidador',
          mensaje: `Tu verificación de identidad se resolvió en un intento posterior (reconciliada el ${new Date(estadoConsolidado.timestamp).toISOString()}).`,
          clienteId,
          duracionMs,
        });
      }

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
