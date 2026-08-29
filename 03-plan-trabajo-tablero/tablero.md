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
- [ ] `[1.3]` **Reemplazar los roles genéricos (Integrante A/B/C/D) por los nombres reales del equipo** en la distribución de actividades de los 2 experimentos
- [ ] `[1.3]` Calibrar los umbrales numéricos (ms, %, lag) de los criterios de éxito contra el SLA/ASR real del equipo, no los de referencia usados en el diseño
- [ ] `[1.3]` Ejecutar el Experimento 1 (Circuit Breaker/Retry en ACL Workers) en semanas 6-7 y completar resultados
- [ ] `[1.3]` Ejecutar el Experimento 2 (lag de réplica de lectura en Riesgo) en semanas 6-7 y completar resultados
- [ ] `[1.3]` Evaluar si hay margen para levantar el candidato descartado (Saga de indemnización paramétrica) como 3er experimento
- [ ] `[2]` **Ubicar la estrategia de pruebas de la entrega anterior y fusionarla con el refinamiento ya redactado** (no está en este repo)
- [ ] `[2]` Completar la tabla "se agrega/cambia/elimina" contra la versión real anterior
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
- [x] `[1.3]` Diseñar Experimento 1: Circuit Breaker/Retry en ACL Workers (estructura completa de 9 puntos)
- [x] `[1.3]` Diseñar Experimento 2: lag de réplica de lectura en Riesgo bajo carga (estructura completa de 9 puntos)
- [x] `[1.3]` Documentar candidatos descartados y el criterio de estimación (Saga, región/zona GCP)
- [x] `[2]` Identificar impacto de los cambios de arquitectura de esta semana sobre las pruebas (tabla de elementos nuevos → prueba requerida)
- [x] `[2]` Definir niveles/técnicas de prueba refinados (contrato de eventos, resiliencia reutilizando Experimento 1, staleness reutilizando Experimento 2, seguridad de infraestructura, móvil)
- [x] `[1.2]` `[1.3]` `[2]` `[4]` Enriquecer checklists de las secciones pendientes con la guía metodológica oficial del curso (`utils/`)
- [x] `[3]` Crear estructura de carpetas alineada al rubric de la entrega
- [x] `[3]` Crear tablero base de seguimiento

---

## Resumen de avance

| Sección | Tareas totales | Hechas | % |
|---|---|---|---|
| 1.1 Modelos de arquitectura | 6 | 2 | 33% |
| 1.2 Diseño detallado | 6 | 4 | 67% |
| 1.3 Diseño del experimento | 5 | 3 | 60% |
| 2 Estrategia de pruebas | 4 | 2 | 50% |
| 3 Plan de trabajo y tablero | 2 | 2 | 100% |
| 4 Video con evidencias | 1 | 0 | 0% |
