# Solventa — Experimentos de Arquitectura (contexto de trabajo)

Este repo se acotó deliberadamente a **solo** el diseño y la construcción de los 2 experimentos de arquitectura de Solventa (aseguradora digital / insurtech sobre Open Finance y Open Data), curso MISW4501. El resto de la entrega (vistas de arquitectura, patrones detallados, estrategia de pruebas, plan de trabajo, video) vive fuera de este espacio de trabajo — no lo traigas de vuelta aquí.

Ver [`README.md`](README.md) para el mapa del repo y [`DISENO-EXPERIMENTOS.md`](DISENO-EXPERIMENTOS.md) para la fuente de verdad completa del diseño de ambos experimentos.

## Estado actual (2026-09-12)

- **Experimento 1 (ACL Worker/KYC): ✅ completo.** Las 4 piezas (`experimento-1-acl-kyc/stub-kyc`, `acl-worker`, `consumidor-under`, `k6`) están construidas, corridas en vivo y comiteadas/pusheadas a `origin/main`. Los 3 criterios de éxito se cumplieron con datos reales de k6 — ver la sección "Resultados y análisis" del Experimento 1 en `DISENO-EXPERIMENTOS.md`.
- **IaC del Experimento 1: preparado, no aplicado.** [`experimento-1-acl-kyc/infra/`](experimento-1-acl-kyc/infra/) tiene el Terraform para desplegar las 3 piezas en Cloud Run (`us-central1`, proyecto `hda-projectt`, facturación confirmada activa). `terraform init`/`validate`/`plan` ya corrieron sin errores (9 recursos a crear). **`terraform apply` NO se ha ejecutado** — crea infraestructura real facturable, requiere confirmación explícita del usuario antes de correrlo.
- **Experimento 2 (réplica de Riesgo): 🔴 sin empezar.** Solo existe el esqueleto de carpeta (`experimento-2-replica-riesgo/README.md`) con la estructura esperada. **Este es el punto de partida de la próxima sesión** — invoca `experiment-builder` y dile que empiece por el replica set de MongoDB.

## Decisiones ya cerradas del Experimento 1 (no las reinterpretes)

- El stub de KYC imita el contrato **asíncrono real** de un proveedor de referencia (Truora): `POST /v1/validations` → `201`+`validation_id`, `GET /v1/validations/:id` → `pending`/`success`/`failure`, con modos de falla `pending-forever`, `error-429`, `down`.
- La llamada UNDER → ACL es **síncrona, no vía Pub/Sub** (es una dependencia de decisión de negocio antes de emitir la póliza, no un efecto colateral). El ACL Worker absorbe el ciclo asíncrono del proveedor con **polling interno acotado por el umbral T** del ASR.
- El ACL Worker se estructura internamente como **puertos y adaptadores (hexagonal)**: puerto `PuertoProveedorIdentidad`, adaptadores `TruoraAdapter`/`StubKycAdapter`, Circuit Breaker (Opossum) envolviendo el adaptador. El consumidor simplificado de UNDER y el stub de KYC **no** llevan esta estructura — son andamiaje de prueba.

## Agentes disponibles en este repo

- **`experiment-builder`** — construir, ejecutar y analizar el código de los dos experimentos. Úsalo para cualquier tarea de codificación de esta fase.
- **`experiment-designer`** — refinar o auditar el *diseño* en `DISENO-EXPERIMENTOS.md` (no código).

## Reglas de trabajo en este repo

- `DISENO-EXPERIMENTOS.md` es la fuente de verdad — el código debe seguirlo, no al revés. Si el código revela que el diseño necesita cambiar, se actualiza ese archivo primero (o en el mismo cambio), nunca se deja la divergencia implícita.
- No sobre-construir: estos son experimentos de curso con presupuesto de horas real y compartido con trabajo de UX/UI — construir solo lo necesario para generar la evidencia que piden los criterios de éxito/fracaso ya definidos.
- No traigas de vuelta a este repo contenido de otras secciones de la entrega (vistas, patrones, estrategia de pruebas, plan de trabajo, video) — ese es el punto de haberlo sacado.
