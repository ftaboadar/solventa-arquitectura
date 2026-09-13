"""
============================================================================
ADVERTENCIA DE ALCANCE: este adaptador NO ha sido probado contra el
proveedor real de Truora. No tenemos credenciales reales de Truora en este
experimento (ver README de diseño y README de esta carpeta). Su única
función aquí es demostrar que el puerto PuertoProveedorIdentidad es
intercambiable: implementa exactamente la misma forma de contrato
documentada (POST /v1/validations -> 201 + validation_id; GET
/v1/validations/:id -> pending|success|failure; header Truora-API-Key)
contra la baseUrl real de Truora, en vez de contra stub-kyc/.

Si en el futuro se activa este adaptador contra Truora de verdad, hay que
revalidar: nombres exactos de campos de la respuesta, códigos de error
específicos más allá de 429, y si la creación de una validación requiere
payload adicional (documento, tipo de verificación, etc.) que el contrato
mínimo simulado por el stub no exige.

Nota de migración: sync (no async) por la misma razón documentada en
StubKycAdapter.py — se usa la variante "Sync" de purgatory.
============================================================================
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


class TruoraAdapter:
    def __init__(self, opciones: OpcionesAdaptadorKyc) -> None:
        self.opciones = opciones
        # Cliente httpx persistente y reutilizado — ver el comentario
        # equivalente en StubKycAdapter.py (misma corrección de rendimiento
        # aplicada aquí por consistencia, aunque este adaptador no se ejerció
        # bajo carga real en este experimento).
        self._client = httpx.Client()

    def cerrar(self) -> None:
        self._client.close()

    def verificar(self, cliente: Cliente) -> ResultadoVerificacion:
        inicio = time.monotonic() * 1000

        def tiempo_restante() -> float:
            return self.opciones.timeout_ms - (time.monotonic() * 1000 - inicio)

        creacion = self._solicitar("POST", "/v1/validations", {"cliente_id": cliente.cliente_id}, tiempo_restante())
        validation_id = creacion["validation_id"]

        while True:
            restante = tiempo_restante()
            if restante <= 0:
                raise TimeoutError(
                    f"kyc_timeout: la validación {validation_id} no resolvió en "
                    f"{self.opciones.timeout_ms}ms (truora)"
                )

            consulta = self._solicitar("GET", f"/v1/validations/{validation_id}", None, restante)

            if consulta["status"] == "success":
                return ResultadoVerificacion(estado="aprobado", proveedor="truora", validation_id=validation_id)
            if consulta["status"] == "failure":
                return ResultadoVerificacion(estado="rechazado", proveedor="truora", validation_id=validation_id)

            espera_ms = min(self.opciones.poll_interval_ms, tiempo_restante())
            if espera_ms <= 0:
                raise TimeoutError(
                    f"kyc_timeout: la validación {validation_id} no resolvió en "
                    f"{self.opciones.timeout_ms}ms (truora)"
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
