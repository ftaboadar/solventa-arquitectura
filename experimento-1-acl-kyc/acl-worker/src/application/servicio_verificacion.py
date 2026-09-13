"""
Capa de aplicación del ACL Worker: orquesta la verificación de identidad
llamando al adaptador INYECTADO (nunca lo instancia ella misma — eso es
responsabilidad de http/server.py), envuelto en un Circuit Breaker con
retry interno, con un fallback que degrada en vez de propagar errores 5xx
crudos hacia UNDER.

Migrado de Node.js/opossum a Python. Ver "Decisión sobre la librería de
Circuit Breaker" en el README de esta carpeta para la justificación
completa — resumen: se probó primero `pybreaker`, pero un hallazgo real
durante la verificación de carga (ver README) mostró que
`CircuitBreaker.call()` de pybreaker mantiene un `threading.RLock` tomado
durante TODA la ejecución de la función protegida, serializando por
completo las verificaciones concurrentes (con 8 VUs, las llamadas se
procesaban una por una en vez de en paralelo). Se reemplazó por
`purgatory` (`SyncCircuitBreakerFactory`), cuyo `Context.__enter__`/
`__exit__` solo actualiza contadores de estado sin retener ningún lock
durante la llamada protegida — la ejecución real del adaptador queda fuera
de cualquier sección crítica.
"""

import logging
import threading
import time
from typing import Callable, Optional

from purgatory import SyncCircuitBreakerFactory
from purgatory.domain.model import OpenedState

from ..config import config
from ..domain.puerto_proveedor_identidad import Cliente, PuertoProveedorIdentidad, ResultadoVerificacion
from ..infra.cola_reconciliacion import encolar_reconciliacion

logger = logging.getLogger("acl-worker.circuit")

NOMBRE_CIRCUITO = "kyc-verificacion"


def _con_reintento(
    accion: Callable[[], ResultadoVerificacion], intentos: int, demora_base_ms: int
) -> ResultadoVerificacion:
    """
    Retry con backoff exponencial, implementado a mano — mismo criterio que
    la versión Node: ni opossum ni purgatory traen retry incorporado, y el
    reintento debe ejecutarse DENTRO de la acción que envuelve el breaker
    (nunca por fuera), para que el circuito vea UNA sola ejecución (éxito o
    fallo final) por cada llamada de UNDER, en vez de contar cada reintento
    como una llamada independiente.
    """
    ultimo_error: Optional[Exception] = None
    for intento in range(1, intentos + 1):
        try:
            return accion()
        except Exception as error:  # noqa: BLE001 - se reintenta o se relanza al agotar
            ultimo_error = error
            if intento < intentos:
                demora_ms = demora_base_ms * (2 ** (intento - 1))
                logger.info("intento %s/%s fallido, reintentando en %sms: %s", intento, intentos, demora_ms, error)
                time.sleep(demora_ms / 1000)
    assert ultimo_error is not None
    raise ultimo_error


class _EstadisticasCircuito:
    """Contadores propios para exponer `/circuit-status` con una forma
    parecida a la de opossum (`breaker.stats`) — ni pybreaker ni purgatory
    exponen ese desglose de fires/successes/failures/timeouts/rejects/
    fallbacks, así que se acumulan aquí a mano, con un lock (solo protege
    estos contadores de diagnóstico, no la llamada al proveedor)."""

    def __init__(self) -> None:
        self.fires = 0
        self.successes = 0
        self.failures = 0
        self.timeouts = 0
        self.rejects = 0
        self.fallbacks = 0
        self._lock = threading.Lock()

    def registrar_fire(self) -> None:
        with self._lock:
            self.fires += 1

    def registrar_success(self) -> None:
        with self._lock:
            self.successes += 1

    def registrar_failure(self) -> None:
        with self._lock:
            self.failures += 1

    def registrar_timeout(self) -> None:
        with self._lock:
            self.timeouts += 1

    def registrar_reject(self) -> None:
        with self._lock:
            self.rejects += 1

    def registrar_fallback(self) -> None:
        with self._lock:
            self.fallbacks += 1


class ServicioVerificacion:
    def __init__(self, adaptador: PuertoProveedorIdentidad) -> None:
        self._adaptador = adaptador
        self._stats = _EstadisticasCircuito()
        self._breaker_factory = SyncCircuitBreakerFactory(
            default_threshold=config.breaker.fail_max,
            default_ttl=config.breaker.reset_timeout_s,
        )
        self._breaker_factory.initialize()
        self._breaker_factory.add_listener(self._on_evento_circuito)
        # Crea el breaker (y su Context compartido) una sola vez al arrancar
        # — llamadas posteriores a get_breaker(NOMBRE_CIRCUITO) reutilizan el
        # mismo estado, solo envuelven un wrapper liviano nuevo cada vez.
        self._breaker_factory.get_breaker(NOMBRE_CIRCUITO)

    def _on_evento_circuito(self, circuit_name: str, event_type: str, event: object) -> None:
        # Transiciones logueadas a stdout — el criterio de éxito del
        # experimento incluye observar que el circuito cierra solo al
        # recuperarse el proveedor.
        if event_type == "state_changed":
            estado = getattr(event, "state", "?")
            if estado == "opened":
                logger.info(
                    "transición -> OPEN (fail-fast activado, no se llamará más al proveedor hasta el reset)"
                )
            elif estado == "half-opened":
                logger.info("transición -> HALF-OPEN (probando si el proveedor ya respondió)")
            elif estado == "closed":
                logger.info("transición -> CLOSED (proveedor recuperado, tráfico normal)")
        elif event_type == "failed":
            logger.info("fallo registrado (circuito %s): %s", circuit_name, event)

    def _accion(self, cliente: Cliente) -> ResultadoVerificacion:
        return _con_reintento(
            lambda: self._adaptador.verificar(cliente), config.retry.attempts, config.retry.base_delay_ms
        )

    def verificar_cliente(self, cliente: Cliente) -> ResultadoVerificacion:
        """
        Punto de entrada SÍNCRONO (ver domain/puerto_proveedor_identidad.py)
        — quien lo llama desde el endpoint async de FastAPI debe hacerlo con
        `await asyncio.to_thread(...)` para no bloquear el event loop.
        """
        self._stats.registrar_fire()
        breaker = self._breaker_factory.get_breaker(NOMBRE_CIRCUITO)
        try:
            with breaker:
                resultado = self._accion(cliente)
        except OpenedState:
            # Circuito abierto: el `with breaker:` levantó la excepción en
            # su propio __enter__, SIN llegar a ejecutar self._accion(...).
            # Equivalente al evento 'reject' de opossum.
            self._stats.registrar_reject()
            logger.info("llamada rechazada de inmediato (circuito abierto)")
            return self._fallback(cliente, None)
        except Exception as error:  # noqa: BLE001 - agotó reintentos / falló el adaptador
            self._stats.registrar_failure()
            if isinstance(error, TimeoutError):
                self._stats.registrar_timeout()
            return self._fallback(cliente, error)
        else:
            self._stats.registrar_success()
            return resultado

    def _fallback(self, cliente: Cliente, error: Optional[Exception]) -> ResultadoVerificacion:
        """
        Cuando el circuito está abierto o la acción falla (agotó
        reintentos), se responde "degradado" — nunca un error 5xx crudo
        hacia el llamador (UNDER).

        Extensión "Consolidador KYC" (ver DISENO-EXPERIMENTOS.md): además de
        responder degradado, se encola (fire-and-forget, en un hilo aparte)
        un job de reconciliación diferida. `encolar_reconciliacion` ya
        garantiza por sí misma que ningún fallo de Redis pueda propagarse
        hasta aquí.
        """
        self._stats.registrar_fallback()

        # No volver a encolar si esta llamada YA es un reintento del
        # Consolidador KYC (ver el comentario de `origen` en
        # domain/puerto_proveedor_identidad.py) — evita una cadena sin fin
        # de jobs mientras el circuito siga abierto.
        if cliente.origen != "consolidador":
            threading.Thread(target=encolar_reconciliacion, args=(cliente.cliente_id,), daemon=True).start()

        resultado = ResultadoVerificacion(estado="degradado", motivo="kyc_no_disponible")
        if error is not None:
            resultado.detalle = {"error": str(error)}
        logger.info("fallback ejecutado -> %s", resultado)
        return resultado

    def estado_circuito(self) -> dict:
        mapa_estado = {"closed": "closed", "opened": "open", "half-opened": "halfOpen"}
        breaker = self._breaker_factory.get_breaker(NOMBRE_CIRCUITO)
        estado_actual = breaker.context.state
        estado = mapa_estado.get(estado_actual, estado_actual)

        return {
            "estado": estado,
            "habilitado": True,
            "stats": {
                "fires": self._stats.fires,
                "successes": self._stats.successes,
                "failures": self._stats.failures,
                "timeouts": self._stats.timeouts,
                "rejects": self._stats.rejects,
                "fallbacks": self._stats.fallbacks,
            },
        }
