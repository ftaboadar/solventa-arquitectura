# Tablero — Entrega de Arquitectura Solventa

_Última actualización: 2026-08-29_

> Restricción de calendario del curso (ver [`01-hoja-de-trabajo/03-diseno-experimento-arquitectura/`](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)): el **diseño** de arquitectura y experimentos se cierra en las semanas 4-5; la **construcción y ejecución** de los experimentos ocurre en las semanas 6-7, compartidas con el trabajo de UX/mockups. El diseño del experimento debe quedar completo y accionable antes de que termine esta entrega.

## Backlog

- [ ] `[1.2]` Reevaluar la Saga coreografiada si el flujo de indemnización gana más pasos condicionales (decisión abierta, no bloqueante; reforzada por KAN-38)
- [ ] `[1.3]` Completar los roles restantes (Integrante C/D) con el resto del equipo real — el backlog de Jira solo identifica 2 personas por nombre
- [ ] `[1.3]` Calibrar los umbrales numéricos (ms, %, lag) de los criterios de éxito contra el SLA/ASR real del equipo — el backlog trae criterios cualitativos, no numéricos
- [ ] `[1.3]` Ejecutar el Experimento 1 (Circuit Breaker/Retry en ACL Workers) en semanas 6-7 y completar resultados
- [ ] `[1.3]` Ejecutar el Experimento 2 (lag de réplica de lectura en Riesgo) en semanas 6-7 y completar resultados
- [ ] `[1.3]` Evaluar si hay margen para levantar el candidato descartado (Saga de indemnización paramétrica) como 3er experimento
- [ ] `[3]` Formalizar la metodología de priorización (Value vs. Risk Score: valor de negocio, riesgo regulatorio, dependencia técnica) como documento explícito en el backlog — corrige el 0/10 del tutor en "metodología de priorización no clara"
- [ ] `[1.1]` **Decidir si se agregan `EXPLAIN`, `OFFLINE_STORE`, `MAPS` a los diagramas `4.1`/`4.2`** — son componentes reales usados en `Solventa_Estrategia_Pruebas.pdf` (FC-02, FC-04/17, FC-20) que hoy no están dibujados
- [ ] `[2]` Ratificar con quien lidera pruebas el presupuesto de latencia propuesto para FC-02/EXPLAIN
- [ ] `[4]` Grabar el video explicando el razonamiento (no solo mostrar los modelos) y editarlo

## En progreso

_(vacío)_

## En revisión

_(vacío)_

## Hecho

- [x] `[1.1]` Reorganizar diagramas existentes en carpeta `01-modelos-arquitectura/`
- [x] `[1.1]` Documentar contenido de los 3 modelos existentes (contexto, componentes, despliegue)
- [x] `[1.1]` Elaborar la vista de información (`3.Vista_Informacion.puml`) — entidades, propiedad de datos y decisiones de replicación por almacén
- [x] `[1.1]` Redactar el razonamiento de cada vista (por qué contexto, por qué capas, por qué esta topología de despliegue, por qué esta vista de información)
- [x] `[1.1]` Resolver si falta alguna vista adicional (no obligatoria; candidata puntual: vista de procesos para la Saga)
- [x] `[1.1]` Tabla de consistencia de nombres entre vistas (negocio ↔ identificador técnico)
- [x] `[1.1]` Renderizar y revisar visualmente `3.Vista_Informacion.puml` (con PlantUML `-charset UTF-8`)
- [x] `[1.2]` Redactar catálogo de patrones (9 patrones) con problema, ubicación en Solventa y alternativas descartadas
- [x] `[1.2]` Documentar tácticas por atributo de calidad (disponibilidad, rendimiento, escalabilidad, seguridad, interoperabilidad, auditabilidad, consistencia)
- [x] `[1.2]` Redactar 5 ADRs de las decisiones clave de arquitectura
- [x] `[1.2]` Trazar patrones/tácticas a ASR inferidos (pendiente de validar contra backlog real del equipo)
- [x] `[1.2]` `[1.1]` Formalizar el Circuit Breaker/Retry en `4.1.Diagrama_Componentes.drawio` (bloque ACL Workers)
- [x] `[1.2]` Reconstruir la trazabilidad ASR con el backlog real de Jira (`utils/Jira.xml`, 13 historias, proyecto KAN) — cada táctica cita la historia (`KAN-XX`), prioridad y puntos que la motivan
- [x] `[1.2]` Corregir los 5 Escenarios de Calidad observados por el tutor (EC009, EC010, EC013, EC014, EC015, EC018) — aplicado por el equipo en Jira, registrado en [`correcciones-tutor-EdeC.md`](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/correcciones-tutor-EdeC.md)
- [x] `[1.1]` `[1.2]` Agregar leyenda de los 9 patrones de diseño al diagrama de componentes (`4.1`), incluida la Saga coreografiada que antes no estaba nombrada visualmente
- [x] `[1.3]` Asignar los 2 nombres reales del backlog (Frans Taboada, Daniel Felipe Urrego) a los roles de los experimentos con relación directa a su historia motivadora
- [x] `[2]` Anclar las técnicas de prueba a criterios de aceptación reales del backlog (no repudio, PCI-DSS, biometría en Keystore/Keychain, sync offline, GPS embebido)
- [x] `[1.3]` Diseñar Experimento 1: Circuit Breaker/Retry en ACL Workers (estructura completa de 9 puntos)
- [x] `[1.3]` Diseñar Experimento 2: lag de réplica de lectura en Riesgo bajo carga (estructura completa de 9 puntos)
- [x] `[1.3]` Documentar candidatos descartados y el criterio de estimación (Saga, región/zona GCP)
- [x] `[2]` Identificar impacto de los cambios de arquitectura de esta semana sobre las pruebas (tabla de elementos nuevos → prueba requerida)
- [x] `[2]` Definir niveles/técnicas de prueba refinados (contrato de eventos, resiliencia reutilizando Experimento 1, staleness reutilizando Experimento 2, seguridad de infraestructura, móvil)
- [x] `[2]` Ubicar y leer la estrategia de pruebas real v1.0.0 (`Solventa_Estrategia_Pruebas.pdf`, 31 páginas, FC-01–FC-20) y refinarla como addendum sobre ella, no como reemplazo
- [x] `[2]` Cerrar el riesgo que el propio v1.0.0 dejó abierto: presupuesto de latencia de FC-02/EXPLAIN (propuesto: p95≤800ms/p99≤1.5s, pendiente de ratificar)
- [x] `[1.2]` `[1.3]` `[2]` `[4]` Enriquecer checklists de las secciones pendientes con la guía metodológica oficial del curso (`utils/`)
- [x] `[3]` Crear estructura de carpetas alineada al rubric de la entrega
- [x] `[3]` Crear tablero base de seguimiento

---

## Resumen de avance

| Sección | Tareas totales | Hechas | % |
|---|---|---|---|
| 1.1 Modelos de arquitectura | 5 | 5 | 100% |
| 1.2 Diseño detallado | 7 | 6 | 86% |
| 1.3 Diseño del experimento | 11 | 8 | 73% |
| 2 Estrategia de pruebas | 7 | 4 | 57% |
| 3 Plan de trabajo y tablero | 2 | 2 | 100% |
| 4 Video con evidencias | 1 | 0 | 0% |
