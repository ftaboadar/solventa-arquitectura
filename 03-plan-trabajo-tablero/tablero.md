# Tablero — Entrega de Arquitectura Solventa

_Última actualización: 2026-08-29_

> Restricción de calendario del curso (ver [`01-hoja-de-trabajo/03-diseno-experimento-arquitectura/`](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)): el **diseño** de arquitectura y experimentos se cierra en las semanas 4-5; la **construcción y ejecución** de los experimentos ocurre en las semanas 6-7, compartidas con el trabajo de UX/mockups. El diseño del experimento debe quedar completo y accionable antes de que termine esta entrega.

## Backlog

- [ ] `[1.1]` Elaborar la vista de información (modelos de datos, flujos, particionamiento/replicación) — vista mínima exigida que aún no existe como artefacto propio
- [ ] `[1.1]` Redactar el razonamiento (por qué este estilo/decisión) de cada vista existente
- [ ] `[1.1]` Confirmar contra el enunciado del curso si falta alguna vista adicional (procesos, desarrollo, C4 Nivel 2)
- [ ] `[1.1]` Revisar consistencia de nombres de componentes entre diagrama de componentes y de despliegue
- [ ] `[1.2]` **Validar la trazabilidad patrón/táctica → ASR contra el backlog real de atributos de calidad del equipo** (la versión actual usa ASR inferidos del dominio, marcados como supuesto)
- [ ] `[1.2]` Decidir si el Circuit Breaker/Retry y la revisión de la Saga se incorporan formalmente al diagrama de componentes (`4.1`)
- [ ] `[1.3]` Identificar el/los punto(s) de sensibilidad (decisiones con incertidumbre real, no tecnología ya probada por la industria) — usar como candidatos los patrones/tácticas de `1.2` marcados con incertidumbre (p. ej. circuit breaker sin formalizar, elección de zona/región)
- [ ] `[1.3]` Redactar escenario de calidad (estímulo/entorno/respuesta/medida) por punto de sensibilidad
- [ ] `[1.3]` Formular hipótesis de diseño verificable por experimento
- [ ] `[1.3]` Completar la estructura de 9 puntos por experimento (propósito, recursos, elementos de arquitectura, punto de sensibilidad, patrones/tácticas, microservicios, conectores, ficha de tecnología, distribución de tareas)
- [ ] `[1.3]` Definir criterios de éxito/fracaso por experimento
- [ ] `[1.3]` Validar que el número de experimentos elegido sea viable en las semanas 6-7 (compartidas con UX)
- [ ] `[2]` Ubicar la estrategia de pruebas de la entrega anterior
- [ ] `[2]` Identificar impacto de los cambios de arquitectura de esta semana sobre las pruebas (incluida la parte móvil)
- [ ] `[2]` Redactar el refinamiento (qué se agregó/cambió/eliminó respecto a la versión previa)
- [ ] `[4]` Grabar el video explicando el razonamiento (no solo mostrar los modelos) y editarlo

## En progreso

_(vacío)_

## En revisión

_(vacío)_

## Hecho

- [x] `[1.1]` Reorganizar diagramas existentes en carpeta `01-modelos-arquitectura/`
- [x] `[1.1]` Documentar contenido de los 3 modelos existentes (contexto, componentes, despliegue)
- [x] `[1.2]` Redactar catálogo de patrones (9 patrones) con problema, ubicación en Solventa y alternativas descartadas
- [x] `[1.2]` Documentar tácticas por atributo de calidad (disponibilidad, rendimiento, escalabilidad, seguridad, interoperabilidad, auditabilidad, consistencia)
- [x] `[1.2]` Redactar 5 ADRs de las decisiones clave de arquitectura
- [x] `[1.2]` Trazar patrones/tácticas a ASR inferidos (pendiente de validar contra backlog real del equipo)
- [x] `[1.2]` `[1.3]` `[2]` `[4]` Enriquecer checklists de las secciones pendientes con la guía metodológica oficial del curso (`utils/`)
- [x] `[3]` Crear estructura de carpetas alineada al rubric de la entrega
- [x] `[3]` Crear tablero base de seguimiento

---

## Resumen de avance

| Sección | Tareas totales | Hechas | % |
|---|---|---|---|
| 1.1 Modelos de arquitectura | 6 | 2 | 33% |
| 1.2 Diseño detallado | 6 | 4 | 67% |
| 1.3 Diseño del experimento | 6 | 0 | 0% |
| 2 Estrategia de pruebas | 3 | 0 | 0% |
| 3 Plan de trabajo y tablero | 2 | 2 | 100% |
| 4 Video con evidencias | 1 | 0 | 0% |
