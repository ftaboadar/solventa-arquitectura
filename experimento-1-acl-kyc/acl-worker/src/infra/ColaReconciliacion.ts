import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

/**
 * Cola de reconciliación diferida del Consolidador KYC (ver "Extensión de
 * diseño: Consolidador KYC (reconciliación diferida)" en
 * ../../../DISENO-EXPERIMENTOS.md). El ACL Worker es el PRODUCTOR: cada vez
 * que ServicioVerificacion resuelve una llamada como "degradado", encola un
 * job aquí para que el Consolidador KYC reintente más tarde contra el ACL
 * Worker (nunca contra el proveedor KYC directo).
 *
 * Requisito no negociable del diseño: este encolado es fire-and-forget y
 * NUNCA puede tumbar ni retrasar la respuesta que el ACL Worker ya le dio a
 * UNDER. Si Redis está caído, el fallo se loguea y se ignora — no se lanza
 * ninguna excepción hacia ServicioVerificacion.
 */

export const NOMBRE_COLA_RECONCILIACION = 'kyc-reconciliacion';

let colaSingleton: Queue | null = null;
let colaFalloInicializacion = false;

function obtenerCola(): Queue | null {
  if (colaSingleton) return colaSingleton;
  if (colaFalloInicializacion) return null; // ya se intentó y falló; no reintentar en cada llamada

  try {
    const conexion = new IORedis(config.redisUrl, {
      // Requerido por BullMQ para conexiones usadas por sus componentes.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      // Reintenta la conexión de fondo, pero nunca lanza hacia arriba: el
      // listener 'error' de abajo es lo único que se ejecuta ante un fallo.
      retryStrategy: (intento) => Math.min(intento * 500, 5000),
    });

    conexion.on('error', (error) => {
      console.error(
        `[acl-worker][cola-reconciliacion] error de conexión a Redis (no bloqueante, no afecta respuestas a UNDER): ${error.message}`,
      );
    });

    colaSingleton = new Queue(NOMBRE_COLA_RECONCILIACION, { connection: conexion });
    return colaSingleton;
  } catch (error) {
    colaFalloInicializacion = true;
    console.error(
      `[acl-worker][cola-reconciliacion] no se pudo inicializar la cola (no bloqueante): ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * Encola `{ clienteId, timestamp }` en `kyc-reconciliacion`. Se llama SIN
 * `await` desde ServicioVerificacion — es fire-and-forget puro. La política
 * de reintentos (5 intentos, backoff exponencial) se define aquí, en el
 * productor, porque son opciones del job (`queue.add`), no del worker que
 * lo consume (el Consolidador KYC). Si se agotan, BullMQ mueve el job a su
 * *failed set* automáticamente (la "DLQ" del diseño) — no se construye nada
 * adicional para eso.
 */
export function encolarReconciliacion(clienteId: string): void {
  try {
    const cola = obtenerCola();
    if (!cola) return;

    cola
      .add(
        'reconciliar',
        { clienteId, timestamp: Date.now() },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false, // deja el job visible en el failed set (DLQ) tras agotar intentos
        },
      )
      .then(() => {
        console.log(`[acl-worker][cola-reconciliacion] job encolado para clienteId=${clienteId}`);
      })
      .catch((error) => {
        console.error(
          `[acl-worker][cola-reconciliacion] fallo al encolar clienteId=${clienteId} (no bloqueante): ${(error as Error).message}`,
        );
      });
  } catch (error) {
    // Red de seguridad final: ningún fallo de esta función debe propagarse
    // hacia ServicioVerificacion/el fallback del Circuit Breaker.
    console.error(
      `[acl-worker][cola-reconciliacion] fallo inesperado al encolar clienteId=${clienteId} (no bloqueante): ${(error as Error).message}`,
    );
  }
}
