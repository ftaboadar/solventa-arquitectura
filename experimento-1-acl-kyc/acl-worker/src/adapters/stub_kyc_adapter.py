"""
Adaptador contra stub-kyc/ (../../stub-kyc), que imita el contrato asíncrono
real de Truora. Implementa el ciclo completo del proveedor DENTRO del
adaptador (crear -> pollear -> resolver o agotar el umbral T), tal como
decide el README de diseño: "el ACL Worker debe absorber ese ciclo con un
polling interno acotado por el umbral T ... UNDER nunca ve el detalle del
polling".

Si el ciclo no resuelve dentro de `timeout_ms`, lanza una excepción — nunca
se queda esperando indefinidamente (así se comporta el modo
"pending-forever"/"down" del stub) — para que ServicioVerificacion / Circuit
Breaker lo cuenten como un fallo.

Nota de migración: este adaptador es SÍNCRONO (httpx.Client + time.sleep en
vez de httpx.AsyncClient + asyncio.sleep) a propósito — ver "Decisión sobre
la librería de Circuit Breaker" en el README de esta carpeta: purgatory (la
librería elegida) expone una variante "Sync", así que ServicioVerificacion
ejecuta todo el adaptador dentro de un hilo (`asyncio.to_thread`) desde el
endpoint async de FastAPI, en vez de mezclar código async con la variante
síncrona del breaker.
"""

import time
from dataclasses import dataclass

import httpx

from ..domain.puerto_proveedor_identidad import Cliente, ResultadoVerificacion


@dataclass
class OpcionesAdaptadorKyc:
    base_url: str
    api_key: str
    poll_interval_ms: int
    timeout_ms: int


class StubKycAdapter:
    def __init__(self, opciones: OpcionesAdaptadorKyc) -> None:
        self.opciones = opciones
        # Cliente httpx PERSISTENTE y reutilizado entre llamadas (en vez de
        # `with httpx.Client(...)` por request) — httpx.Client es seguro
        # para uso concurrente entre hilos y mantiene un pool de conexiones
        # keep-alive. Crear un cliente nuevo por cada POST/GET (conexión TCP
        # + resolución DNS desde cero cada vez) fue la causa real de una
        # latencia p95 anómala (~2.9s en vez de ~600ms) observada en la
        # verificación de carga con k6 tras la migración a Python — bajo
        # concurrencia (8 VUs), decenas de clientes efímeros compitiendo por
        # DNS/TLS/GIL en simultáneo dominaban la latencia total.
        self._client = httpx.Client()

    def cerrar(self) -> None:
        self._client.close()

    def verificar(self, cliente: Cliente) -> ResultadoVerificacion:
        inicio = time.monotonic() * 1000

        def tiempo_restante() -> float:
            return self.opciones.timeout_ms - (time.monotonic() * 1000 - inicio)

        creacion = self._solicitar("POST", "/v1/validations", {"cliente_id": cliente.cliente_id}, tiempo_restante())
        validation_id = creacion["validation_id"]

        # Polling propio del adaptador, acotado por el umbral T (timeout_ms).
        while True:
            restante = tiempo_restante()
            if restante <= 0:
                raise TimeoutError(
                    f"kyc_timeout: la validación {validation_id} no resolvió en "
                    f"{self.opciones.timeout_ms}ms (stub-kyc)"
                )

            consulta = self._solicitar("GET", f"/v1/validations/{validation_id}", None, restante)

            if consulta["status"] == "success":
                return ResultadoVerificacion(estado="aprobado", proveedor="stub-kyc", validation_id=validation_id)
            if consulta["status"] == "failure":
                return ResultadoVerificacion(estado="rechazado", proveedor="stub-kyc", validation_id=validation_id)

            # "pending": esperar el intervalo de polling sin exceder el tiempo restante.
            espera_ms = min(self.opciones.poll_interval_ms, tiempo_restante())
            if espera_ms <= 0:
                raise TimeoutError(
                    f"kyc_timeout: la validación {validation_id} no resolvió en "
                    f"{self.opciones.timeout_ms}ms (stub-kyc)"
                )
            time.sleep(espera_ms / 1000)

    def _solicitar(self, metodo: str, path: str, body: dict | None, timeout_ms: float) -> dict:
        timeout_s = max(timeout_ms, 0) / 1000
        headers = {"Truora-API-Key": self.opciones.api_key}
        if body is not None:
            headers["Content-Type"] = "application/json"

        try:
            respuesta = self._client.request(
                metodo, f"{self.opciones.base_url}{path}", headers=headers, json=body, timeout=timeout_s
            )
        except httpx.TimeoutException as error:
            raise TimeoutError(f"kyc_timeout: {metodo} {path} abortado tras {timeout_ms:.0f}ms sin respuesta") from error

        if respuesta.status_code >= 400:
            raise RuntimeError(f"kyc_http_error: {metodo} {path} -> {respuesta.status_code}")

        return respuesta.json()
