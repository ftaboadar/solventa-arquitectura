"""
Función de job de RQ (Redis Queue) que consume la cola `kyc-reconciliacion`.

El PRODUCTOR (`acl-worker/src/infra/cola_reconciliacion.py`) encola esta
función por su *import path como string* ("jobs.reconciliar_cliente") —
nunca la importa directamente ni conoce su código; solo el Worker de este
servicio (`worker.py`) la ejecuta cuando toma un job de la cola. Esto es
equivalente al `processor` de BullMQ en la versión Node, solo que aquí vive
en un módulo aparte porque RQ resuelve el job por nombre de función
importable, no por closure.

Por cada job, vuelve a llamar **al ACL Worker** (`POST /verificaciones/kyc`)
— NUNCA al proveedor KYC directo. El ACL Worker sigue siendo el único punto
de salida hacia proveedores externos (principio ACL ya establecido en el
Experimento 1).
"""

import json
import logging
import os
import time

import requests
from redis import Redis
from rq import get_current_job

logging.basicConfig(level=logging.INFO, format="[consolidador-kyc] %(message)s")
logger = logging.getLogger("consolidador-kyc.jobs")

ACL_WORKER_URL = os.environ.get("ACL_WORKER_URL", "http://localhost:5000")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
# TTL del estado consolidado en Redis: 1 hora, valor de referencia (ver
# diseño, punto 4 del contrato del Consolidador KYC).
KYC_ESTADO_TTL_SEGUNDOS = int(os.environ.get("KYC_ESTADO_TTL_SEGUNDOS", "3600"))

_redis = Redis.from_url(REDIS_URL)


def reconciliar_cliente(cliente_id: str, encolado_en_ms: float) -> dict:
    """
    Reintenta la verificación de un cliente vía el ACL Worker.

    - Si resuelve `aprobado`/`rechazado`: escribe `kyc:estado:<clienteId>`
      en Redis (con TTL) y termina con éxito — RQ no volverá a reintentar
      este job.
    - Si sigue `degradado`: lanza una excepción para que RQ programe el
      siguiente reintento según la política de backoff configurada por el
      PRODUCTOR (ver `acl-worker/src/infra/cola_reconciliacion.py`:
      `Retry(max=4, interval=[2, 4, 8, 16])`, es decir 5 intentos totales).
      Si se agotan, RQ mueve el job a su `FailedJobRegistry` (la "DLQ" del
      diagrama) automáticamente — no se construye nada adicional para eso.
    """
    job = get_current_job()
    intento_actual = (job.number_of_retries or 0) + 1 if job else 1
    logger.info(
        "procesando job %s (intento %s) para clienteId=%s",
        job.id if job else "?",
        intento_actual,
        cliente_id,
    )

    try:
        respuesta = requests.post(
            f"{ACL_WORKER_URL}/verificaciones/kyc",
            json={"clienteId": cliente_id, "origen": "consolidador"},
            timeout=10,
        )
    except requests.RequestException as error:
        raise RuntimeError(f"acl_worker_no_disponible: {error}") from error

    if respuesta.status_code != 200:
        raise RuntimeError(f"acl_worker_respuesta_inesperada: HTTP {respuesta.status_code}")

    resultado = respuesta.json()
    estado = resultado.get("estado")

    if estado in ("aprobado", "rechazado"):
        clave = f"kyc:estado:{cliente_id}"
        valor = json.dumps({"estado": estado, "timestamp": int(time.time() * 1000)})
        _redis.set(clave, valor, ex=KYC_ESTADO_TTL_SEGUNDOS)
        logger.info(
            'reconciliado clienteId=%s -> %s (escrito en "%s", TTL %ss)',
            cliente_id,
            estado,
            clave,
            KYC_ESTADO_TTL_SEGUNDOS,
        )
        return {"reconciliado": True, "estado": estado}

    # Sigue "degradado": el proveedor (o el circuito del ACL Worker) todavía
    # no se recupera.
    if job is not None:
        retries_left = job.retries_left
        agotado = retries_left is None or retries_left <= 0
        logger.info(
            "clienteId=%s sigue degradado (retries_left=%s)%s",
            cliente_id,
            retries_left,
            " -> intentos agotados, el job queda en el failed job registry de RQ (DLQ)"
            if agotado
            else " -> RQ programará el siguiente reintento con backoff exponencial",
        )
    raise RuntimeError(f"kyc_aun_degradado: clienteId={cliente_id} sigue degradado tras reintentar vía ACL Worker")
