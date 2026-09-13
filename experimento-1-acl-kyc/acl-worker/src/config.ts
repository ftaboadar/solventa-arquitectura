/**
 * Variables de entorno centralizadas del ACL Worker. Ver README.md de esta
 * carpeta para la tabla completa con defaults y su justificación.
 */

function num(valor: string | undefined, fallback: number): number {
  const parseado = parseInt(valor ?? '', 10);
  return Number.isFinite(parseado) ? parseado : fallback;
}

type ProveedorKyc = 'stub' | 'truora';

function proveedor(valor: string | undefined): ProveedorKyc {
  return valor === 'truora' ? 'truora' : 'stub';
}

export const config = {
  /** Puerto propio del ACL Worker (el que consumirá el futuro consumidor de UNDER). */
  port: num(process.env.ACL_WORKER_PORT, 5000),

  /**
   * Redis usado por la cola BullMQ `kyc-reconciliacion` (ver "Extensión de
   * diseño: Consolidador KYC" en el README de diseño). Mismo Redis que usa
   * el Consolidador KYC y consumidor-under — no se introduce un broker
   * nuevo solo para esta pieza aditiva.
   */
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  kyc: {
    /** Adaptador activo: "stub" (default, contra stub-kyc/) o "truora" (real, no probado). */
    provider: proveedor(process.env.KYC_PROVIDER),

    /** Base URL del stub-kyc local. */
    stubBaseUrl: process.env.KYC_BASE_URL || 'http://localhost:4000',

    /**
     * Base URL de referencia de la API real de Truora, tomada de la
     * documentación pública citada en el README de diseño (dev.truora.com).
     * NO verificada en vivo: no tenemos credenciales reales de Truora.
     */
    truoraBaseUrl: process.env.TRUORA_BASE_URL || 'https://api.identity-platform.truora.com',

    /** API key dummy/configurable — nunca una credencial real en este experimento. */
    apiKey: process.env.TRUORA_API_KEY || 'dummy-truora-api-key',

    /** Intervalo de polling propio del adaptador contra GET /v1/validations/:id. */
    pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 150),

    /**
     * Umbral T del ASR: tiempo máximo que el adaptador espera (creación +
     * polling) antes de lanzar error y dejar que el Circuit Breaker lo
     * cuente como fallo. VALOR DE REFERENCIA: el diseño (README, sección
     * "Refinamiento de diseño") todavía no calibra este número contra un
     * SLA real de Solventa — ver también el checklist pendiente del README
     * de diseño sobre calibrar umbrales numéricos.
     */
    timeoutMs: num(process.env.KYC_TIMEOUT_MS, 1500),
  },

  retry: {
    /** Intentos totales (1 = sin reintento) antes de que el Circuit Breaker vea un fallo. */
    attempts: num(process.env.RETRY_ATTEMPTS, 2),
    /** Demora base del backoff exponencial entre intentos (demora = base * 2^(intento-1)). */
    baseDelayMs: num(process.env.RETRY_BASE_DELAY_MS, 100),
  },

  breaker: {
    /**
     * Timeout propio de opossum sobre la acción completa (adaptador +
     * reintentos). Debe ser mayor al peor caso de retry (timeoutMs *
     * attempts + backoff acumulado) para que sea el adaptador, no opossum,
     * quien decida cuándo cortar.
     */
    timeoutMs: num(process.env.BREAKER_TIMEOUT_MS, 5000),
    /** % de fallos en la ventana móvil que abre el circuito. */
    errorThresholdPercentage: num(process.env.BREAKER_ERROR_THRESHOLD_PERCENTAGE, 50),
    /** Mínimo de llamadas en la ventana antes de que el % de error pueda abrir el circuito. */
    volumeThreshold: num(process.env.BREAKER_VOLUME_THRESHOLD, 3),
    /** Tiempo que el circuito permanece abierto antes de pasar a half-open. */
    resetTimeoutMs: num(process.env.BREAKER_RESET_TIMEOUT_MS, 5000),
    /**
     * Ventana móvil (ms) sobre la que opossum acumula fires/fallos para
     * decidir si abre el circuito. Debe ser sensiblemente mayor a
     * timeoutMs * attempts (el peor caso de una sola llamada), o los
     * fallos "expiran" de la ventana antes de alcanzar volumeThreshold —
     * comportamiento observado y corregido durante la verificación en vivo
     * de esta pieza (ver README).
     */
    rollingCountTimeoutMs: num(process.env.BREAKER_ROLLING_COUNT_TIMEOUT_MS, 30000),
    /** Número de buckets en los que se divide la ventana móvil anterior. */
    rollingCountBuckets: num(process.env.BREAKER_ROLLING_COUNT_BUCKETS, 10),
  },
};
