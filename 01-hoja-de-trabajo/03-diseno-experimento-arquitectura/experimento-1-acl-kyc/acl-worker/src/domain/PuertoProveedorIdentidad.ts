/**
 * Puerto de dominio del ACL Worker (arquitectura hexagonal, ver
 * 01-hoja-de-trabajo/03-diseno-experimento-arquitectura/README.md,
 * sección "Refinamiento de diseño: contrato del stub y arquitectura interna
 * del ACL Worker").
 *
 * El dominio (este archivo) y la capa de aplicación (ServicioVerificacion)
 * NUNCA conocen si detrás hay un stub, Truora, u otro proveedor futuro
 * (Onfido, MetaMap, ...) — solo conocen esta interfaz. Cambiar de proveedor
 * es agregar un adaptador nuevo, no tocar el Circuit Breaker ni el puerto.
 */

/** Cliente sobre el que se pide la verificación de identidad/KYC. */
export interface Cliente {
  clienteId: string;
}

/**
 * Resultado que el puerto le entrega SIEMPRE a la capa de aplicación, ya
 * resuelto de forma síncrona. El detalle del ciclo asíncrono real del
 * proveedor (crear -> pollear) es interno a cada adaptador y nunca se
 * propaga hacia arriba.
 *
 * - "aprobado" / "rechazado": el proveedor resolvió la validación dentro
 *   del umbral T (KYC_TIMEOUT_MS) con status success/failure.
 * - "degradado": el adaptador falló, agotó el umbral T sin resolver, o el
 *   Circuit Breaker de ServicioVerificacion decidió fail-fast porque el
 *   circuito está abierto. UNDER nunca ve un error 5xx crudo por esta vía.
 */
export type EstadoVerificacion = 'aprobado' | 'rechazado' | 'degradado';

export interface ResultadoVerificacion {
  estado: EstadoVerificacion;
  /** Nombre del proveedor que produjo el resultado (p. ej. "stub-kyc", "truora"). Ausente en resultados degradados sin intento real. */
  proveedor?: string;
  /** id de la validación en el proveedor externo, cuando llegó a crearse. */
  validationId?: string;
  /** Motivo legible del estado "degradado" (p. ej. "kyc_no_disponible"). */
  motivo?: string;
  /** Información adicional de diagnóstico (nunca expone detalles internos del polling a UNDER). */
  detalle?: Record<string, unknown>;
}

export interface PuertoProveedorIdentidad {
  verificar(cliente: Cliente): Promise<ResultadoVerificacion>;
}
