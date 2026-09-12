import express from 'express';
import { config } from '../config';
import { PuertoProveedorIdentidad } from '../domain/PuertoProveedorIdentidad';
import { StubKycAdapter } from '../adapters/StubKycAdapter';
import { TruoraAdapter } from '../adapters/TruoraAdapter';
import { ServicioVerificacion } from '../application/ServicioVerificacion';

function construirAdaptador(): PuertoProveedorIdentidad {
  const opcionesComunes = {
    apiKey: config.kyc.apiKey,
    pollIntervalMs: config.kyc.pollIntervalMs,
    timeoutMs: config.kyc.timeoutMs,
  };

  if (config.kyc.provider === 'truora') {
    console.log(
      `[acl-worker] adaptador activo: TruoraAdapter (baseUrl=${config.kyc.truoraBaseUrl}) — NO probado contra el proveedor real, solo valida que la interfaz es intercambiable`,
    );
    return new TruoraAdapter({ ...opcionesComunes, baseUrl: config.kyc.truoraBaseUrl });
  }

  console.log(`[acl-worker] adaptador activo: StubKycAdapter (baseUrl=${config.kyc.stubBaseUrl})`);
  return new StubKycAdapter({ ...opcionesComunes, baseUrl: config.kyc.stubBaseUrl });
}

const servicioVerificacion = new ServicioVerificacion(construirAdaptador());

const app = express();
app.use(express.json());

/**
 * Endpoint síncrono que consumirá el futuro consumidor de UNDER. Responde
 * rápido siempre: aprobado/rechazado (proveedor resolvió a tiempo) o
 * degradado (proveedor no disponible / circuito abierto) — nunca deja
 * esperando indefinidamente ni propaga el detalle del polling interno.
 */
app.post('/verificaciones/kyc', async (req, res) => {
  const { clienteId } = req.body ?? {};
  if (!clienteId || typeof clienteId !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'clienteId (string) es obligatorio en el body' });
  }

  const inicio = Date.now();
  try {
    const resultado = await servicioVerificacion.verificarCliente({ clienteId });
    return res.status(200).json({ ...resultado, duracionMs: Date.now() - inicio });
  } catch (error) {
    // Red de seguridad: el fallback de opossum ya debería cubrir todo fallo
    // o circuito abierto, así que este catch no debería ejecutarse en
    // operación normal. Se deja para no filtrar nunca un 5xx crudo a UNDER.
    console.error('[acl-worker] error inesperado no cubierto por el fallback del breaker', error);
    return res.status(200).json({
      estado: 'degradado',
      motivo: 'error_inesperado',
      duracionMs: Date.now() - inicio,
    });
  }
});

/** Solo lectura: expone el estado actual del circuito (opossum) para verificarlo en pruebas. */
app.get('/circuit-status', (_req, res) => {
  res.status(200).json(servicioVerificacion.estadoCircuito());
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, proveedor: config.kyc.provider });
});

const server = app.listen(config.port, () => {
  console.log(
    `[acl-worker] escuchando en puerto ${config.port} (proveedor=${config.kyc.provider}, KYC_TIMEOUT_MS=${config.kyc.timeoutMs}, RETRY_ATTEMPTS=${config.retry.attempts}, BREAKER_RESET_TIMEOUT_MS=${config.breaker.resetTimeoutMs})`,
  );
});

export default server;
