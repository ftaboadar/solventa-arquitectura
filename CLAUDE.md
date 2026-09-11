# Solventa — Arquitectura (contexto de trabajo)

Repositorio de la entrega de arquitectura de **Solventa** (aseguradora digital / insurtech sobre Open Finance y Open Data), curso MISW4501, Universidad de los Andes. Ver [`README.md`](README.md) para el mapa completo de la entrega y su estado por sección.

## Estado actual (2026-09-10)

El **diseño** (secciones 1.1, 1.2 y 1.3 del rubric) está completo. Lo que sigue, y para lo que está preparado este repo, es la **construcción y ejecución de los experimentos de arquitectura** (semanas 6-7), documentados en [`01-hoja-de-trabajo/03-diseno-experimento-arquitectura/README.md`](01-hoja-de-trabajo/03-diseno-experimento-arquitectura/README.md).

## Los dos experimentos (resumen — el README de diseño es la fuente de verdad completa)

1. **Experimento 1 — Circuit Breaker/Retry en ACL Worker de KYC** (motivado por KAN-31). Decisiones ya cerradas que cualquier sesión de código debe respetar:
   - El stub de KYC imita el contrato **asíncrono real** de un proveedor de referencia (Truora): `POST /v1/validations` → `201`+`validation_id`, `GET /v1/validations/:id` → `pending`/`success`/`failure`, con modos de falla `pending-forever`, `error-429`, `down`.
   - La llamada UNDER → ACL es **síncrona, no vía Pub/Sub** (es una dependencia de decisión de negocio antes de emitir la póliza, no un efecto colateral). El ACL Worker absorbe el ciclo asíncrono del proveedor con **polling interno acotado por el umbral T** del ASR.
   - El ACL Worker se estructura internamente como **puertos y adaptadores (hexagonal)**: puerto `PuertoProveedorIdentidad`, adaptadores `TruoraAdapter`/`StubKycAdapter`, Circuit Breaker envolviendo el adaptador. El consumidor simplificado de UNDER y el stub de KYC **no** llevan esta estructura — son andamiaje de prueba.
   - Carpeta de código: `01-hoja-de-trabajo/03-diseno-experimento-arquitectura/experimento-1-acl-kyc/`.

2. **Experimento 2 — Ventana de consistencia eventual de la réplica de lectura de Riesgo** (motivado por KAN-24, la historia de más puntos del backlog).
   - Carpeta de código: `01-hoja-de-trabajo/03-diseno-experimento-arquitectura/experimento-2-replica-riesgo/`.

## Agentes disponibles en este repo

- **`experiment-builder`** — construir, ejecutar y analizar el código de los dos experimentos. Úsalo para cualquier tarea de codificación de esta fase.
- **`experiment-designer`** — refinar o auditar el *diseño* de los experimentos (no código).
- **`arch-documenter`** — vistas de arquitectura, patrones y ADRs en `01-hoja-de-trabajo/01-modelos-arquitectura/` y `02-diseno-detallado-arquitectura/`.

## Reglas de trabajo en este repo

- El diseño de experimentos (README de la sección 1.3) es la fuente de verdad — el código debe seguirlo, no al revés. Si el código revela que el diseño necesita cambiar, se actualiza el README primero (o en el mismo cambio), nunca se deja la divergencia implícita.
- No sobre-construir: estos son experimentos de curso con presupuesto de horas real y compartido con trabajo de UX/UI (ver sección "Reconciliación de esfuerzo" si existe en el README de diseño) — construir solo lo necesario para generar la evidencia que piden los criterios de éxito/fracaso ya definidos.
- `utils/` no se versiona (material del curso) — cualquier referencia a ese material debe quedar citada en el README correspondiente, no asumida.
