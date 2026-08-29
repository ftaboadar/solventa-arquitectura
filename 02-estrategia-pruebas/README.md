# 2. Refinamiento estrategia de pruebas (2 pts)

> ✅ **Corrección de rumbo**: sí existe una entrega anterior real — `Solventa_Estrategia_Pruebas.pdf` (v1.0.0, 31 páginas, `utils/`, no versionado por ser documento externo del equipo). Trae 20 funcionalidades Core (FC-01–FC-20), 7 objetivos de prueba (OBJ-001–OBJ-007), matriz TNT completa, presupuesto (128 h-hombre, USD 160 en licencias de IA), pirámide de pruebas y una tabla de trazabilidad contra el rubric. Este documento **reemplaza el contenido anterior de esta sección** (que fue escrito sin conocer el v1.0.0) y en su lugar funciona como el **addendum de refinamiento** sobre él — no repite lo que ya está bien resuelto en el v1.0.0, solo documenta qué cambia con la arquitectura de esta semana (1.1, 1.2, 1.3).

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (31).txt` y de la sesión en vivo (`utils/MISW4501-202614-S4C1-es-ES.vtt`, min. ~20:00).

- El refinamiento **es iterativo cada semana**: se revisa contra el estado actual del diseño, no se reescribe desde cero.
- Advertencia explícita del curso: **las pruebas** (junto con la parte móvil) son la actividad que más retrasa a los equipos en el Proyecto Final II.

---

## 1. Riesgo que el propio v1.0.0 dejó abierto — ahora cerrado

La sección 2.8 del documento original ya declaraba este riesgo explícitamente:

> *"EXPLAIN sin presupuesto de latencia definido (FC-02) — La decisión de suscripción no puede explicarse dentro de un SLA verificable, afecta la defensa ante auditoría. Mitigación propuesta: definir explícitamente p95/p99 para la consulta de Explicabilidad antes de iniciar las pruebas de FC-02."*

**Cierre propuesto**, usando como referencia los presupuestos de latencia ya definidos para consultas equivalentes (EC011/EC012, "Consulta de póliza o estado de siniestro": p95 ≤ 150 ms / p99 ≤ 300 ms):

> **FC-02 (Explicabilidad de cotización/suscripción) — Presupuesto de latencia: p95 ≤ 800 ms; p99 ≤ 1.5 s.**
> Es mayor que el de una consulta simple de estado porque reconstruye el linaje completo de la decisión (fuentes consultadas, ponderaciones, reglas aplicadas) desde el log inmutable append-only (`AUDIT`/BigQuery) — una consulta más pesada, pero que igual necesita un SLA verificable porque actuaría/regulador pueden exigirla en caliente durante una auditoría.

Este número queda propuesto por el equipo (no viene del enunciado oficial del caso, que no cubre FC-02 explícitamente); debe ratificarse con quien lidera pruebas antes de usarse como criterio de aceptación.

## 2. Componentes reales que el v1.0.0 usa y que no estaban en `4.1`/`4.2` — ✅ ya agregados

El documento de pruebas referencia 3 componentes que no aparecían en los diagramas de arquitectura. Ya se incorporaron a `4.1.Diagrama_Componentes.drawio` esta semana:

| Componente (v1.0.0) | Funcionalidad que cubre | Estado en `4.1`/`4.2` |
|---|---|---|
| `EXPLAIN` (Explicabilidad y Linaje de Decisión) | FC-02 | ✅ Agregado en Capa 5 (Servicios Transversales), junto a `AUDIT`, con conector "Reconstruye Linaje" |
| `OFFLINE_STORE` (Almacén Local Cifrado) | FC-04 (Billetera offline-first), FC-17 (Reporte de siniestro con conectividad parcial) | ✅ Agregado dentro del módulo App Móvil, conectado a Billetera de Pólizas y a Siniestros (Cámara/Geo) |
| `MAPS` (Mapas y Red de Prestadores) | FC-20 (Geolocalización de prestadores) | ✅ Agregado en Capa 7 (Integraciones Externas), conectado vía ACL Workers |

Detalle completo en [1.1 §2](../01-hoja-de-trabajo/01-modelos-arquitectura/#2-diagrama-de-componentes-y-conectores) y en la [tabla de consistencia de nombres](../01-hoja-de-trabajo/01-modelos-arquitectura/#consistencia-de-nombres-entre-vistas).

## 3. Extensión de la matriz TNT con lo nuevo de 1.2/1.3

El v1.0.0 (sección 2.4.1) ya cubre resiliencia de forma parcial dentro de FC-06 (*"Mocking, contrato, timeout y circuit breaker"*) y FC-09 (*"Mocking, timeout, degradación elegante"*). Lo que agrega la arquitectura de esta semana es el detalle concreto de **cómo** validar eso, más 2 filas nuevas que el v1.0.0 no tenía:

| FC / Nuevo | Qué agrega esta semana | Técnica + Herramienta | Referencia |
|---|---|---|---|
| FC-06, FC-09 (ya existían) | El Circuit Breaker/Retry ahora está **formalizado en el diagrama** (`4.1`, bloque ACL Workers) con umbrales concretos, no solo mencionado en prosa | Reutilizar el stub de KYC + guiones k6 del [Experimento 1](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/#experimento-1--aislamiento-de-fallas-externas-vía-circuit-breaker--retry-en-acl-workers) como suite de regresión, no solo como experimento puntual | [1.2 §2.6](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/#26-circuit-breaker--retry-hacia-proveedores-externos) |
| **Nueva: Consistencia eventual (Riesgo)** | El v1.0.0 no tenía una fila para la réplica de lectura de Riesgo — es una decisión de esta semana ([1.2 §2.5](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/#25-vista-de-lectura-desacoplada-patrón-cqrs-like-en-el-dominio-de-riesgo)) | Medición de oplog lag, reutilizando el instrumental del [Experimento 2](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/#experimento-2--ventana-de-consistencia-eventual-de-la-réplica-de-lectura-de-riesgo-bajo-carga-concurrente) como prueba de regresión periódica | Afecta FC-01, FC-05 |
| **Nueva: Saga coreografiada** | Tampoco estaba en el v1.0.0 — probar compensación cuando `PaymentConfirmed` no llega tras `PolicyIssued`/`ClaimApproved` | Pruebas de fallas parciales inyectadas en el Event Bus, verificando que el estado quede consistente o se compense | Afecta FC-08, FC-11, FC-18; ver [1.2 §2.7](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/#27-saga-coreografiada-para-el-flujo-transaccional-distribuido) |

## Historial de versiones

| Versión | Qué contiene |
|---|---|
| **v1.0.0** | Documento base del equipo (`Solventa_Estrategia_Pruebas.pdf`): FC-01–FC-20, OBJ-001–OBJ-007, matriz TNT, presupuesto, pirámide, riesgos. |
| **Este addendum** (semana 4-5) | Cierra el riesgo "EXPLAIN sin presupuesto de latencia" declarado en v1.0.0 §2.8; documenta 3 componentes reales sin dibujar; extiende la matriz TNT con Circuit Breaker formalizado, consistencia eventual y Saga. |

## Checklist

- [x] Ubicar y leer la estrategia de pruebas real de la entrega anterior (`Solventa_Estrategia_Pruebas.pdf`, v1.0.0)
- [x] Cerrar el riesgo que el propio documento dejó abierto (presupuesto de latencia de FC-02/EXPLAIN)
- [x] Identificar componentes reales (`EXPLAIN`, `OFFLINE_STORE`, `MAPS`) ausentes en los diagramas `4.1`/`4.2`
- [x] Agregar `EXPLAIN`, `OFFLINE_STORE`, `MAPS` a `4.1.Diagrama_Componentes.drawio`, validado sin colisiones geométricas ni referencias rotas
- [x] Extender la matriz TNT con lo nuevo de esta semana (Circuit Breaker formalizado, consistencia eventual, Saga)
- [ ] Ratificar el presupuesto de latencia propuesto para FC-02 (p95 ≤ 800 ms / p99 ≤ 1.5 s) con quien lidera pruebas
- [ ] Verificar que el refinamiento quede también mencionado en el [video de evidencias](../04-video-evidencias/)
