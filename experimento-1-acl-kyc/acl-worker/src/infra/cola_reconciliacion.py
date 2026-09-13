"""
Cola de reconciliación diferida del Consolidador KYC (ver "Extensión de
diseño: Consolidador KYC (reconciliación diferida)" en
../../../DISENO-EXPERIMENTOS.md). El ACL Worker es el PRODUCTOR: cada vez
que ServicioVerificacion resuelve una llamada como "degradado", encola un
job aquí para que el Consolidador KYC reintente más tarde contra el ACL
Worker (nunca contra el proveedor KYC directo).

Migrado de Node.js/BullMQ a Python/RQ (Redis Queue) — ver "Decisión sobre la
librería de cola" en el README de esta carpeta para la justificación
completa. Nota importante de RQ: el PRODUCTOR encola la función por su
*import path como string* ("jobs.reconciliar_cliente"); el código real de
esa función vive únicamente en `consolidador-kyc/src/jobs.py` — el ACL
Worker nunca la importa ni necesita conocerla más allá del nombre.

Requisito no negociable del diseño: este encolado es fire-and-forget y NUNCA
puede tumbar ni retrasar la respuesta que el ACL Worker ya le dio a UNDER.
Si Redis está caído, el fallo se loguea y se ignora — no se propaga ninguna
excepción hacia ServicioVerificacion.
"""

import logging
import time

from redis import Redis
from rq import Queue, Retry

from ..config import config

logger = logging.getLogger("acl-worker.cola-reconciliacion")

NOMBRE_COLA_RECONCILIACION = "kyc-reconciliacion"

_conexion: Redis | None = None
_cola: Queue | None = None
_fallo_inicializacion = False


def _obtener_cola() -> Queue | None:
    global _conexion, _cola, _fallo_inicializacion
    if _cola is not None:
        return _cola
    if _fallo_inicializacion:
        return None  # ya se intentó y falló; no reintentar en cada llamada

    try:
        _conexion = Redis.from_url(
            config.redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        _cola = Queue(NOMBRE_COLA_RECONCILIACION, connection=_conexion)
        return _cola
    except Exception as error:  # noqa: BLE001 - red de seguridad no bloqueante
        _fallo_inicializacion = True
        logger.error("no se pudo inicializar la cola (no bloqueante): %s", error)
        return None


def encolar_reconciliacion(cliente_id: str) -> None:
    """
    Encola `(clienteId, timestamp)` en `kyc-reconciliacion`. Se llama desde
    un hilo aparte (`asyncio.to_thread`, ver ServicioVerificacion) para no
    bloquear el event loop — es fire-and-forget puro, igual que el `.then()`
    sin `await` de la versión Node/BullMQ.

    Política de reintentos: 5 intentos totales (1 inicial + 4 reintentos),
    backoff exponencial 2s/4s/8s/16s — mismos números que la versión
    Node/BullMQ (`attempts: 5, backoff: { type: 'exponential', delay: 2000 }`).
    Si se agotan, RQ mueve el job a su `FailedJobRegistry` automáticamente
    (equivalente a la "DLQ" del diseño) — no se construye nada adicional.
    """
    try:
        cola = _obtener_cola()
        if cola is None:
            return

        cola.enqueue(
            "jobs.reconciliar_cliente",
            cliente_id,
            time.time() * 1000,
            retry=Retry(max=4, interval=[2, 4, 8, 16]),
            result_ttl=0,
        )
        logger.info("job encolado para clienteId=%s", cliente_id)
    except Exception as error:  # noqa: BLE001 - nunca debe llegar a ServicioVerificacion
        logger.error("fallo al encolar clienteId=%s (no bloqueante): %s", cliente_id, error)
