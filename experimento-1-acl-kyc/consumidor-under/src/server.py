"""
Consumidor simplificado de UNDER (Suscripción) para el Experimento 1
(Circuit Breaker/Retry en el ACL Worker de KYC) de arquitectura de Solventa.
Ver ../../DISENO-EXPERIMENTOS.md (fila 6/7 de la tabla del Experimento 1 y
sección "Refinamiento de diseño").

Este archivo es andamiaje de prueba de un solo uso: deliberadamente NO lleva
estructura de puertos/adaptadores (esa capa hexagonal es del ACL Worker, no
de este consumidor ni del stub de KYC).

Expone DOS endpoints porque el criterio de éxito (a) del experimento compara
explícitamente la latencia de solicitudes dependientes de KYC contra las que
NO dependen de KYC:

  POST /suscripcion/con-kyc  -> llama al ACL Worker con un timeout propio
                                 corto. Nunca propaga un 5xx: si el ACL
                                 Worker responde "degradado", o si el
                                 timeout propio se cumple, la suscripción
                                 queda "pendiente de verificación" sin error
                                 visible al usuario.
  POST /suscripcion/sin-kyc -> NO toca el ACL Worker en absoluto. Es el
                                 control del experimento: debe mantenerse
                                 rápido y dentro de su SLA normal aunque
                                 KYC esté caído.

Migrado de Node.js/Express a Python/FastAPI (mismas rutas, mismos códigos de
estado, mismo comportamiento).
"""

import asyncio
import json
import logging
import os
import random
import time
from typing import Optional

import httpx
import redis.asyncio as redis_async
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[consumidor-under] %(message)s")
logger = logging.getLogger("consumidor-under")

UNDER_PORT = int(os.environ.get("UNDER_PORT", "6000"))
ACL_WORKER_URL = os.environ.get("ACL_WORKER_URL", "http://localhost:5000")
# Debe ser mayor al peor caso documentado del ACL Worker en fallo (~3.1 s con
# los defaults de KYC_TIMEOUT_MS/RETRY_ATTEMPTS — ver acl-worker/README.md)
# para no cortar una llamada legítima, pero nunca esperar indefinidamente.
UNDER_HTTP_TIMEOUT_MS = int(os.environ.get("UNDER_HTTP_TIMEOUT_MS", "4000"))
# Trabajo trivial simulado del flujo sin-KYC, para no responder instantáneo.
SIN_KYC_MIN_MS = int(os.environ.get("SIN_KYC_MIN_MS", "20"))
SIN_KYC_MAX_MS = int(os.environ.get("SIN_KYC_MAX_MS", "50"))
# Redis compartido con acl-worker/ (que encola) y consolidador-kyc/ (que
# escribe kyc:estado:<clienteId>) — ver "Extensión de diseño: Consolidador
# KYC" en DISENO-EXPERIMENTOS.md.
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Cliente Redis async para la lectura síncrona-desde-la-perspectiva-de-UNDER
# de "estado consolidado" (punto 6 del contrato del Consolidador KYC).
# socket_timeout bajo es deliberado: esta lectura debe ser rápida (~1ms) y
# NUNCA puede convertirse en el nuevo cuello de botella de con-kyc si Redis
# está caído — en ese caso simplemente se ignora y se usa el placeholder
# genérico que ya existía, tal como exige el diseño.
redis_client = redis_async.from_url(
    REDIS_URL,
    socket_connect_timeout=0.3,
    socket_timeout=0.3,
    decode_responses=True,
)

# Cliente httpx ASYNC persistente y reutilizado entre requests (en vez de
# `async with httpx.AsyncClient(...)` por request) — evita reabrir una
# conexión TCP nueva hacia el ACL Worker en cada llamada de con-kyc bajo
# carga concurrente. Mismo ajuste de rendimiento aplicado en los adaptadores
# del ACL Worker (ver acl-worker/src/adapters/stub_kyc_adapter.py).
http_client = httpx.AsyncClient()


async def leer_estado_consolidado(cliente_id: str) -> Optional[dict]:
    """Lee `kyc:estado:<clienteId>` en Redis. Devuelve `None` si no existe o
    si la lectura falla (Redis caído, timeout, etc.) — nunca lanza hacia el
    llamador: el fallback siempre es el placeholder genérico
    `pendiente_verificacion` que ya existía antes del Consolidador KYC."""
    try:
        crudo = await redis_client.get(f"kyc:estado:{cliente_id}")
        if not crudo:
            return None
        return json.loads(crudo)
    except Exception as error:  # noqa: BLE001 - no bloqueante
        logger.error(
            "fallo leyendo estado consolidado de Redis para clienteId=%s (no bloqueante, se usa el placeholder genérico): %s",
            cliente_id,
            error,
        )
        return None


def random_trivial_work_ms() -> int:
    return SIN_KYC_MIN_MS + random.randint(0, max(SIN_KYC_MAX_MS - SIN_KYC_MIN_MS, 0))


app = FastAPI(title="consumidor-under")


class SuscripcionBody(BaseModel):
    clienteId: Optional[str] = None


@app.get("/health")
async def health():
    return {"ok": True, "aclWorkerUrl": ACL_WORKER_URL}


# --- Control: flujo de suscripción que SÍ depende de KYC ---
@app.post("/suscripcion/con-kyc")
async def con_kyc(body: SuscripcionBody):
    cliente_id = body.clienteId
    inicio = time.monotonic() * 1000

    try:
        respuesta = await http_client.post(
            f"{ACL_WORKER_URL}/verificaciones/kyc",
            json={"clienteId": cliente_id},
            timeout=UNDER_HTTP_TIMEOUT_MS / 1000,
        )

        duracion_ms = round(time.monotonic() * 1000 - inicio)

        # Contrato documentado del ACL Worker: siempre 200, nunca un 5xx
        # crudo. Por robustez del consumidor, igual se trata cualquier
        # respuesta no-200 como "no disponible" en vez de propagarla.
        if respuesta.status_code != 200:
            return {
                "estado": "pendiente_verificacion",
                "motivo": "kyc_respuesta_inesperada",
                "clienteId": cliente_id,
                "duracionMs": duracion_ms,
            }

        cuerpo = respuesta.json()

        if cuerpo.get("estado") == "degradado":
            # Extensión "Consolidador KYC": antes de usar el placeholder
            # genérico, se lee el estado consolidado de un intento de
            # reconciliación anterior. Lectura rápida y no bloqueante — si
            # no hay nada (o Redis falla), se cae al comportamiento previo.
            estado_consolidado = await leer_estado_consolidado(cliente_id)
            if estado_consolidado:
                timestamp_iso = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime(estado_consolidado["timestamp"] / 1000)
                )
                return {
                    "estado": "suscripcion_aprobada" if estado_consolidado["estado"] == "aprobado" else "suscripcion_rechazada",
                    "kyc": estado_consolidado["estado"],
                    "motivo": "kyc_reconciliado_por_consolidador",
                    "mensaje": f"Tu verificación de identidad se resolvió en un intento posterior (reconciliada el {timestamp_iso}).",
                    "clienteId": cliente_id,
                    "duracionMs": duracion_ms,
                }

            return {
                "estado": "pendiente_verificacion",
                "motivo": cuerpo.get("motivo", "kyc_no_disponible"),
                "mensaje": "Tu suscripción quedó registrada y está pendiente de verificación de identidad. Te notificaremos cuando se complete.",
                "clienteId": cliente_id,
                "duracionMs": duracion_ms,
            }

        # aprobado/rechazado: resultado normal del flujo de KYC, no es un
        # error del sistema — la suscripción sigue su curso con ese resultado.
        return {
            "estado": "suscripcion_aprobada" if cuerpo.get("estado") == "aprobado" else "suscripcion_rechazada",
            "kyc": cuerpo.get("estado"),
            "clienteId": cliente_id,
            "duracionMs": duracion_ms,
        }
    except Exception as error:  # noqa: BLE001
        # Cubre tanto el timeout propio como cualquier error de red hacia el
        # ACL Worker. Nunca se propaga un 5xx: la suscripción queda
        # pendiente de verificación, sin error visible al usuario final.
        duracion_ms = round(time.monotonic() * 1000 - inicio)
        motivo = "under_timeout" if isinstance(error, (httpx.TimeoutException, asyncio.TimeoutError)) else "acl_worker_no_disponible"
        return {
            "estado": "pendiente_verificacion",
            "motivo": motivo,
            "mensaje": "Tu suscripción quedó registrada y está pendiente de verificación de identidad. Te notificaremos cuando se complete.",
            "clienteId": cliente_id,
            "duracionMs": duracion_ms,
        }


# --- Control: flujo de suscripción que NO depende de KYC ---
@app.post("/suscripcion/sin-kyc")
async def sin_kyc(body: SuscripcionBody):
    cliente_id = body.clienteId
    inicio = time.monotonic() * 1000

    # Simula trabajo trivial de suscripción (validaciones locales, escritura
    # de borrador, etc.) que no depende de ningún proveedor externo.
    await asyncio.sleep(random_trivial_work_ms() / 1000)

    duracion_ms = round(time.monotonic() * 1000 - inicio)
    return {"estado": "suscripcion_creada", "clienteId": cliente_id, "duracionMs": duracion_ms}


if __name__ == "__main__":
    logger.info(
        "escuchando en puerto %s, ACL_WORKER_URL=%s, UNDER_HTTP_TIMEOUT_MS=%s",
        UNDER_PORT,
        ACL_WORKER_URL,
        UNDER_HTTP_TIMEOUT_MS,
    )
    uvicorn.run(app, host="0.0.0.0", port=UNDER_PORT)
