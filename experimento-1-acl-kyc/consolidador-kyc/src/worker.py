"""
Consolidador KYC (reconciliación diferida) — ver "Extensión de diseño:
Consolidador KYC (reconciliación diferida)" en ../../DISENO-EXPERIMENTOS.md.

Es un WORKER de RQ (Redis Queue), no una API: consume la cola
`kyc-reconciliacion` que el ACL Worker encola (fire-and-forget) cada vez que
degrada una verificación. El código que se ejecuta por cada job vive en
`jobs.py` (`reconciliar_cliente`) — este archivo solo arranca el Worker y un
health-check HTTP mínimo.

Deliberadamente sin estructura de puertos/adaptadores: es andamiaje de
reconciliación, no el ACL boundary (esa capa hexagonal es exclusiva de
`acl-worker/`).

Migrado de Node.js/BullMQ a Python/RQ — ver "Decisión sobre la librería de
cola" en el README de esta carpeta para la justificación completa. El
health-check usa FastAPI (uvicorn) por consistencia de framework HTTP con
las otras 3 piezas del experimento (stub-kyc, acl-worker, consumidor-under)
— corre en un hilo aparte porque el hilo principal del proceso está ocupado
con el loop bloqueante de `Worker.work()` de RQ.
"""

import logging
import os
import threading

import uvicorn
from fastapi import FastAPI
from redis import Redis
from rq import Queue, Worker

logging.basicConfig(level=logging.INFO, format="[consolidador-kyc] %(message)s")
logger = logging.getLogger("consolidador-kyc")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
ACL_WORKER_URL = os.environ.get("ACL_WORKER_URL", "http://localhost:5000")
CONSOLIDADOR_PORT = int(os.environ.get("CONSOLIDADOR_PORT", "7000"))
NOMBRE_COLA = "kyc-reconciliacion"

# Health check HTTP mínimo — no esencial para el experimento (el
# Consolidador es un worker de cola, no una API), pero útil para el
# healthcheck de docker-compose y para confirmar que el proceso vive.
app = FastAPI(title="consolidador-kyc")


@app.get("/health")
async def health():
    return {"ok": True, "cola": NOMBRE_COLA, "aclWorkerUrl": ACL_WORKER_URL}


def _iniciar_health_server() -> None:
    logger.info("health check en puerto %s", CONSOLIDADOR_PORT)
    uvicorn.run(app, host="0.0.0.0", port=CONSOLIDADOR_PORT, log_level="warning")


def main() -> None:
    conexion = Redis.from_url(REDIS_URL)
    cola = Queue(NOMBRE_COLA, connection=conexion)

    threading.Thread(target=_iniciar_health_server, daemon=True).start()

    logger.info(
        'escuchando la cola "%s" (REDIS_URL=%s, ACL_WORKER_URL=%s)', NOMBRE_COLA, REDIS_URL, ACL_WORKER_URL
    )

    worker = Worker([cola], connection=conexion)
    # with_scheduler=True: habilita el hilo interno de RQ que mueve los jobs
    # con retry(interval=...) desde el registro "scheduled" de vuelta a la
    # cola cuando se cumple su demora — sin esto, los reintentos con
    # backoff configurados por el productor (ver
    # acl-worker/src/infra/cola_reconciliacion.py) nunca se disparan.
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
