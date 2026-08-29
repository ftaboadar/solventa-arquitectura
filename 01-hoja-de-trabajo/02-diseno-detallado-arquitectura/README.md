# 1.2 Diseño detallado de arquitectura (30 pts)

**Estado: pendiente.** Esta sección debe documentar, con detalle, los patrones y tácticas arquitectónicas que sustentan las decisiones visibles en [`01-modelos-arquitectura/`](../01-modelos-arquitectura/).

## Checklist sugerido

- [ ] **Catálogo de patrones**: nombre del patrón, problema que resuelve, dónde se aplica en Solventa, alternativas consideradas y por qué se descartaron.
  - Patrones ya insinuados por los diagramas existentes y que valdría la pena formalizar: BFF (Backend for Frontend), API Gateway, Anti-Corruption Layer (capa de integración), Event-Driven Architecture / Event Bus, CQRS-like (escritor único + réplica de lectura en Riesgo), Circuit Breaker/Retry hacia proveedores externos, Saga/orquestación para el flujo cotización → suscripción → pago → póliza.
- [ ] **Tácticas por atributo de calidad**: para cada atributo priorizado (disponibilidad, rendimiento, seguridad, escalabilidad, etc.) listar la táctica arquitectónica concreta y su implementación (ej. réplica HA de Cloud SQL para disponibilidad, Redis para rendimiento, Cloud Armor/KMS/Secret Manager para seguridad).
- [ ] **Decisiones de arquitectura (ADR)**: al menos las decisiones clave con formato contexto → decisión → consecuencias (ej. MongoDB vs. PostgreSQL por dominio, Cloud Run vs. GKE, elección de GCP como nube principal).
- [ ] **Trazabilidad**: relacionar cada patrón/táctica con el requerimiento o escenario de calidad que lo motiva.

## Insumo de partida

Usar como base los componentes y flujos ya identificados en `4.1.Diagrama_Componentes.drawio` y `4.2.Diagrama_Despliegue.drawio` — no se debe redefinir la arquitectura, solo explicar el "por qué" detrás de lo ya diagramado.
