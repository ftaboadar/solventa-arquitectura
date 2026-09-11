import { Cliente, PuertoProveedorIdentidad, ResultadoVerificacion } from '../domain/PuertoProveedorIdentidad';

export interface OpcionesAdaptadorKyc {
  baseUrl: string;
  apiKey: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

interface RespuestaValidacion {
  validation_id: string;
  status: 'pending' | 'success' | 'failure';
}

/**
 * Adaptador contra stub-kyc/ (../stub-kyc), que imita el contrato asíncrono
 * real de Truora. Implementa el ciclo completo del proveedor DENTRO del
 * adaptador (crear -> pollear -> resolver o agotar el umbral T), tal como
 * decide el README de diseño: "el ACL Worker debe absorber ese ciclo con un
 * polling interno acotado por el umbral T ... UNDER nunca ve el detalle del
 * polling".
 *
 * Si el ciclo no resuelve dentro de `timeoutMs`, lanza un Error — nunca se
 * queda esperando indefinidamente (así se comporta el modo
 * "pending-forever"/"down" del stub) — para que ServicioVerificacion /
 * Circuit Breaker lo cuenten como un fallo.
 */
export class StubKycAdapter implements PuertoProveedorIdentidad {
  constructor(private readonly opciones: OpcionesAdaptadorKyc) {}

  async verificar(cliente: Cliente): Promise<ResultadoVerificacion> {
    const inicio = Date.now();
    const tiempoRestante = () => this.opciones.timeoutMs - (Date.now() - inicio);

    const creacion = await this.solicitar<RespuestaValidacion>(
      'POST',
      '/v1/validations',
      { cliente_id: cliente.clienteId },
      tiempoRestante(),
    );
    const validationId = creacion.validation_id;

    // Polling propio del adaptador, acotado por el umbral T (timeoutMs).
    for (;;) {
      const restante = tiempoRestante();
      if (restante <= 0) {
        throw new Error(
          `kyc_timeout: la validación ${validationId} no resolvió en ${this.opciones.timeoutMs}ms (stub-kyc)`,
        );
      }

      const consulta = await this.solicitar<RespuestaValidacion>(
        'GET',
        `/v1/validations/${validationId}`,
        undefined,
        restante,
      );

      if (consulta.status === 'success') {
        return { estado: 'aprobado', proveedor: 'stub-kyc', validationId };
      }
      if (consulta.status === 'failure') {
        return { estado: 'rechazado', proveedor: 'stub-kyc', validationId };
      }

      // "pending": esperar el intervalo de polling sin exceder el tiempo restante.
      const espera = Math.min(this.opciones.pollIntervalMs, tiempoRestante());
      if (espera <= 0) {
        throw new Error(
          `kyc_timeout: la validación ${validationId} no resolvió en ${this.opciones.timeoutMs}ms (stub-kyc)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }

  private async solicitar<T>(
    metodo: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), Math.max(timeoutMs, 0));
    try {
      const respuesta = await fetch(`${this.opciones.baseUrl}${path}`, {
        method: metodo,
        headers: {
          'Truora-API-Key': this.opciones.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controlador.signal,
      });
      if (!respuesta.ok) {
        throw new Error(`kyc_http_error: ${metodo} ${path} -> ${respuesta.status}`);
      }
      return (await respuesta.json()) as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`kyc_timeout: ${metodo} ${path} abortado tras ${timeoutMs}ms sin respuesta`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
