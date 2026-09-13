'use strict';

/**
 * Consolidador KYC (reconciliación diferida) — ver "Extensión de diseño:
 * Consolidador KYC (reconciliación diferida)" en ../../DISENO-EXPERIMENTOS.md.
 *
 * Es un WORKER de BullMQ, no una API: consume la cola `kyc-reconciliacion`
 * que el ACL Worker encola (fire-and-forget) cada vez que degrada una
 * verificación, y por cada job vuelve a llamar AL ACL WORKER
 * (`POST /verificaciones/kyc`) — NUNCA al proveedor KYC directo. El ACL
 * Worker sigue siendo el único punto de salida hacia proveedores externos
 * (principio ACL ya establecido en el Experimento 1).
 *
 * Deliberadamente sin estructura de puertos/adaptadores: es andamiaje de
 * reconciliación, no el ACL boundary (aclarado explícitamente en el diseño;
 * esa capa hexagonal es exclusiva de `acl-worker/`).
 */

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const http = require('http');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ACL_WORKER_URL = process.env.ACL_WORKER_URL || 'http://localhost:5000';
const CONSOLIDADOR_PORT = parseInt(process.env.CONSOLIDADOR_PORT, 10) || 7000;
const NOMBRE_COLA = 'kyc-reconciliacion';
// TTL del estado consolidado en Redis: 1 hora, valor de referencia (ver diseño,
// punto 4 del contrato del Consolidador KYC).
const TTL_ESTADO_SEGUNDOS = parseInt(process.env.KYC_ESTADO_TTL_SEGUNDOS, 10) || 3600;

// Una sola conexión IORedis, reutilizada tanto por el Worker de BullMQ como
// para escribir directamente el estado consolidado (`kyc:estado:<clienteId>`).
// maxRetriesPerRequest:null es requerido por BullMQ para conexiones de Worker.
const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (error) => {
  console.error(`[consolidador-kyc] error de conexión a Redis: ${error.message}`);
});

redis.on('connect', () => {
  console.log(`[consolidador-kyc] conectado a Redis (${REDIS_URL})`);
});

/**
 * Reentra por el ACL Worker (nunca al proveedor KYC directo) para saber si
 * el cliente ya resolvió su verificación de identidad.
 */
async function reintentarVerificacion(clienteId) {
  const respuesta = await fetch(`${ACL_WORKER_URL}/verificaciones/kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `origen: 'consolidador'` le dice al ACL Worker que esta llamada YA es
    // un reintento de reconciliación, para que NO vuelva a encolar un job
    // nuevo si sigue degradado (si no, cada reintento generaría un job
    // adicional además del reintento que BullMQ ya programa sobre este
    // mismo job — una cadena sin fin mientras el circuito esté abierto).
    body: JSON.stringify({ clienteId, origen: 'consolidador' }),
  });

  if (!respuesta.ok) {
    throw new Error(`acl_worker_respuesta_inesperada: HTTP ${respuesta.status}`);
  }

  return respuesta.json();
}

const worker = new Worker(
  NOMBRE_COLA,
  async (job) => {
    const { clienteId } = job.data;
    console.log(
      `[consolidador-kyc] procesando job ${job.id} (intento ${job.attemptsMade + 1}/${job.opts.attempts}) para clienteId=${clienteId}`,
    );

    const resultado = await reintentarVerificacion(clienteId);

    if (resultado.estado === 'aprobado' || resultado.estado === 'rechazado') {
      const clave = `kyc:estado:${clienteId}`;
      const valor = JSON.stringify({ estado: resultado.estado, timestamp: Date.now() });
      await redis.set(clave, valor, 'EX', TTL_ESTADO_SEGUNDOS);
      console.log(
        `[consolidador-kyc] reconciliado clienteId=${clienteId} -> ${resultado.estado} (escrito en "${clave}", TTL ${TTL_ESTADO_SEGUNDOS}s)`,
      );
      return { reconciliado: true, estado: resultado.estado };
    }

    // Sigue "degradado": el proveedor (o el circuito del ACL Worker)
    // todavía no se recupera. Se lanza un error para que BullMQ programe el
    // siguiente reintento según la política de backoff configurada por el
    // PRODUCTOR (ACL Worker, ver
    // ../../acl-worker/src/infra/ColaReconciliacion.ts: 5 intentos, backoff
    // exponencial). Si se agotan los intentos, BullMQ mueve el job a su
    // failed set (la DLQ del diagrama) automáticamente — no se construye
    // nada adicional para eso.
    throw new Error(`kyc_aun_degradado: clienteId=${clienteId} sigue degradado tras reintentar vía ACL Worker`);
  },
  { connection: redis },
);

worker.on('completed', (job, resultado) => {
  console.log(`[consolidador-kyc] job ${job.id} completado ->`, resultado);
});

worker.on('failed', (job, error) => {
  if (!job) {
    console.error(`[consolidador-kyc] job desconocido falló: ${error.message}`);
    return;
  }
  const intentosTotales = job.opts.attempts || 1;
  const agotado = job.attemptsMade >= intentosTotales;
  console.log(
    `[consolidador-kyc] job ${job.id} (clienteId=${job.data.clienteId}) falló en intento ${job.attemptsMade}/${intentosTotales}: ${error.message}` +
      (agotado
        ? ' -> intentos agotados, el job queda en el failed set de BullMQ (DLQ)'
        : ' -> BullMQ programará el siguiente reintento con backoff exponencial'),
  );
});

worker.on('error', (error) => {
  console.error(`[consolidador-kyc] error del worker (no bloqueante): ${error.message}`);
});

console.log(
  `[consolidador-kyc] escuchando la cola "${NOMBRE_COLA}" (REDIS_URL=${REDIS_URL}, ACL_WORKER_URL=${ACL_WORKER_URL})`,
);

// Health check HTTP mínimo — no esencial para el experimento (el
// Consolidador es un worker de cola, no una API), pero útil para el
// healthcheck de docker-compose y para confirmar que el proceso vive.
// Se usa el módulo http nativo, sin agregar Express solo para esto.
const servidorSalud = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cola: NOMBRE_COLA, aclWorkerUrl: ACL_WORKER_URL }));
    return;
  }
  res.writeHead(404);
  res.end();
});
servidorSalud.listen(CONSOLIDADOR_PORT, () => {
  console.log(`[consolidador-kyc] health check en puerto ${CONSOLIDADOR_PORT}`);
});

module.exports = worker;
