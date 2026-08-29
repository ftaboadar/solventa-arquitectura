# 2. Refinamiento estrategia de pruebas (2 pts)

> ⚠️ **Supuesto a validar por el equipo**: este repositorio no contiene la estrategia de pruebas de la entrega anterior (no está en `utils/` ni en el resto del repo). Por eso este documento **no puede presentarse como un diff contra esa versión** — en su lugar, desarrolla la estrategia de pruebas al nivel de detalle que ya permite la arquitectura de esta semana ([`01-hoja-de-trabajo/`](../01-hoja-de-trabajo/)), organizada explícitamente como *qué se agrega/detalla* frente a lo que probablemente ya existía a alto nivel. **Antes de entregar: pegar aquí el documento previo y fusionar esta sección como una actualización real sobre él**, no como un reemplazo.

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (31).txt` y de la sesión en vivo (`utils/MISW4501-202614-S4C1-es-ES.vtt`, min. ~20:00).

- El refinamiento **es iterativo cada semana**: no se hace una vez y se cierra. Cada semana que avanza el diseño de arquitectura, se revisa de nuevo la estrategia de pruebas para incorporar el detalle que antes no era visible.
- Advertencia explícita del curso: **las pruebas** (junto con la parte móvil) son la actividad que **más retrasa** a los equipos en el Proyecto Final II. Dejar la tecnología y técnica de pruebas bien definida desde ahora reduce ese riesgo.
- No se espera una estrategia "cerrada": se espera evidencia de que se revisó contra el estado actual del diseño y se ajustó donde aplicaba.

---

## Qué cambió esta semana y qué implica para las pruebas

La arquitectura de esta semana ([1.1](../01-hoja-de-trabajo/01-modelos-arquitectura/), [1.2](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/), [1.3](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)) hizo explícitos varios elementos que antes de esta entrega probablemente no estaban lo suficientemente detallados como para diseñar pruebas específicas:

| Elemento nuevo/detallado | Qué prueba faltaba antes de esta semana |
|---|---|
| BFF por canal (Web/Móvil/B2B) con contratos distintos | Pruebas de contrato específicas por BFF, no una sola suite genérica de API |
| ACL Workers + Circuit Breaker/Retry hacia KYC, pasarela, firma, ACORD | Pruebas de resiliencia/inyección de fallas — antes no había un punto de aislamiento formal que probar |
| Event Bus con eventos de dominio (`PolicyIssued`, `ClaimApproved`, `PaymentConfirmed`, etc.) | Pruebas de contrato de eventos — varios consumidores (Auditoría, Notificaciones, Analítica, Antifraude) dependen del mismo esquema |
| Réplica de lectura eventual en Riesgo | Pruebas de consistencia/staleness — antes no estaba explícito que hubiera una ventana de inconsistencia a acotar |
| Saga coreografiada (emisión de póliza → pago; siniestro → indemnización) | Pruebas de compensación ante fallas parciales del flujo distribuido |

## Niveles y técnicas de prueba (refinados)

- **Unitarias**: lógica de dominio pura sin dependencias externas — reglas de rating actuarial, reglas de suscripción/decisión, cálculo de prima. Candidatas a *table-driven tests* dado que son reglas de negocio con muchas combinaciones de entrada.
- **Integración entre microservicios / contract testing**: contratos entre cada BFF y los microservicios que consume, y entre el API Gateway y cada BFF (p. ej. con Pact o un esquema OpenAPI/GraphQL versionado validado en CI). Justificación: con 3 canales y BFFs independientes, un cambio de contrato en un microservicio de negocio puede romper un canal sin que se note hasta producción si no hay contract testing automatizado.
- **Contrato de eventos (Event Bus)**: validación de esquema para cada evento de dominio (`UserRegistered`, `DocUploaded`, `PolicyIssued`, `ClaimApproved`, `PaymentConfirmed`) antes de publicar en Pub/Sub, más pruebas de consumidor que verifiquen que Auditoría/Notificaciones/Analítica/Antifraude toleran campos nuevos (compatibilidad hacia adelante). Justificación: un evento mal formado no falla de forma visible para el usuario — falla en silencio para 3-4 consumidores distintos a la vez.
- **Resiliencia (Circuit Breaker/Retry)**: los mismos artefactos construidos para el [Experimento 1](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/#experimento-1--aislamiento-de-fallas-externas-vía-circuit-breaker--retry-en-acl-workers) (stub de KYC con inyección de fallas + guiones de carga en k6) se reutilizan como **suite de regresión**, no solo como experimento de una sola vez: correrla en cada cambio al ACL Worker para evitar que una modificación futura reintroduzca el acoplamiento con la disponibilidad del proveedor externo.
- **Consistencia eventual**: igual que el punto anterior, el instrumental del [Experimento 2](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/#experimento-2--ventana-de-consistencia-eventual-de-la-réplica-de-lectura-de-riesgo-bajo-carga-concurrente) (medición de lag de oplog) se convierte en una prueba de regresión que corre periódicamente contra el ambiente de pruebas, con alerta si el lag supera el umbral acordado.
- **E2E de flujos críticos**: cotizar → suscribir → emitir póliza → cobrar; reportar siniestro → peritaje → indemnizar → pagar (incluido el camino 100% automático del pago paramétrico disparado por IoT, sin intervención humana — este último requiere un mock del proveedor de telemetría/IoT para no depender de clima o vuelos reales en el ambiente de pruebas).
- **Seguridad**: pruebas de que el API Gateway aplica JWT y *rate limiting* por socio (no solo por IP), y pruebas de configuración de infraestructura (no solo de código) que verifiquen que la subnet de datos (Cloud SQL, MongoDB Atlas, GCS, Redis) permanece sin ruta a Internet — esto se puede automatizar como parte del pipeline de Terraform/IaC (`Cloud Build`) en vez de dejarlo como revisión manual.
- **Móvil** (marcado explícitamente por el curso como fuente de retraso): pruebas de sincronización offline de la Billetera de Pólizas ante pérdida y recuperación de conectividad, y pruebas en dispositivo/emulador real (no solo simulador) para las funcionalidades que dependen de hardware — cámara y geolocalización en el registro de siniestros.

## Registro de cambios respecto a la versión anterior

_Pendiente de completar por el equipo una vez se localice el documento de la entrega anterior — plantilla lista para usar:_

| Se agrega | Se cambia | Se elimina |
|---|---|---|
| Pruebas de contrato de eventos (Event Bus) | _(completar)_ | _(completar)_ |
| Pruebas de resiliencia del Circuit Breaker (reutilizando Experimento 1) | | |
| Pruebas de staleness de la réplica de Riesgo (reutilizando Experimento 2) | | |
| Pruebas de aislamiento de red de la subnet de datos vía IaC | | |

## Checklist

- [ ] **Ubicar la estrategia de pruebas de la entrega anterior y fusionarla con este documento** (ver nota de supuesto al inicio)
- [x] Identificar qué cambió en la arquitectura esta semana y qué implica para las pruebas
- [x] Definir niveles y técnicas de prueba refinados, ligados a los patrones/tácticas de [1.2](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/) y a los experimentos de [1.3](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)
- [ ] Completar la tabla de "se agrega / se cambia / se elimina" contra la versión real anterior
- [ ] Verificar que el refinamiento quede también mencionado en el [video de evidencias](../04-video-evidencias/)
