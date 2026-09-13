# Código — Experimento 1: Circuit Breaker/Retry en ACL Worker de KYC

Esta carpeta contiene la implementación del experimento diseñado en [`../DISENO-EXPERIMENTOS.md`](../DISENO-EXPERIMENTOS.md) (filas de la tabla del Experimento 1 y su sección "Refinamiento de diseño"). Lee ese documento completo antes de escribir código aquí — define el contrato exacto que debe imitar el stub, el ASR con el umbral T, y los criterios de éxito/fracaso que este código debe poder demostrar.

## Estructura esperada

```
experimento-1-acl-kyc/
├── stub-kyc/            # Python/FastAPI. Imita el contrato asíncrono real de Truora (crear→pollear, 429, delayed)
├── acl-worker/           # Python/FastAPI. Puertos y adaptadores: PuertoProveedorIdentidad + TruoraAdapter/StubKycAdapter
│                          # + Circuit Breaker (purgatory) + polling acotado por el umbral T
│                          # + encolado fire-and-forget a "kyc-reconciliacion" (RQ/Redis) al degradar
├── consumidor-under/     # Python/FastAPI. Stand-in mínimo de UNDER: llama al ACL Worker, mide latencia, timeout propio
│                          # + lee kyc:estado:<clienteId> en Redis antes del placeholder genérico
├── consolidador-kyc/     # Python/RQ + FastAPI. Worker: reconcilia degradados reintentando vía el ACL Worker
├── k6/                   # Escenarios de carga (JS, k6): línea base y falla inyectada
└── docker-compose.yml    # Levanta las 5 piezas + Redis con un solo `docker compose up`
```

## Estado

✅ **Completo y verificado — Python.** Las 4 piezas originales (2026-09-10, construidas primero en
Node.js/TypeScript) y la quinta pieza aditiva — Consolidador KYC (2026-09-12) — se **migraron
completas a Python el 2026-09-13** (stack: FastAPI en los 4 servicios HTTP, `purgatory` como Circuit
Breaker en el ACL Worker, RQ sobre Redis para la cola de reconciliación) y se re-verificaron en vivo
con Docker Compose y k6 contra el stack Python. Cada carpeta documenta su propia verificación:

- [`stub-kyc/README.md`](stub-kyc/README.md) — 4 modos de falla, verificado con curl (Python/FastAPI).
- [`acl-worker/README.md`](acl-worker/README.md) — hexagonal + Circuit Breaker, verificado en vivo contra el stub. Incluye un hallazgo real de la migración: `pybreaker` serializa toda ejecución concurrente vía un lock global (descartado), reemplazado por `purgatory`.
- [`consumidor-under/README.md`](consumidor-under/README.md) — rutas `con-kyc`/`sin-kyc` + lectura del estado consolidado (Python/FastAPI).
- [`consolidador-kyc/README.md`](consolidador-kyc/README.md) — worker RQ (Redis Queue) de reconciliación diferida, migrado desde BullMQ.
- [`k6/README.md`](k6/README.md) — `baseline.js` y `falla-inyectada.js` (sin cambios: mismo contrato HTTP), con los resultados de la corrida real contra el stack Python.

Los 3 criterios de éxito del experimento (ver [README de diseño](../DISENO-EXPERIMENTOS.md#experimento-1--aislamiento-de-fallas-externas-vía-circuit-breaker--retry-en-acl-workers)) se cumplieron con datos reales de k6 contra la versión Python — el resumen está en "Resultados y análisis" de `DISENO-EXPERIMENTOS.md`. La extensión del Consolidador KYC sigue funcionando igual tras la migración (verificado con Docker Compose).

## Cómo levantar todo junto

```bash
cd experimento-1-acl-kyc
docker compose up --build
```

Levanta `redis`, `stub-kyc` (4000), `acl-worker` (5050→5000 en el host, ver nota de puertos en su README), `consumidor-under` (6000) y `consolidador-kyc` (7070→7000, solo `/health`).

## Pendiente (no bloqueante)

Calibrar `KYC_TIMEOUT_MS` y los parámetros del Circuit Breaker contra un SLA numérico real del equipo (hoy son valores de referencia razonables, no cifras de producción — ver checklist del README de diseño).
