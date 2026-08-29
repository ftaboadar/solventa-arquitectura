# 1. Hoja de trabajo — modelos, patrones y experimento de arquitectura (78 pts)

Documento de trabajo que reúne las tres piezas centrales del análisis de arquitectura de Solventa. Cada una vive en su propia subcarpeta:

| Sección | Puntos | Contenido | Estado |
|---|---|---|---|
| [`01-modelos-arquitectura/`](01-modelos-arquitectura/) | 20 | Vistas de contexto, componentes y despliegue | 🟢 Insumos organizados |
| [`02-diseno-detallado-arquitectura/`](02-diseno-detallado-arquitectura/) | 30 | Patrones y tácticas arquitectónicas detalladas por atributo de calidad | 🔴 Pendiente |
| [`03-diseno-experimento-arquitectura/`](03-diseno-experimento-arquitectura/) | 28 | Diseño del experimento (escenario, hipótesis, método de validación, resultados) | 🔴 Pendiente |

## Orden de trabajo sugerido

1. Cerrar `01-modelos-arquitectura/` (verificar que las vistas cubren lo pedido por el enunciado del curso).
2. Con los modelos como base, identificar en `02-diseno-detallado-arquitectura/` los patrones y tácticas ya visibles en los diagramas (BFF, ACL, Event-Driven, CQRS-like en Riesgo, Circuit breaker/retry hacia integraciones externas, etc.) y documentarlos con el detalle que pida el rubric.
3. Elegir en `03-diseno-experimento-arquitectura/` el atributo de calidad crítico a validar (ej. disponibilidad del flujo de cotización, latencia del BFF, resiliencia ante caída de un proveedor externo) y diseñar el experimento correspondiente.
