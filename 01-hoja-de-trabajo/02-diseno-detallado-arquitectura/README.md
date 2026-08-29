# 1.2 Diseño detallado de arquitectura (30 pts)

Esta sección documenta, con el razonamiento explícito que exige el curso, los patrones y tácticas arquitectónicas que sustentan las decisiones visibles en [`01-modelos-arquitectura/`](../01-modelos-arquitectura/) (diagrama de contexto, componentes y despliegue).

> ⚠️ **Supuesto a validar por el equipo**: los diagramas existentes no traen adjunto el backlog de atributos de calidad / ASRs priorizados en semanas anteriores. Los ASRs usados aquí para justificar cada táctica se **infirieron del dominio (seguros digitales + finanzas abiertas, regulado por la Superintendencia Financiera) y de lo que ya está resuelto en los diagramas** (réplicas HA, WAF, ACL, Event Bus, etc.). Antes de entregar, contrastar la sección 5 (Trazabilidad) contra el backlog real de atributos de calidad del equipo y ajustar prioridades/nombres si difieren.

## Qué exige el curso para esta sección

> Guía tomada de la sesión en vivo de la semana 4 (`utils/MISW4501-202614-S4C1-es-ES.vtt`) y del resumen de esa semana (`utils/subtitle (31).txt`).

El flujo esperado es: **1) elegir un estilo de arquitectura → 2) aplicar tácticas de arquitectura → 3) hacer el diseño detallado de esas tácticas**, de forma que cada ASR quede cada vez más cerca de su solución concreta. No basta con nombrar el patrón: hay que explicar por qué se escogió, qué alternativas se descartaron y por qué — ese razonamiento se documenta aquí **y** se explica verbalmente en el [video de evidencias](../../04-video-evidencias/).

---

## 1. Estilo de arquitectura base

Solventa adopta un **estilo de microservicios orientado a dominio**, organizado en capas (`4.1.Diagrama_Componentes.drawio`): UI → Orquestación (BFF/API Gateway) → Microservicios de negocio (Producto/Riesgo y Pólizas/Operaciones) → Datos → Servicios transversales → Integración (ACL) → Externos. La comunicación es **híbrida**: síncrona (REST/GraphQL) para el camino crítico de usuario, y asíncrona (Event Bus) para efectos colaterales y desacoplamiento de dominios.

**Por qué este estilo y no otros:**

- **Vs. monolito modular**: Solventa integra múltiples canales (web, móvil, B2B embebido) con ritmos de cambio y escalado muy distintos (ej. el motor de cotización B2B necesita picos de escala independientes del módulo de siniestros). Un monolito acoplaría el despliegue de todos los dominios a un mismo ciclo de release, lo cual es inaceptable dado que Suscripción, Pagos y Siniestros tienen SLAs y cargas regulatorias distintas.
- **Vs. microservicios 100% síncronos (sin Event Bus)**: el flujo cotización → suscripción → póliza → pago involucra pasos que no deben bloquear la respuesta al usuario (auditoría, antifraude, notificaciones, analítica). Encadenar todo síncronamente alargaría la latencia percibida y crearía una cadena de fallas frágil (si Notificaciones cae, no debería bloquear la emisión de la póliza).

## 2. Catálogo de patrones

### 2.1 Backend for Frontend (BFF)

- **Problema que resuelve**: cada canal (web, móvil, B2B) tiene necesidades de datos y protocolo distintas — la web necesita queries flexibles (GraphQL), el móvil necesita sincronización offline y payloads livianos, el canal B2B necesita un contrato REST estable para integrarse en el checkout de un socio.
- **Dónde se aplica**: `BFF Web` (GraphQL + resolutor i18n) y `BFF Móvil` (GraphQL/REST + sync offline), como componentes independientes detrás del API Gateway (`4.1`, capa 2; `CR_GRAPHQL` en `4.2`).
- **Alternativa descartada**: una única API genérica para todos los canales. Se descartó porque forzaría a móvil a cargar con contratos pensados para web (mayor payload, sin soporte offline) y acoplaría la evolución de un canal a los otros.

### 2.2 API Gateway

- **Problema que resuelve**: centralizar autenticación (JWT), *rate limiting* diferenciado por socio/canal, y enrutamiento, sin duplicar esa lógica en cada microservicio.
- **Dónde se aplica**: `API Gateway / WAF` (capa 2 de `4.1`) implementado como `Cloud Endpoints` en `4.2`, único punto de entrada hacia BFF Web, BFF Móvil, API REST B2B y el servidor WebSocket.
- **Alternativa descartada**: exponer cada microservicio directamente a Internet. Se descartó por superficie de ataque (cada servicio tendría que reimplementar auth/cuotas) y porque los socios B2B necesitan cuotas y contratos distintos a los de un cliente final — eso solo es manejable centralizado.

### 2.3 Anti-Corruption Layer (ACL)

- **Problema que resuelve**: los proveedores externos (KYC/Truora-Jumio, pasarela de pago, firma electrónica/DocuSign, reaseguradoras vía ACORD XML, Open Finance) exponen modelos y formatos propios (p. ej. XML ACORD) que, si se consumen directamente en el dominio, contaminarían el modelo de negocio interno y acoplarían Solventa a la forma en que cada proveedor cambie su API.
- **Dónde se aplica**: capa 6 (`Colas de Integración` + `Workers y Adaptadores (ACL)`) en `4.1`, desplegada como `CR_ACL` en `4.2`, entre el Core de negocio y la capa 7 de integraciones externas.
- **Alternativa descartada**: que cada microservicio de negocio (p. ej. Suscripción) llame directamente a la API del proveedor externo. Se descartó porque un cambio de proveedor (p. ej. cambiar de pasarela de pago) implicaría tocar código de dominio en vez de solo el adaptador correspondiente.

### 2.4 Event-Driven Architecture (Event Bus)

- **Problema que resuelve**: desacoplar el camino crítico (cotizar → suscribir → emitir póliza / pagar → aprobar siniestro) de efectos colaterales que no deben bloquear la respuesta al usuario: antifraude, auditoría inmutable, analítica/BI, notificaciones.
- **Dónde se aplica**: `Event Bus Broker` (capa 5 de `4.1`, Kafka/EventBridge) implementado como `Cloud Pub/Sub` en `4.2`. Eventos identificados en el diagrama: `UserRegistered`, `DocUploaded`, `PolicyIssued`, `ClaimApproved`, `PaymentConfirmed`.
- **Alternativa descartada**: orquestación síncrona centralizada (un servicio que llama uno por uno a antifraude, auditoría, notificaciones). Se descartó porque cualquier consumidor lento o caído (p. ej. el motor de BI) degradaría la latencia de emisión de pólizas, que es el flujo con mayor impacto en conversión de negocio.

### 2.5 Vista de lectura desacoplada (patrón CQRS-like) en el dominio de Riesgo

- **Problema que resuelve**: el perfilamiento de riesgo (escritura) y la cotización (lectura intensiva y repetida por el mismo usuario mientras ajusta coberturas) tienen perfiles de carga distintos; forzar ambos a golpear la misma instancia de escritura degrada la latencia de cotización.
- **Dónde se aplica**: `MongoDB (Primaria) — Escritor único: RISK` + `MongoDB (Réplica de Lectura) — consistencia eventual`, consumida por `RATING` (capa 4 de `4.1`; `MONGOATLAS` en `4.2`).
- **Alternativa descartada**: un único MongoDB atendiendo lecturas y escrituras. Se descartó porque el pico de lecturas de RATING durante la sesión de cotización de un usuario competiría por recursos con las escrituras de perfilamiento de RISK, que son más costosas (agregan señales de Open Finance/Open Data/IoT).

### 2.6 Circuit Breaker / Retry hacia proveedores externos

- **Problema que resuelve**: los proveedores externos (KYC, pasarela de pago, firma electrónica, reaseguradoras) están fuera del control de Solventa y pueden fallar o degradarse; sin aislamiento, una falla de KYC podría tumbar todo el flujo de onboarding/suscripción.
- **Dónde se aplica**: se propone formalizar esta táctica dentro de los `Workers y Adaptadores (ACL)` (capa 6 de `4.1` / `CR_ACL` en `4.2`), que ya son el único punto por donde pasa el tráfico saliente hacia KYC, Open Finance, pasarela de pago, firma electrónica y ACORD.
- **Estado actual en los diagramas**: ya formalizado en `4.1.Diagrama_Componentes.drawio` — el bloque `Workers y Adaptadores (ACL)` incluye ahora la etiqueta "Circuit Breaker + Retry (aislamiento de fallas externas)" junto a `REST KYC`, `REST Open Finance`, `REST Pasarela`, etc. Se valida en detalle en el [Experimento 1](../03-diseno-experimento-arquitectura/#experimento-1--aislamiento-de-fallas-externas-vía-circuit-breaker--retry-en-acl-workers) de la sección 1.3.
- **Alternativa descartada**: reintentos ilimitados sin corte (retry infinito). Se descarta porque ante una caída prolongada de un proveedor generaría una acumulación de reintentos que satura la cola de integración.

### 2.7 Saga coreografiada para el flujo transaccional distribuido

- **Problema que resuelve**: el flujo cotización → suscripción → emisión de póliza → cobro (y, en paralelo, siniestro → peritaje → indemnización → pago) cruza varios microservicios y bases de datos distintas (PostgreSQL de Identidad/Pólizas/Pagos, MongoDB de Riesgo/Siniestros); no puede resolverse con una transacción ACID única.
- **Dónde se aplica**: la secuencia de eventos `PolicyIssued` → consumido por Notificaciones/Auditoría, y `ClaimApproved`/`DocUploaded` → `PaymentConfirmed` (capa 5 de `4.1`) implementa una saga coreografiada (cada servicio reacciona a eventos del anterior, sin un orquestador central).
- **Alternativa descartada**: un orquestador central de saga (Saga Orchestrator) explícito. Se descartó de entrada por simplicidad — con el número de pasos actual, la coreografía vía Event Bus es suficiente y evita un nuevo punto único de fallo — pero **debe reevaluarse** si el flujo de indemnización gana más pasos condicionales (candidato a revisar en semana 5).

### 2.8 Cache-Aside con Redis

- **Problema que resuelve**: evitar recalcular o releer de base de datos transaccional información de acceso frecuente y relativamente estable durante una sesión (score de riesgo precalculado, catálogo rápido de productos, token de sesión).
- **Dónde se aplica**: `Redis Caché (Distribuida)` (capa 4 de `4.1`), implementado como `Memorystore Redis <1ms` en `4.2`, consumido por AUTH (token de sesión), RISK (score precalculado) y BFF (catálogo rápido).

### 2.9 Componente dedicado para conexiones persistentes (WebSocket en GKE)

- **Problema que resuelve**: Cloud Run está optimizado para peticiones request/response de corta duración; las alertas en tiempo real (RT) requieren conexiones WebSocket persistentes con un modelo de escalado distinto.
- **Dónde se aplica**: `Servidor WebSocket` (capa 2 de `4.1`) se despliega separado del resto en `GKE Autopilot` (`GKE_WS` en `4.2`), en vez de como un Cloud Run más.
- **Alternativa descartada**: manejar WebSocket dentro de un Cloud Run compartido con el BFF. Se descartó porque el modelo de facturación/escalado de Cloud Run por request no es eficiente para conexiones de larga duración, y mezclar ambos hubiera acoplado el escalado de las alertas RT al del tráfico REST/GraphQL normal.

---

## 3. Tácticas por atributo de calidad

| Atributo de calidad | Táctica | Implementación en Solventa |
|---|---|---|
| **Disponibilidad** | Detección de fallas (monitoreo activo) | Cloud Monitoring sobre cada servicio Cloud Run; API Gateway como punto de enrutamiento consciente del estado de salud. |
| **Disponibilidad** | Recuperación mediante redundancia pasiva (failover) | `Cloud SQL PostgreSQL [PRIMARY]` + `[STANDBY réplica HA]` en zonas distintas (`us-central1-a`/`b`), conmutación automática ~60s (`4.2`). |
| **Disponibilidad** | Redundancia activa multi-zona | `Cloud Load Balancer Global (Multi-Zona A/B/C)` en el edge (`4.2`). |
| **Disponibilidad** | Aislamiento de fallas externas | ACL Workers como único punto de contacto con proveedores externos, evitando que una falla de KYC/pasarela de pago se propague al Core (ver [2.6](#26-circuit-breaker--retry-hacia-proveedores-externos)). |
| **Rendimiento / Latencia** | Caché de lecturas frecuentes | Redis/Memorystore (<1ms) para token de sesión, score precalculado y catálogo rápido. |
| **Rendimiento / Latencia** | Réplica de lectura desacoplada | MongoDB réplica de lectura para Riesgo, consumida por Rating (ver [2.5](#25-vista-de-lectura-desacoplada-patrón-cqrs-like-en-el-dominio-de-riesgo)). |
| **Rendimiento / Latencia** | Contenido servido desde el borde | Cloud CDN para activos estáticos de la SPA y recursos de i18n. |
| **Rendimiento / Latencia** | Procesamiento asíncrono fuera del camino crítico | Antifraude (ML), OCR, auditoría, analítica y notificaciones se disparan vía Pub/Sub, no de forma síncrona dentro de la transacción de negocio. |
| **Escalabilidad / Elasticidad** | Cómputo serverless por microservicio | Cada microservicio de negocio corre en su propio Cloud Run, con escalado independiente (incluido *scale-to-zero*). |
| **Escalabilidad / Elasticidad** | Aislamiento de cargas con perfil distinto | WebSocket server en GKE Autopilot, separado del resto de servicios request/response (ver [2.9](#29-componente-dedicado-para-conexiones-persistentes-websocket-en-gke)). |
| **Seguridad** | Protección perimetral | Cloud Armor (WAF, anti-DDoS, bot management) delante del Load Balancer. |
| **Seguridad** | Cifrado en reposo | Cloud KMS (CMEK) sobre Cloud SQL y Cloud Storage. |
| **Seguridad** | Gestión de secretos | Secret Manager para credenciales/tokens consumidos por AUTH. |
| **Seguridad** | Autenticación y cuotas centralizadas | JWT + rate limiting por socio en el API Gateway (Cloud Endpoints). |
| **Seguridad** | Segmentación de red | Subnet de datos sin ruta a Internet (`4.2`, zona 3), aislando Cloud SQL/MongoDB Atlas/GCS/Redis del tráfico público. |
| **Interoperabilidad / Integrabilidad** | Adaptador anti-corrupción | ACL Workers traducen entre modelos externos (ACORD XML, formatos propietarios de KYC/pasarela/firma) y el modelo de dominio interno (ver [2.3](#23-anti-corruption-layer-acl)). |
| **Auditabilidad / Cumplimiento regulatorio** | Bitácora inmutable basada en eventos | Componente `Auditoría Inmutable (Append-Only Log)` suscrito a eventos de dominio (`UserRegistered`, `PolicyIssued`, `ClaimApproved`, `PaymentConfirmed`) vía Pub/Sub. |
| **Auditabilidad / Cumplimiento regulatorio** | Histórico consultable para reportes al regulador | `Bodega de Datos / Data Lake` + `BigQuery + Looker`, alimentado de forma asíncrona desde el Event Bus. |
| **Consistencia de datos** | Escritor único por agregado | RISK como único escritor del perfil de riesgo; RATING solo lee de la réplica (evita conflictos de escritura concurrente). |
| **Consistencia de datos** | Transacciones ACID dentro de un bounded context | PostgreSQL para Identidad y para Pólizas/Pagos, con las relaciones marcadas `ACID` en `4.1` (POLICY↔PostgreSQL, PAYMENTS↔PostgreSQL). |

---

## 4. Decisiones de arquitectura (ADR)

### ADR-01 — Microservicios por dominio + BFF, en vez de monolito modular

- **Contexto**: Solventa debe atender 3 canales (web, móvil, B2B embebido) con ritmos de cambio, SLA y perfiles de carga distintos, sobre dominios regulados (KYC, pagos, siniestros) con ciclos de auditoría independientes.
- **Decisión**: adoptar microservicios organizados por dominio (Identidad, Riesgo, Cotización, Suscripción, Pólizas, Siniestros, Pagos) con un BFF por canal.
- **Consecuencias**: mayor complejidad operativa (más servicios que desplegar/observar) a cambio de despliegue y escalado independientes por dominio y por canal. Requiere invertir en observabilidad (Cloud Monitoring) desde el día uno.

### ADR-02 — Persistencia poliglota por dominio

- **Contexto**: Identidad y Pólizas/Pagos requieren consistencia transaccional fuerte (saldos, estados de póliza); Riesgo y Siniestros manejan documentos semi-estructurados y de alto volumen de escritura (señales de Open Finance/IoT, evidencia multimedia).
- **Decisión**: PostgreSQL (Cloud SQL) para Identidad y para Pólizas/Pagos; MongoDB (Atlas) para Riesgo y Siniestros; S3/GCS para multimedia.
- **Consecuencias**: se gana el motor más adecuado por tipo de dato/carga, a cambio de operar dos tecnologías de base de datos distintas (dos runbooks, dos estrategias de backup/HA) y de tener que resolver consistencia entre dominios vía eventos en vez de vía FK/transacciones cruzadas.

### ADR-03 — Comunicación híbrida (síncrona + asíncrona) en vez de solo síncrona

- **Contexto**: el camino crítico de negocio (cotizar, suscribir, pagar) necesita respuesta rápida al usuario; efectos colaterales (antifraude, auditoría, notificaciones, analítica) no deben bloquear ese camino.
- **Decisión**: REST/GraphQL síncrono para el camino crítico; Event Bus (Pub/Sub) asíncrono para todo lo demás.
- **Consecuencias**: se gana resiliencia y latencia percibida menor, a cambio de tener que diseñar para consistencia eventual y manejar duplicados/orden de eventos en los consumidores (Auditoría, Analítica, Notificaciones).

### ADR-04 — GCP como nube principal, con AWS acotado a un único propósito

- **Contexto**: se necesita una nube principal que cubra cómputo serverless, bases de datos gestionadas, IA (antifraude/OCR) y observabilidad de forma integrada.
- **Decisión**: GCP (`us-central1`) como plataforma principal; AWS se usa exclusivamente para `SNS` (fan-out de push a Android), y Firebase (GCP) para `FCM`.
- **Consecuencias**: se simplifica la operación (una sola nube para el 95% del sistema) a cambio de una dependencia puntual y acoplada de un segundo proveedor para push — debe documentarse como riesgo/dependencia externa, no como estrategia multi-cloud real.

### ADR-05 — Cloud Run como cómputo por defecto; GKE Autopilot solo para el WebSocket

- **Contexto**: la mayoría de los microservicios son request/response sin estado; el servidor de alertas en tiempo real necesita conexiones persistentes.
- **Decisión**: todos los microservicios de negocio y BFFs en Cloud Run (serverless, escalado por request); el servidor WebSocket en GKE Autopilot.
- **Consecuencias**: se simplifica la operación del grueso del sistema (sin gestión de clúster) a cambio de mantener un clúster GKE (aunque Autopilot reduce esa carga) solo para el caso que realmente lo necesita.

---

## 5. Trazabilidad patrón/táctica → ASR

> Ver nota de supuestos al inicio de este documento: estos ASR se infirieron del dominio y de la arquitectura visible. **Ajustar contra el backlog real de atributos de calidad del equipo antes de entregar.**

| ASR (resumen) | Patrón/táctica que lo atiende | Componente(s) |
|---|---|---|
| El sistema debe seguir emitiendo pólizas aunque falle la base de datos primaria de Identidad/Pólizas | Failover automático de Cloud SQL (~60s) | `CLOUDSQL` / `CLOUDSQL_HA` |
| La caída de un proveedor externo (KYC, pasarela de pago) no debe tumbar el flujo de suscripción | ACL + Circuit Breaker/Retry (a formalizar) | `CR_ACL`, capa 6 y 7 de `4.1` |
| La cotización debe responder rápido incluso con muchos usuarios ajustando coberturas en simultáneo | Réplica de lectura MongoDB + caché Redis (score/catálogo) | `MONGOATLAS` réplica, `REDIS` |
| Los eventos de negocio (emisión de póliza, aprobación de siniestro, pago) deben quedar auditados de forma inmutable para reportes al regulador | Event-driven + Auditoría append-only + Data Lake/BigQuery | `PUBSUB` → `CR_AUDIT`, `BQ` |
| Los datos de un socio B2B no deben mezclarse ni exceder su cuota contratada | API Gateway con JWT + rate limiting por socio | `APIGW` |
| Los datos sensibles (identidad, pagos) deben protegerse en reposo y en tránsito | Cloud KMS (CMEK), Secret Manager, subnet de datos sin ruta a Internet, Cloud Armor | `KMS`, `SECRETS`, zona `Z3`, `WAF` |
| El pago paramétrico por evento IoT (clima/vuelos) debe dispararse automáticamente sin intervención manual | Event-driven (ingesta de evento paramétrico → apertura automática de siniestro → pago) | `EXT_IOT` → `QUEUE` → `PUBSUB` → `CR_CLAIMS` → `CR_PAYMENTS` |
| Las alertas en tiempo real al usuario no deben degradar el rendimiento del resto de la plataforma | Servicio WebSocket aislado en GKE Autopilot | `GKE_WS` |

---

## Checklist

- [x] Catálogo de patrones con problema, ubicación en Solventa y alternativas descartadas (sección 2)
- [x] Tácticas por atributo de calidad (sección 3)
- [x] ADRs de las decisiones clave (sección 4)
- [x] Trazabilidad patrón/táctica → ASR (sección 5)
- [ ] **Validar la sección 5 contra el backlog real de atributos de calidad/ASR del equipo** (ver nota de supuestos) y ajustar nombres/prioridades si difieren
- [x] Formalizar el Circuit Breaker/Retry (2.6) en el diagrama de componentes (`4.1`)
- [ ] Reevaluar la Saga coreografiada (2.7) si el flujo de indemnización gana más pasos condicionales (decisión abierta, no bloqueante para esta entrega)
- [ ] Verificar que el razonamiento de esta sección quede también explicado verbalmente en el [video de evidencias](../../04-video-evidencias/)
