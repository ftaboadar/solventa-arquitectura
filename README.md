# Solventa — Entrega de Arquitectura

Repositorio de la entrega de arquitectura del proyecto **Solventa** (sistema de seguros digitales y finanzas abiertas). Este README es el índice general: mapea cada carpeta a un ítem del rubric de calificación y señala qué contenido ya existe y cuál está pendiente por desarrollar.

## Mapa de la entrega (100 puntos)

| # | Entregable | Puntos | Carpeta | Estado |
|---|---|---|---|---|
| 1 | **Hoja de trabajo**: modelos, patrones detallados y experimento | **78** | [`01-hoja-de-trabajo/`](01-hoja-de-trabajo/) | 🟡 En progreso |
| 1.1 | — Modelos de arquitectura | 20 | [`01-hoja-de-trabajo/01-modelos-arquitectura/`](01-hoja-de-trabajo/01-modelos-arquitectura/) | 🟢 Insumos organizados |
| 1.2 | — Diseño detallado de arquitectura | 30 | [`01-hoja-de-trabajo/02-diseno-detallado-arquitectura/`](01-hoja-de-trabajo/02-diseno-detallado-arquitectura/) | 🔴 Pendiente |
| 1.3 | — Diseño del experimento de arquitectura | 28 | [`01-hoja-de-trabajo/03-diseno-experimento-arquitectura/`](01-hoja-de-trabajo/03-diseno-experimento-arquitectura/) | 🔴 Pendiente |
| 2 | Refinamiento estrategia de pruebas | 2 | [`02-estrategia-pruebas/`](02-estrategia-pruebas/) | 🔴 Pendiente |
| 3 | Plan de trabajo y tablero (actualización) | 10 | [`03-plan-trabajo-tablero/`](03-plan-trabajo-tablero/) | 🟢 Tablero base creado |
| 4 | Video con evidencias | 10 | [`04-video-evidencias/`](04-video-evidencias/) | 🔴 Pendiente (guion listo) |

Leyenda: 🟢 con contenido | 🟡 parcial | 🔴 pendiente por completar.

## Qué se organizó en esta pasada

Se reestructuraron los tres artefactos que ya existían en el repositorio (sueltos en la raíz) dentro de `01-hoja-de-trabajo/01-modelos-arquitectura/`:

- `1.Diagrama_Contexto.puml` — Diagrama de contexto (C4 Nivel 1) en PlantUML. Antes `Modelo de contexto.txt`.
- `4.1.Diagrama_Componentes.drawio` — Diagrama de componentes y conectores (draw.io).
- `4.2.Diagrama_Despliegue.drawio` — Diagrama de despliegue en GCP/AWS (draw.io).

Cada carpeta pendiente tiene un `README.md` con el checklist de lo que falta por completar, para que el contenido nuevo se redacte directamente ahí en la misma estructura.

## Guía metodológica

Los checklists de las secciones pendientes (1.2, 1.3, 2 y 4) se enriquecieron con la guía oficial del curso extraída de la carpeta local `utils/` (transcripciones de la clase en vivo de la semana 4 y de módulos grabados sobre diseño del experimento, tácticas de disponibilidad y estrategia de pruebas). Esa carpeta **no se versiona** (ver `.gitignore`) por ser material del curso, pero cada README cita explícitamente qué archivo de `utils/` sustenta cada indicación, para que quien retome el trabajo pueda volver a la fuente.
