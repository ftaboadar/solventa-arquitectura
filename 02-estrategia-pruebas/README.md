# 2. Refinamiento estrategia de pruebas (2 pts)

> ℹ️ **Nota de alcance**: "Refinamiento" es el nombre que el rubric del curso le da a esta línea todas las semanas (porque en semanas futuras sí se vuelve a revisar) — **no implica que deba existir obligatoriamente una entrega previa de estrategia de pruebas**. El equipo confirmó que no hay una versión anterior formal. Este documento es entonces la **v1.0**: la primera versión formal de la estrategia de pruebas de Solventa, con el nivel de detalle que ya permite la arquitectura de esta semana (1.1, 1.2, 1.3). Queda lista para entregar tal cual — no depende de localizar ningún archivo previo. Si en una semana futura aparece contenido de pruebas de una entrega anterior a esta, se puede fusionar entonces contra esta v1.0.

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (31).txt` y de la sesión en vivo (`utils/MISW4501-202614-S4C1-es-ES.vtt`, min. ~20:00).

- El refinamiento **es iterativo cada semana**: no se hace una vez y se cierra. Cada semana que avanza el diseño de arquitectura, se revisa de nuevo la estrategia de pruebas para incorporar el detalle que antes no era visible.
- Advertencia explícita del curso: **las pruebas** (junto con la parte móvil) son la actividad que **más retrasa** a los equipos en el Proyecto Final II. Dejar la tecnología y técnica de pruebas bien definida desde ahora reduce ese riesgo.
- No se espera una estrategia "cerrada": se espera evidencia de que se revisó contra el estado actual del diseño y se ajustó donde aplicaba.

---

## Qué hizo posible este nivel de detalle

Al definir el backlog y los atributos de calidad (semanas anteriores) todavía no existían decisiones de arquitectura concretas sobre las que diseñar pruebas específicas — solo se sabía *qué* debía cumplirse (los 6 atributos de calidad del caso), no *cómo* se iba a construir. La arquitectura de esta semana ([1.1](../01-hoja-de-trabajo/01-modelos-arquitectura/), [1.2](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/), [1.3](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)) hizo explícitos los elementos que ahora sí se pueden probar de forma concreta:

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
- **E2E de flujos críticos**: cotizar → suscribir → emitir póliza → cobrar (**KAN-26**: verificar no repudio de la firma electrónica); reportar siniestro → peritaje → indemnizar → pagar (**KAN-27**: expediente con evidencia geoetiquetada visible para el operador); pago paramétrico 100% automático disparado por IoT sin intervención humana (**KAN-38**: requiere mock del proveedor de telemetría/IoT para no depender de clima o vuelos reales en el ambiente de pruebas).
- **Seguridad**: JWT + *rate limiting* por socio en el API Gateway (**KAN-30**); verificación de que el flujo de pago **nunca** persiste datos de tarjeta en servidores propios, solo tokens del proveedor PCI-DSS (**KAN-28** — candidata a prueba de contrato/esquema que falle el build si aparece un campo tipo número de tarjeta en un modelo interno); pruebas de configuración de infraestructura (no solo de código) que verifiquen que la subnet de datos permanece sin ruta a Internet — automatizable en el pipeline de Terraform/IaC (`Cloud Build`).
- **Biometría/dispositivo** (**KAN-31** onboarding, **KAN-32** autenticación nativa): pruebas de que la biometría se valida contra el hardware seguro del teléfono (Keystore/Keychain) y no se transmite el dato biométrico crudo fuera del dispositivo — relevante porque un fallo aquí es un incidente de seguridad, no solo un bug funcional.
- **Móvil** (marcado explícitamente por el curso como fuente de retraso): sincronización offline de la Billetera de Pólizas ante pérdida y recuperación de conectividad (**KAN-33**), y pruebas en dispositivo/emulador real (no solo simulador) para cámara + GPS embebido en evidencia de siniestros (**KAN-35**) y geolocalización de prestadores (**KAN-36**).

## Historial de versiones

| Versión | Semana | Qué se agregó |
|---|---|---|
| **v1.0** (esta entrega) | Semana 4-5 | Primera versión formal: niveles y técnicas de prueba ligados a los patrones de [1.2](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/) y a los 2 experimentos de [1.3](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/). |
| v1.1 (próxima refinamiento) | — | _(a completar la próxima vez que se revise esta estrategia — qué se agrega/cambia/elimina respecto a v1.0)_ |

## Checklist

- [x] Identificar qué elementos de la arquitectura de esta semana requieren pruebas específicas
- [x] Definir niveles y técnicas de prueba, ligados a los patrones/tácticas de [1.2](../01-hoja-de-trabajo/02-diseno-detallado-arquitectura/) y a los experimentos de [1.3](../01-hoja-de-trabajo/03-diseno-experimento-arquitectura/)
- [x] Documento listo como v1.0 — no depende de ninguna entrega anterior
- [ ] Verificar que el refinamiento quede también mencionado en el [video de evidencias](../04-video-evidencias/)
