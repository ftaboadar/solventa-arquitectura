# Código — Experimento 2: Ventana de consistencia eventual de la réplica de Riesgo

Esta carpeta contiene la implementación del experimento diseñado en [`../DISENO-EXPERIMENTOS.md`](../DISENO-EXPERIMENTOS.md) (filas de la tabla del Experimento 2). Lee ese documento completo antes de escribir código aquí — define el ASR (objetivo < 2s end-to-end), el volumen de "perfiles/segundo" a simular y los criterios de éxito/fracaso que este código debe poder demostrar.

## Estructura esperada

```
experimento-2-replica-riesgo/
├── replica-set/          # docker-compose con MongoDB 1 primario + 1 secundario
├── escritor-risk/         # Script que simula RISK: escribe perfiles con timestamp
├── lector-rating/          # Script que simula RATING: lee de la réplica, mide staleness
└── docker-compose.yml
```

## Estado

🔴 Pendiente de construcción — corresponde a las semanas 6-7 del curso. Usa el agente `experiment-builder` de este repo para levantar cada pieza.

## Al terminar

Actualiza la sección "Resultados y análisis" del [README de diseño](../DISENO-EXPERIMENTOS.md) con los números reales obtenidos (lag p95 de replicación, tiempo end-to-end escritura→visibilidad) y la conclusión frente a los criterios de éxito/fracaso ya definidos ahí.
