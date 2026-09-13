"""
Variables de entorno centralizadas del ACL Worker. Ver README.md de esta
carpeta para la tabla completa con defaults y su justificación.
"""

import os
from dataclasses import dataclass, field


def _num(valor: str | None, fallback: int) -> int:
    try:
        return int(valor) if valor is not None else fallback
    except (TypeError, ValueError):
        return fallback


def _proveedor(valor: str | None) -> str:
    return "truora" if valor == "truora" else "stub"


@dataclass(frozen=True)
class KycConfig:
    # Adaptador activo: "stub" (default, contra stub-kyc/) o "truora" (real, no probado).
    provider: str = field(default_factory=lambda: _proveedor(os.environ.get("KYC_PROVIDER")))
    # Base URL del stub-kyc local.
    stub_base_url: str = field(default_factory=lambda: os.environ.get("KYC_BASE_URL", "http://localhost:4000"))
    # Base URL de referencia de la API real de Truora (documentación pública,
    # dev.truora.com). NO verificada en vivo: no hay credenciales reales.
    truora_base_url: str = field(
        default_factory=lambda: os.environ.get("TRUORA_BASE_URL", "https://api.identity-platform.truora.com")
    )
    # API key dummy/configurable — nunca una credencial real en este experimento.
    api_key: str = field(default_factory=lambda: os.environ.get("TRUORA_API_KEY", "dummy-truora-api-key"))
    # Intervalo de polling propio del adaptador contra GET /v1/validations/:id.
    poll_interval_ms: int = field(default_factory=lambda: _num(os.environ.get("POLL_INTERVAL_MS"), 150))
    # Umbral T del ASR: tiempo máximo (creación + polling) antes de que el
    # adaptador lance error y el Circuit Breaker lo cuente como fallo.
    # VALOR DE REFERENCIA, no calibrado contra un SLA real de Solventa.
    timeout_ms: int = field(default_factory=lambda: _num(os.environ.get("KYC_TIMEOUT_MS"), 1500))


@dataclass(frozen=True)
class RetryConfig:
    # Intentos totales (1 = sin reintento) antes de que el Circuit Breaker vea un fallo.
    attempts: int = field(default_factory=lambda: _num(os.environ.get("RETRY_ATTEMPTS"), 2))
    # Demora base del backoff exponencial entre intentos (demora = base * 2^(intento-1)).
    base_delay_ms: int = field(default_factory=lambda: _num(os.environ.get("RETRY_BASE_DELAY_MS"), 100))


@dataclass(frozen=True)
class BreakerConfig:
    """
    Parámetros del Circuit Breaker. Migrado de opossum (Node, ventana móvil
    con % de error) a purgatory (Python, conteo de fallos CONSECUTIVOS) —
    ver "Decisión sobre la librería de Circuit Breaker" en el README de esta
    carpeta para la justificación completa de por qué cambia el modelo y qué
    variables de entorno de opossum ya no aplican (incluye el hallazgo real
    de por qué se descartó pybreaker, la primera opción evaluada).
    """

    # Fallos consecutivos que abren el circuito (= `threshold` de purgatory).
    # Sustituye a la combinación opossum de volumeThreshold +
    # errorThresholdPercentage + rollingCount* (purgatory no tiene ventana
    # móvil ni % de error, solo cuenta consecutivos).
    fail_max: int = field(default_factory=lambda: _num(os.environ.get("BREAKER_VOLUME_THRESHOLD"), 3))
    # Tiempo (segundos) que el circuito permanece abierto antes de pasar a
    # half-open (= `ttl` de purgatory).
    reset_timeout_s: float = field(
        default_factory=lambda: _num(os.environ.get("BREAKER_RESET_TIMEOUT_MS"), 5000) / 1000
    )


@dataclass(frozen=True)
class Config:
    # Puerto propio del ACL Worker (el que consume el consumidor de UNDER).
    port: int = field(default_factory=lambda: _num(os.environ.get("ACL_WORKER_PORT"), 5000))
    # Redis usado por la cola RQ `kyc-reconciliacion` (ver "Extensión de
    # diseño: Consolidador KYC" en DISENO-EXPERIMENTOS.md). Mismo Redis que
    # usan el Consolidador KYC y consumidor-under.
    redis_url: str = field(default_factory=lambda: os.environ.get("REDIS_URL", "redis://localhost:6379"))
    kyc: KycConfig = field(default_factory=KycConfig)
    retry: RetryConfig = field(default_factory=RetryConfig)
    breaker: BreakerConfig = field(default_factory=BreakerConfig)


config = Config()
