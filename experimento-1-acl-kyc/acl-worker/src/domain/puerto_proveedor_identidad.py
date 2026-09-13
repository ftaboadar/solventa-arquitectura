"""
Puerto de dominio del ACL Worker (arquitectura hexagonal, ver
../../../DISENO-EXPERIMENTOS.md, sección "Refinamiento de diseño: contrato
del stub y arquitectura interna del ACL Worker").

El dominio (este archivo) y la capa de aplicación (ServicioVerificacion)
NUNCA conocen si detrás hay un stub, Truora, u otro proveedor futuro
(Onfido, MetaMap, ...) — solo conocen esta interfaz. Cambiar de proveedor es
agregar un adaptador nuevo, no tocar el Circuit Breaker ni el puerto.
"""

from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Protocol

# Quién origina la llamada a /verificaciones/kyc: 'under' (default, caller
# normal) o 'consolidador' (el Consolidador KYC reintentando un job de la
# cola `kyc-reconciliacion`). NO forma parte del contrato de negocio — es
# una bandera puramente técnica para que ServicioVerificacion nunca vuelva a
# encolar un job de reconciliación por una llamada que YA es, en sí misma,
# un reintento de reconciliación. Sin esta bandera, cada reintento del
# Consolidador que sigue degradado encolaría un job nuevo (además del
# reintento que el propio worker de cola ya programa sobre el job
# original), generando una cadena sin fin de jobs mientras el circuito esté
# abierto.
Origen = Literal["under", "consolidador"]

EstadoVerificacion = Literal["aprobado", "rechazado", "degradado"]


@dataclass
class Cliente:
    cliente_id: str
    origen: Origen = "under"


@dataclass
class ResultadoVerificacion:
    """
    Resultado que el puerto le entrega SIEMPRE a la capa de aplicación, ya
    resuelto de forma síncrona. El detalle del ciclo asíncrono real del
    proveedor (crear -> pollear) es interno a cada adaptador y nunca se
    propaga hacia arriba.

    - "aprobado" / "rechazado": el proveedor resolvió la validación dentro
      del umbral T (KYC_TIMEOUT_MS) con status success/failure.
    - "degradado": el adaptador falló, agotó el umbral T sin resolver, o el
      Circuit Breaker de ServicioVerificacion decidió fail-fast porque el
      circuito está abierto. UNDER nunca ve un error 5xx crudo por esta vía.
    """

    estado: EstadoVerificacion
    proveedor: Optional[str] = None
    validation_id: Optional[str] = None
    motivo: Optional[str] = None
    detalle: Optional[dict[str, Any]] = field(default=None)


class PuertoProveedorIdentidad(Protocol):
    """
    Puerto SÍNCRONO (a diferencia del original en TypeScript, que era
    `Promise<ResultadoVerificacion>`) — ver "Decisión sobre la librería de
    Circuit Breaker" en el README de esta carpeta: tanto pybreaker (probado
    primero) como purgatory (la librería finalmente elegida) exponen una API
    síncrona en su variante "Sync", así que todo el camino adaptador ->
    ServicioVerificacion es síncrono, y es la capa HTTP (FastAPI, async)
    quien lo ejecuta en un hilo aparte con `asyncio.to_thread` para no
    bloquear el event loop.
    """

    def verificar(self, cliente: Cliente) -> ResultadoVerificacion:
        ...
