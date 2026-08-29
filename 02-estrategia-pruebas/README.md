# 2. Refinamiento estrategia de pruebas (2 pts)

**Estado: pendiente.** Este ítem es un *refinamiento*, lo que implica que ya existe una estrategia de pruebas previa (de una entrega anterior del curso) que debe actualizarse — no se debe partir de cero.

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (31).txt` y de la sesión en vivo (`utils/MISW4501-202614-S4C1-es-ES.vtt`, min. ~20:00).

- El profesor es explícito en que el refinamiento **es iterativo cada semana**: no se hace una vez y se cierra. Cada semana que avanza el diseño de arquitectura, se revisa de nuevo la estrategia de pruebas para incorporar el detalle que antes no era visible (cita: *"cada semana aprendemos algo... esta semana que hagamos la arquitectura más detallada seguramente también dirá revise poquito más las pruebas"*).
- Advertencia explícita del curso: **las pruebas** (junto con la parte móvil) son la actividad que **más retrasa** a los equipos en el Proyecto Final II. Dejar la tecnología y técnica de pruebas bien definida desde ahora reduce ese riesgo.
- No se espera una estrategia "cerrada": se espera evidencia de que se revisó contra el estado actual del diseño (qué cambia en móvil, qué cambia con los nuevos componentes) y se ajustó donde aplicaba.

## Checklist sugerido

- [ ] Ubicar y enlazar aquí la estrategia de pruebas de la entrega anterior (si vive en otro repositorio/documento del curso, referenciarla).
- [ ] Identificar qué cambió en la arquitectura desde esa versión (nuevos componentes, patrones o riesgos introducidos en [`01-hoja-de-trabajo/`](../01-hoja-de-trabajo/)) y qué implica para las pruebas.
- [ ] Actualizar niveles de prueba pertinentes: unitarias, integración entre microservicios, contract testing en los puntos de BFF/API Gateway, pruebas de resiliencia (Circuit Breaker/ACL) y pruebas de los flujos asíncronos vía Event Bus.
- [ ] Registrar explícitamente qué se agregó/cambió/eliminó respecto a la versión anterior (esto es lo que suele pedirse en un "refinamiento", más que la estrategia completa).
