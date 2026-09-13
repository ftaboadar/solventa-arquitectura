import CircuitBreaker from 'opossum';
import { Cliente, PuertoProveedorIdentidad, ResultadoVerificacion } from '../domain/PuertoProveedorIdentidad';
import { config } from '../config';
import { encolarReconciliacion } from '../infra/ColaReconciliacion';

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry con backoff exponencial, implementado a mano.
 *
 * Decisión documentada en el README de esta carpeta: opossum NO trae retry
 * incorporado (solo Circuit Breaker + timeout + fallback). Se evaluó sumar
 * `p-retry`, pero se optó por esta implementación propia (~15 líneas) para
 * no agregar una dependencia extra a un comportamiento simple, y porque los
 * reintentos deben ejecutarse DENTRO de la acción que envuelve el breaker
 * (no por fuera) — así el circuito ve UNA sola ejecución (éxito o fallo
 * final) por cada llamada de UNDER, en vez de contar cada reintento como una
 * llamada independiente y distorsionar sus métricas de tasa de error.
 */
async function conReintento<T>(accion: () => Promise<T>, intentos: number, demoraBaseMs: number): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await accion();
    } catch (error) {
      ultimoError = error;
      if (intento < intentos) {
        const demora = demoraBaseMs * 2 ** (intento - 1);
        console.log(
          `[acl-worker] intento ${intento}/${intentos} fallido, reintentando en ${demora}ms: ${(error as Error).message}`,
        );
        await esperar(demora);
      }
    }
  }
  throw ultimoError;
}

export type EstadoCircuito = 'closed' | 'open' | 'halfOpen';

export interface EstadoCircuitoRespuesta {
  estado: EstadoCircuito;
  habilitado: boolean;
  stats: {
    fires: number;
    successes: number;
    failures: number;
    timeouts: number;
    rejects: number;
    fallbacks: number;
  };
}

/**
 * Capa de aplicación del ACL Worker: orquesta la verificación de identidad
 * llamando al adaptador INYECTADO (nunca lo instancia ella misma — eso es
 * responsabilidad de http/server.ts), envuelto en un Circuit Breaker
 * (opossum) con retry interno y un fallback que degrada en vez de propagar
 * errores 5xx crudos hacia UNDER.
 */
export class ServicioVerificacion {
  private readonly breaker: CircuitBreaker<[Cliente], ResultadoVerificacion>;

  constructor(private readonly adaptador: PuertoProveedorIdentidad) {
    const accion = (cliente: Cliente) =>
      conReintento(() => this.adaptador.verificar(cliente), config.retry.attempts, config.retry.baseDelayMs);

    this.breaker = new CircuitBreaker(accion, {
      name: 'kyc-verificacion',
      timeout: config.breaker.timeoutMs,
      errorThresholdPercentage: config.breaker.errorThresholdPercentage,
      volumeThreshold: config.breaker.volumeThreshold,
      resetTimeout: config.breaker.resetTimeoutMs,
      rollingCountTimeout: config.breaker.rollingCountTimeoutMs,
      rollingCountBuckets: config.breaker.rollingCountBuckets,
    });

    // Fallback: cuando el circuito está abierto o la acción falla (agotó
    // reintentos), se responde "degradado" — nunca un error 5xx crudo hacia
    // el llamador (UNDER).
    //
    // Extensión "Consolidador KYC" (ver DISENO-EXPERIMENTOS.md): además de
    // responder degradado, se encola (fire-and-forget, SIN await) un job de
    // reconciliación diferida. `encolarReconciliacion` ya garantiza por sí
    // misma que ningún fallo de Redis pueda propagarse hasta aquí — este
    // fallback nunca deja de devolver su resultado por culpa de la cola.
    this.breaker.fallback((cliente: Cliente, error?: Error): ResultadoVerificacion => {
      // No volver a encolar si esta llamada YA es un reintento del
      // Consolidador KYC (ver el comentario de `origen` en
      // PuertoProveedorIdentidad.ts) — evita una cadena sin fin de jobs
      // mientras el circuito siga abierto.
      if (cliente.origen !== 'consolidador') {
        encolarReconciliacion(cliente.clienteId);
      }
      return {
        estado: 'degradado',
        motivo: 'kyc_no_disponible',
        ...(error ? { detalle: { error: error.message } } : {}),
      };
    });

    // Transiciones del circuito expuestas a stdout — el criterio de éxito
    // del experimento incluye observar que cierra solo al recuperarse el
    // proveedor.
    this.breaker.on('open', () =>
      console.log('[acl-worker][circuit] transición -> OPEN (fail-fast activado, no se llamará más al proveedor hasta el reset)'),
    );
    this.breaker.on('halfOpen', () =>
      console.log('[acl-worker][circuit] transición -> HALF-OPEN (probando si el proveedor ya respondió)'),
    );
    this.breaker.on('close', () =>
      console.log('[acl-worker][circuit] transición -> CLOSED (proveedor recuperado, tráfico normal)'),
    );
    this.breaker.on('timeout', () => console.log('[acl-worker][circuit] la acción excedió el timeout del breaker'));
    this.breaker.on('reject', () => console.log('[acl-worker][circuit] llamada rechazada de inmediato (circuito abierto)'));
    this.breaker.on('failure', (err: Error) => console.log(`[acl-worker][circuit] fallo registrado: ${err.message}`));
    this.breaker.on('fallback', (resultado) => console.log('[acl-worker][circuit] fallback ejecutado ->', resultado));
  }

  async verificarCliente(cliente: Cliente): Promise<ResultadoVerificacion> {
    return this.breaker.fire(cliente);
  }

  estadoCircuito(): EstadoCircuitoRespuesta {
    let estado: EstadoCircuito = 'closed';
    if (this.breaker.opened) estado = 'open';
    else if (this.breaker.halfOpen) estado = 'halfOpen';

    return {
      estado,
      habilitado: this.breaker.enabled,
      stats: {
        fires: this.breaker.stats.fires,
        successes: this.breaker.stats.successes,
        failures: this.breaker.stats.failures,
        timeouts: this.breaker.stats.timeouts,
        rejects: this.breaker.stats.rejects,
        fallbacks: this.breaker.stats.fallbacks,
      },
    };
  }
}
