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
 * ============================================================================
 * ADVERTENCIA DE ALCANCE: este adaptador NO ha sido probado contra el
 * proveedor real de Truora. No tenemos credenciales reales de Truora en este
 * experimento (ver README de diseño y README de esta carpeta). Su única
 * función aquí es demostrar que el puerto PuertoProveedorIdentidad es
 * intercambiable: implementa exactamente la misma forma de contrato
 * documentada (POST /v1/validations -> 201 + validation_id; GET
 * /v1/validations/:id -> pending|success|failure; header Truora-API-Key)
 * contra la baseUrl real de Truora, en vez de contra stub-kyc/.
 *
 * Si en el futuro se activa este adaptador contra Truora de verdad, hay que
 * revalidar: nombres exactos de campos de la respuesta, códigos de error
 * específicos más allá de 429, y si la creación de una validación requiere
 * payload adicional (documento, tipo de verificación, etc.) que el contrato
 * mínimo simulado por el stub no exige.
 * ============================================================================
 */
export class TruoraAdapter implements PuertoProveedorIdentidad {
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

    for (;;) {
      const restante = tiempoRestante();
      if (restante <= 0) {
        throw new Error(
          `kyc_timeout: la validación ${validationId} no resolvió en ${this.opciones.timeoutMs}ms (truora)`,
        );
      }

      const consulta = await this.solicitar<RespuestaValidacion>(
        'GET',
        `/v1/validations/${validationId}`,
        undefined,
        restante,
      );

      if (consulta.status === 'success') {
        return { estado: 'aprobado', proveedor: 'truora', validationId };
      }
      if (consulta.status === 'failure') {
        return { estado: 'rechazado', proveedor: 'truora', validationId };
      }

      const espera = Math.min(this.opciones.pollIntervalMs, tiempoRestante());
      if (espera <= 0) {
        throw new Error(
          `kyc_timeout: la validación ${validationId} no resolvió en ${this.opciones.timeoutMs}ms (truora)`,
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
