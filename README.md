# Solventa — Entrega de Arquitectura

Repositorio de la entrega de arquitectura del proyecto **Solventa** (sistema de seguros digitales y finanzas abiertas). Este README es el índice general: mapea cada carpeta a un ítem del rubric de calificación y señala qué contenido ya existe y cuál está pendiente por desarrollar.

## Mapa de la entrega (100 puntos)

| # | Entregable | Puntos | Carpeta | Estado |
|---|---|---|---|---|
| 1 | **Hoja de trabajo**: modelos, patrones detallados y experimento | **78** | [`01-hoja-de-trabajo/`](01-hoja-de-trabajo/) | 🟡 En progreso |
| 1.1 | — Modelos de arquitectura | 20 | [`01-hoja-de-trabajo/01-modelos-arquitectura/`](01-hoja-de-trabajo/01-modelos-arquitectura/) | 🟢 Completo (4 vistas + razonamiento) |
| 1.2 | — Diseño detallado de arquitectura | 30 | [`01-hoja-de-trabajo/02-diseno-detallado-arquitectura/`](01-hoja-de-trabajo/02-diseno-detallado-arquitectura/) | 🟢 Completo, ASR trazados al backlog real de Jira |
| 1.3 | — Diseño del experimento de arquitectura | 28 | [`01-hoja-de-trabajo/03-diseno-experimento-arquitectura/`](01-hoja-de-trabajo/03-diseno-experimento-arquitectura/) | 🟡 2 experimentos diseñados y motivados por historias reales, falta ejecutar |
| 2 | Refinamiento estrategia de pruebas | 2 | [`02-estrategia-pruebas/`](02-estrategia-pruebas/) | 🟡 Addendum sobre el v1.0.0 real, falta decisión sobre 3 componentes faltantes en diagramas |
| 3 | Plan de trabajo y tablero (actualización) | 10 | [`03-plan-trabajo-tablero/`](03-plan-trabajo-tablero/) | 🟢 Tablero base creado |
| 4 | Video con evidencias | 10 | [`04-video-evidencias/`](04-video-evidencias/) | 🔴 Pendiente (guion listo) |

Leyenda: 🟢 con contenido | 🟡 parcial | 🔴 pendiente por completar.

## Qué se organizó en esta pasada

Se reestructuraron los tres artefactos que ya existían en el repositorio (sueltos en la raíz) dentro de `01-hoja-de-trabajo/01-modelos-arquitectura/`:

- `1.Diagrama_Contexto.puml` — Diagrama de contexto (C4 Nivel 1) en PlantUML. Antes `Modelo de contexto.txt`.
- `4.1.Diagrama_Componentes.drawio` — Diagrama de componentes y conectores (draw.io).
- `4.2.Diagrama_Despliegue.drawio` — Diagrama de despliegue en GCP/AWS (draw.io).

Cada carpeta pendiente tiene un `README.md` con el checklist de lo que falta por completar, para que el contenido nuevo se redacte directamente ahí en la misma estructura.

Sobre esa base ya se redactó contenido real de Solventa (no solo checklists) en:

- **1.1** — se completó la única vista mínima que faltaba: `3.Vista_Informacion.puml` (entidades por almacén, propiedad de datos, decisiones de replicación), más el razonamiento de cada vista y una tabla de consistencia de nombres.
- **1.2** — catálogo de 9 patrones (incluido el Circuit Breaker/Retry, ya formalizado en `4.1.Diagrama_Componentes.drawio`), tácticas por atributo de calidad, 5 ADRs y trazabilidad a ASR **anclada al backlog real de Jira** (`utils/Jira.xml`, 13 historias, proyecto KAN — cada táctica cita la historia, prioridad y puntos que la motivan).
- **1.3** — 2 experimentos de arquitectura completos (Circuit Breaker en ACL Workers, motivado por KAN-31; lag de réplica de lectura en Riesgo, motivado por KAN-24 — la historia de más puntos del backlog), con estructura de 9 puntos cada uno y roles asignados a los 2 nombres reales del equipo que aparecen en Jira (Frans Taboada, Daniel Felipe Urrego).
- **2** — refinamiento de la estrategia de pruebas ligado a los patrones/experimentos anteriores, con técnicas ancladas a criterios de aceptación reales del backlog (no repudio, PCI-DSS, biometría, sync offline).

Quedan pendientes de esta pasada, y requieren información que solo tiene el equipo: fusionar la sección 2 con la estrategia de pruebas anterior real (no está en este repo), completar los roles del equipo que Jira no identifica por nombre, calibrar umbrales numéricos contra el SLA real, ejecutar los experimentos (semanas 6-7), y el guion/grabación del video (sección 4).

## Guía metodológica y backlog real

Los checklists de las secciones pendientes (1.2, 1.3, 2 y 4) se enriquecieron con la guía oficial del curso extraída de la carpeta local `utils/` (transcripciones de la clase en vivo de la semana 4 y de módulos grabados sobre diseño del experimento, tácticas de disponibilidad y estrategia de pruebas). Además, `utils/Jira.xml` (export real del proyecto **KAN — Solventa**) se usó para anclar la trazabilidad de ASR en 1.2, la motivación de los experimentos en 1.3 y las técnicas de prueba en 2 a historias de usuario, prioridades y puntos reales del equipo, en vez de a supuestos inferidos del dominio. Esa carpeta **no se versiona** (ver `.gitignore`) por ser material del curso/del equipo, pero cada README cita explícitamente qué archivo de `utils/` sustenta cada indicación (incluyendo el ID de historia `KAN-XX` cuando aplica), para que quien retome el trabajo pueda volver a la fuente.
