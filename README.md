# Solventa — Experimentos de Arquitectura

Este repo contiene **solo** el diseño y la construcción de los experimentos de arquitectura del proyecto Solventa (MISW4501). El resto de la entrega de arquitectura (vistas, patrones detallados, estrategia de pruebas, plan de trabajo, video) vive fuera de este espacio de trabajo — se sacó a propósito para no perdernos entre carpetas que no son el objetivo aquí.

## Dónde está todo

- **[`DISENO-EXPERIMENTOS.md`](DISENO-EXPERIMENTOS.md)** — la fuente de verdad: propósito, ASR, criterios de éxito/fracaso, ficha de tecnología y resultados de los 2 experimentos. Empieza siempre aquí.
- **[`experimento-1-acl-kyc/`](experimento-1-acl-kyc/)** — ✅ **completo**: Circuit Breaker/Retry en el ACL Worker de KYC. 4 piezas (`stub-kyc`, `acl-worker`, `consumidor-under`, `k6`), todas construidas, corridas en vivo y con los 3 criterios de éxito cumplidos con datos reales.
- **[`experimento-2-replica-riesgo/`](experimento-2-replica-riesgo/)** — 🔴 **sin empezar**: ventana de consistencia eventual de la réplica de lectura de Riesgo. Solo el esqueleto de carpeta. Punto de partida de la próxima sesión.
- **[`CLAUDE.md`](CLAUDE.md)** — contexto y decisiones ya cerradas para cualquier sesión de Claude Code que abra este repo.
- **`.claude/agents/`** — `experiment-builder` (construir/ejecutar código) y `experiment-designer` (refinar/auditar el diseño en `DISENO-EXPERIMENTOS.md`).

## Regla de este repo

Si algo no es el diseño o el código de estos dos experimentos, no va aquí — va en el repo/documento de la entrega completa de arquitectura.
