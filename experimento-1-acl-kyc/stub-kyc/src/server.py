"""
Stub de KYC — imita el contrato ASÍNCRONO real de Truora (dev.truora.com)
para el Experimento 1 de arquitectura de Solventa (ver
../../DISENO-EXPERIMENTOS.md, sección "Refinamiento de diseño").

Este archivo es andamiaje de prueba de un solo uso: deliberadamente NO lleva
estructura de puertos/adaptadores (esa capa hexagonal es del ACL Worker, no
de este stub).

Contrato imitado:
    POST /v1/validations       -> 201 + { validation_id, status: "pending" }
    GET  /v1/validations/:id   -> { validation_id, status: "pending"|"success"|"failure" }
    Header obligatorio: Truora-API-Key (401 si falta o está vacío)

Modos de falla, cambiables en caliente sin reiniciar el proceso:
    POST /control/mode { "mode": "healthy" | "pending-forever" | "error-429" | "down" }
    GET  /control/mode -> { mode }

Migrado de Node.js/Express a Python/FastAPI (ver README de esta carpeta y
DISENO-EXPERIMENTOS.md para la fecha y el motivo de la migración). El
contrato HTTP no cambia: mismas rutas, mismos códigos de estado, mismo
comportamiento de los 4 modos.
"""

import asyncio
import os
import random
import time
import uuid
from typing import Dict, Optional

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

PORT = int(os.environ.get("PORT", "4000"))
SIM_LATENCY_MIN_MS = int(os.environ.get("SIM_LATENCY_MIN_MS", "200"))
SIM_LATENCY_MAX_MS = int(os.environ.get("SIM_LATENCY_MAX_MS", "500"))

VALID_MODES = {"healthy", "pending-forever", "error-429", "down"}
TRUORA_429_MESSAGE = (
    "There are too many high priority background checks being processed. "
    "Please try again later."
)

# --- Estado en memoria (suficiente para un stub de experimento) ---
current_mode = "healthy"
validations: Dict[str, dict] = {}


def random_latency_ms() -> int:
    return SIM_LATENCY_MIN_MS + random.randint(0, max(SIM_LATENCY_MAX_MS - SIM_LATENCY_MIN_MS, 0))


app = FastAPI(title="stub-kyc")


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    # FastAPI envuelve por defecto el `detail` en {"detail": ...}. Se
    # sobrescribe para devolver el body tal cual lo espera el contrato
    # (mismo shape que el stub original en Node/Express).
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


class ModeBody(BaseModel):
    mode: Optional[str] = None


# --- Endpoints de control (no forman parte del contrato de Truora) ---


@app.get("/control/mode")
async def get_mode():
    return {"mode": current_mode}


@app.post("/control/mode")
async def set_mode(body: ModeBody):
    global current_mode
    if body.mode not in VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_mode",
                "message": f"mode debe ser uno de: {', '.join(sorted(VALID_MODES))}",
            },
        )
    current_mode = body.mode
    return {"mode": current_mode}


@app.get("/health")
async def health():
    return {"ok": True, "mode": current_mode}


async def _guardas_validations(truora_api_key: Optional[str]) -> None:
    """Guardas compartidas por POST /v1/validations y GET /v1/validations/:id,
    evaluadas en este orden (igual que los `app.use` encadenados del
    original en Express):
      1) modo "down": cuelga indefinidamente, no responde nada en absoluto.
      2) autenticación: header Truora-API-Key obligatorio.
      3) modo "error-429": rate limit del proveedor.
    """
    if current_mode == "down":
        # Cuelga la corrutina de esta request para siempre (nunca se llama
        # a `.set()`), sin bloquear el event loop ni otras requests — el
        # equivalente async de "no llamar nunca a res.send()/res.end()" en
        # el servidor Express original. El cliente (con timeout corto, como
        # debe tener el ACL Worker) lo notará al expirar su propio timeout.
        await asyncio.Event().wait()

    if not truora_api_key or truora_api_key.strip() == "":
        raise HTTPException(
            status_code=401,
            detail={
                "error": "unauthorized",
                "message": "Falta el header Truora-API-Key o está vacío.",
            },
        )

    if current_mode == "error-429":
        raise HTTPException(
            status_code=429,
            detail={"error": "too_many_requests", "message": TRUORA_429_MESSAGE},
        )


@app.post("/v1/validations", status_code=201)
async def crear_validacion(
    truora_api_key: Optional[str] = Header(default=None, alias="Truora-API-Key"),
):
    await _guardas_validations(truora_api_key)

    validation_id = str(uuid.uuid4())
    now_ms = time.time() * 1000
    validations[validation_id] = {
        "validation_id": validation_id,
        "status": "pending",
        "created_at": now_ms,
        "resolve_at": now_ms + random_latency_ms(),
    }
    return {"validation_id": validation_id, "status": "pending"}


@app.get("/v1/validations/{validation_id}")
async def consultar_validacion(
    validation_id: str,
    truora_api_key: Optional[str] = Header(default=None, alias="Truora-API-Key"),
):
    await _guardas_validations(truora_api_key)

    record = validations.get(validation_id)
    if not record:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": f"No existe una validación con id {validation_id}",
            },
        )

    # El modo se evalúa en caliente en cada consulta, no se congela al crear
    # la validación: así un cambio de modo vía /control/mode afecta de
    # inmediato a validaciones ya creadas.
    if current_mode == "pending-forever":
        return {"validation_id": record["validation_id"], "status": "pending"}

    if record["status"] == "pending" and time.time() * 1000 >= record["resolve_at"]:
        record["status"] = "success"

    return {"validation_id": record["validation_id"], "status": record["status"]}


if __name__ == "__main__":
    print(f"[stub-kyc] escuchando en puerto {PORT}, modo inicial: {current_mode}")
    # Sin timeouts de request adicionales: a diferencia de Node 18+ (que
    # trae un requestTimeout por defecto de 5 min y había que desactivarlo
    # explícitamente), uvicorn/Starlette no imponen un timeout global de
    # request, así que el modo "down" cuelga de verdad sin configuración
    # adicional.
    uvicorn.run(app, host="0.0.0.0", port=PORT, timeout_keep_alive=75)
