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

🔴 Pendiente de construcción — corresponde a las semanas 6-7 del curso. Usa el agente `experiment-builder` de este repo para levantar cada pieza.

## Al terminar

Actualiza la sección "Resultados y análisis" del [README de diseño](../README.md) con los números reales obtenidos (latencia p95, timeouts en cascada observados, tiempo de recuperación del circuito) y la conclusión frente a los criterios de éxito/fracaso ya definidos ahí.
