"""
Endpoint HTTP síncrono (para quien lo llama) que consume el consumidor de
UNDER. Responde rápido siempre: aprobado/rechazado (proveedor resolvió a
tiempo) o degradado (proveedor no disponible / circuito abierto) — nunca
deja esperando indefinidamente ni propaga el detalle del polling interno.

Migrado de Node.js/Express a Python/FastAPI. `ServicioVerificacion` es
síncrona (la variante "Sync" de purgatory, la librería de Circuit Breaker
elegida, ver su docstring) — este módulo la ejecuta con `asyncio.to_thread`
para no bloquear el event loop de uvicorn mientras una verificación está en
curso (polling/retry incluidos).
"""

import asyncio
import logging
import time
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..adapters.stub_kyc_adapter import OpcionesAdaptadorKyc as OpcionesStub
from ..adapters.stub_kyc_adapter import StubKycAdapter
from ..adapters.truora_adapter import OpcionesAdaptadorKyc as OpcionesTruora
from ..adapters.truora_adapter import TruoraAdapter
from ..application.servicio_verificacion import ServicioVerificacion
from ..config import config
from ..domain.puerto_proveedor_identidad import Cliente, PuertoProveedorIdentidad

logging.basicConfig(level=logging.INFO, format="[acl-worker] %(name)s: %(message)s")
logger = logging.getLogger("acl-worker.http")


def construir_adaptador() -> PuertoProveedorIdentidad:
    opciones_comunes = {
        "api_key": config.kyc.api_key,
        "poll_interval_ms": config.kyc.poll_interval_ms,
        "timeout_ms": config.kyc.timeout_ms,
    }

    if config.kyc.provider == "truora":
        logger.info(
            "adaptador activo: TruoraAdapter (baseUrl=%s) — NO probado contra el proveedor real, "
            "solo valida que la interfaz es intercambiable",
            config.kyc.truora_base_url,
        )
        return TruoraAdapter(OpcionesTruora(base_url=config.kyc.truora_base_url, **opciones_comunes))

    logger.info("adaptador activo: StubKycAdapter (baseUrl=%s)", config.kyc.stub_base_url)
    return StubKycAdapter(OpcionesStub(base_url=config.kyc.stub_base_url, **opciones_comunes))


servicio_verificacion = ServicioVerificacion(construir_adaptador())

app = FastAPI(title="acl-worker")


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


class VerificacionBody(BaseModel):
    clienteId: Optional[str] = None
    origen: Optional[str] = None


@app.post("/verificaciones/kyc")
async def verificar_kyc(body: VerificacionBody):
    if not body.clienteId or not isinstance(body.clienteId, str):
        raise HTTPException(
            status_code=400,
            detail={"error": "bad_request", "message": "clienteId (string) es obligatorio en el body"},
        )

    # `origen: 'consolidador'` es una bandera puramente técnica (no forma
    # parte del contrato de negocio) que evita que un reintento del
    # Consolidador KYC vuelva a encolar un job — ver el comentario en
    # domain/puerto_proveedor_identidad.py. Cualquier otro valor (o ausente,
    # caso de UNDER) se trata como 'under'.
    origen = "consolidador" if body.origen == "consolidador" else "under"
    cliente = Cliente(cliente_id=body.clienteId, origen=origen)

    inicio = time.monotonic() * 1000
    try:
        resultado = await asyncio.to_thread(servicio_verificacion.verificar_cliente, cliente)
        # Se arma el body a mano (en vez de un asdict() genérico) para
        # preservar exactamente el mismo shape/nombres de campo del
        # contrato original en Node (p. ej. "validationId" en camelCase,
        # no "validation_id").
        cuerpo: dict = {"estado": resultado.estado}
        if resultado.proveedor is not None:
            cuerpo["proveedor"] = resultado.proveedor
        if resultado.validation_id is not None:
            cuerpo["validationId"] = resultado.validation_id
        if resultado.motivo is not None:
            cuerpo["motivo"] = resultado.motivo
        if resultado.detalle is not None:
            cuerpo["detalle"] = resultado.detalle
        cuerpo["duracionMs"] = round(time.monotonic() * 1000 - inicio)
        return cuerpo
    except Exception as error:  # noqa: BLE001 - red de seguridad, no debería ejecutarse
        # El fallback de ServicioVerificacion ya debería cubrir todo fallo o
        # circuito abierto, así que este catch no debería ejecutarse en
        # operación normal. Se deja para no filtrar nunca un 5xx crudo a
        # UNDER.
        logger.error("error inesperado no cubierto por el fallback del breaker: %s", error)
        return {
            "estado": "degradado",
            "motivo": "error_inesperado",
            "duracionMs": round(time.monotonic() * 1000 - inicio),
        }


@app.get("/circuit-status")
async def circuit_status():
    return servicio_verificacion.estado_circuito()


@app.get("/health")
async def health():
    return {"ok": True, "proveedor": config.kyc.provider}


if __name__ == "__main__":
    logger.info(
        "escuchando en puerto %s (proveedor=%s, KYC_TIMEOUT_MS=%s, RETRY_ATTEMPTS=%s, BREAKER_RESET_TIMEOUT_MS=%s)",
        config.port,
        config.kyc.provider,
        config.kyc.timeout_ms,
        config.retry.attempts,
        int(config.breaker.reset_timeout_s * 1000),
    )
    uvicorn.run(app, host="0.0.0.0", port=config.port)
