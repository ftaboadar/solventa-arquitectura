# 1.2 Diseño detallado de arquitectura (30 pts)

**Estado: pendiente.** Esta sección debe documentar, con detalle, los patrones y tácticas arquitectónicas que sustentan las decisiones visibles en [`01-modelos-arquitectura/`](../01-modelos-arquitectura/).

## Qué exige el curso para esta sección

> Guía tomada de la sesión en vivo de la semana 4 (`utils/MISW4501-202614-S4C1-es-ES.vtt`) y del resumen de esa semana (`utils/subtitle (31).txt`).

El flujo esperado por el curso es: **1) elegir un estilo de arquitectura → 2) aplicar tácticas de arquitectura → 3) hacer el diseño detallado de esas tácticas**, de forma que cada Requerimiento Arquitectónicamente Significativo (ASR) quede cada vez más cerca de su solución concreta.

Puntos que el profesor remarca explícitamente como criterio de evaluación:

- **No basta con nombrar el patrón/táctica.** Hay que explicar el razonamiento: por qué se escogió ese estilo, por qué se aplicó esa táctica, qué alternativas se descartaron y por qué. Textual: *"no es solo hacer el modelo y ya"*; el tutor debe poder entender la decisión sin tener que adivinarla.
- Ese razonamiento debe quedar documentado aquí **y** explicado verbalmente en el [video de evidencias](../../04-video-evidencias/) — ambos canales se evalúan.
- Las tácticas deben estar **trazadas a los atributos de calidad / escenarios de calidad** definidos previamente (backlog de atributos de calidad de la entrega anterior), no aplicadas de forma genérica.

## Checklist sugerido

- [ ] **Catálogo de patrones**: nombre del patrón, problema que resuelve, dónde se aplica en Solventa, alternativas consideradas y por qué se descartaron.
  - Patrones ya insinuados por los diagramas existentes y que valdría la pena formalizar: BFF (Backend for Frontend), API Gateway, Anti-Corruption Layer (capa de integración), Event-Driven Architecture / Event Bus, CQRS-like (escritor único + réplica de lectura en Riesgo), Circuit Breaker/Retry hacia proveedores externos, Saga/orquestación para el flujo cotización → suscripción → pago → póliza.
- [ ] **Tácticas por atributo de calidad**: para cada atributo priorizado (disponibilidad, rendimiento, seguridad, escalabilidad, etc.) listar la táctica arquitectónica concreta y su implementación (ej. réplica HA de Cloud SQL para disponibilidad, Redis para rendimiento, Cloud Armor/KMS/Secret Manager para seguridad).
  - Ver `utils/subtitle (32).txt` para un ejemplo de cómo el curso descompone las **tácticas de disponibilidad** en microservicios síncronos: detección de fallas (monitor de salud, votación con número impar de réplicas) y recuperación (retiro de servicio fallido de la rotación).
- [ ] **Decisiones de arquitectura (ADR)**: al menos las decisiones clave con formato contexto → decisión → consecuencias (ej. MongoDB vs. PostgreSQL por dominio, Cloud Run vs. GKE, elección de GCP como nube principal).
- [ ] **Trazabilidad**: relacionar cada patrón/táctica con el requerimiento o escenario de calidad (ASR) que lo motiva — esta trazabilidad es la que luego justifica cuáles decisiones ameritan pasar a la sección de [experimento](../03-diseno-experimento-arquitectura/).

## Insumo de partida

Usar como base los componentes y flujos ya identificados en `4.1.Diagrama_Componentes.drawio` y `4.2.Diagrama_Despliegue.drawio` — no se debe redefinir la arquitectura, solo explicar el "por qué" detrás de lo ya diagramado.
