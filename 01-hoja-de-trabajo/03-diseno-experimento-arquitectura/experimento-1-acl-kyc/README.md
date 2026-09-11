# Código — Experimento 1: Circuit Breaker/Retry en ACL Worker de KYC

Esta carpeta contiene la implementación del experimento diseñado en [`../README.md`](../README.md) (filas de la tabla del Experimento 1 y su sección "Refinamiento de diseño"). Lee ese documento completo antes de escribir código aquí — define el contrato exacto que debe imitar el stub, el ASR con el umbral T, y los criterios de éxito/fracaso que este código debe poder demostrar.

## Estructura esperada

```
experimento-1-acl-kyc/
├── stub-kyc/          # Imita el contrato asíncrono real de Truora (crear→pollear, 429, delayed)
├── acl-worker/         # Puertos y adaptadores: PuertoProveedorIdentidad + TruoraAdapter/StubKycAdapter
│                        # + Circuit Breaker (Opossum) + polling acotado por el umbral T
├── consumidor-under/   # Stand-in mínimo de UNDER: llama al ACL Worker, mide latencia, timeout propio
├── k6/                 # Escenarios de carga: línea base y falla inyectada
└── docker-compose.yml
```

## Estado

✅ **Completo y verificado (2026-09-10).** Las 4 piezas están construidas, corridas en vivo (aisladas y juntas con k6) y comiteadas/pusheadas. Cada carpeta documenta su propia verificación:

- [`stub-kyc/README.md`](stub-kyc/README.md) — 4 modos de falla, verificado con curl.
- [`acl-worker/README.md`](acl-worker/README.md) — hexagonal + Circuit Breaker, verificado en vivo contra el stub (incluye un hallazgo real sobre la ventana móvil de Opossum).
- [`consumidor-under/README.md`](consumidor-under/README.md) — rutas `con-kyc`/`sin-kyc`.
- [`k6/README.md`](k6/README.md) — `baseline.js` y `falla-inyectada.js`, con los resultados de la corrida real.

Los 3 criterios de éxito del experimento (ver [README de diseño](../README.md#experimento-1--aislamiento-de-fallas-externas-vía-circuit-breaker--retry-en-acl-workers)) se cumplieron con datos reales de k6 — el resumen ya está volcado ahí, en "Resultados y análisis".

## Pendiente (no bloqueante)

Calibrar `KYC_TIMEOUT_MS` y los parámetros del Circuit Breaker contra un SLA numérico real del equipo (hoy son valores de referencia razonables, no cifras de producción — ver checklist del README de diseño).
