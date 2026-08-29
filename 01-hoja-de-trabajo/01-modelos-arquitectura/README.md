# 1.1 Modelos de arquitectura (20 pts)

Cuatro vistas del sistema **Solventa**, organizadas de lo general a lo específico. Las tres primeras (contexto, componentes, despliegue) ya existían; la vista de información se desarrolló en esta pasada porque era la única de las 3 vistas mínimas que exige el curso que aún no existía como artefacto propio.

## Inventario

| Archivo | Vista | Herramienta |
|---|---|---|
| [`1.Diagrama_Contexto.puml`](1.Diagrama_Contexto.puml) | Contexto del sistema (C4 Nivel 1) | PlantUML |
| [`4.1.Diagrama_Componentes.drawio`](4.1.Diagrama_Componentes.drawio) | Componentes y conectores (vista funcional) — incluye Circuit Breaker/Retry en ACL y leyenda de los 9 patrones de diseño con su ubicación | draw.io |
| [`4.2.Diagrama_Despliegue.drawio`](4.2.Diagrama_Despliegue.drawio) | Despliegue en infraestructura | draw.io |
| [`3.Vista_Informacion.puml`](3.Vista_Informacion.puml) | Información: entidades, propiedad de datos, replicación | PlantUML |

> Los archivos `.drawio` se abren en [app.diagrams.net](https://app.diagrams.net) o en la extensión draw.io de VS Code. Los `.puml` se renderizan con PlantUML (extensión de VS Code, plugin de IntelliJ, o `plantuml -tpng archivo.puml`). **Nota**: si se renderiza por línea de comandos con el `.jar` de PlantUML, usar `-charset UTF-8` (y `-Dfile.encoding=UTF-8` en la JVM) — sin eso, las tildes/eñes de estos archivos se corrompen en el PNG resultante.

---

## 1. Diagrama de contexto

Ubica a Solventa frente a sus actores y sistemas externos:

- **Actores**: cliente asegurado (web/móvil), asesores de venta asistida, socios de distribución (bancos, aerolíneas, fintech vía API embebida), áreas internas (actuaría, CISO, cumplimiento).
- **Fuentes de datos externas**: Open Finance, Open Data, Telemetría/IoT (clima, movilidad, vuelos — dispara pagos paramétricos).
- **Servicios operacionales**: proveedor KYC/AML, pasarelas de pago, firma electrónica y notificaciones, red de peritos/talleres/prestadores.
- **Gobierno y norma**: reaseguradoras, Superintendencia Financiera, estándares ACORD, sistemas analíticos/BI y de modelos de fraude.

**Razonamiento**: se eligió el nivel de Contexto (C4 Nivel 1) como punto de partida porque Solventa tiene un número inusualmente alto de dependencias externas regulatorias y de datos (KYC, Open Finance, reaseguradoras, IoT) para un producto de seguros — antes de discutir cualquier decisión interna, era necesario dejar explícito qué está dentro del límite del sistema y qué es una integración de terceros, porque varias decisiones de [1.2](../02-diseno-detallado-arquitectura/) (ACL, Circuit Breaker) existen precisamente para gestionar esa frontera.

## 2. Diagrama de componentes y conectores (vista funcional)

Organizado en 7 capas horizontales:

1. **UI**: Portal SPA web, App móvil (nativa/PWA) y motor headless de seguros embebidos B2B.
2. **Orquestación**: API Gateway/WAF, BFF Web (GraphQL), BFF Móvil (GraphQL/REST + sync offline), API REST B2B, servidor WebSocket para push en tiempo real.
3. **Microservicios de negocio (Core)**, en dos dominios:
   - *Producto y Riesgo*: Identidad y Consentimiento, Riesgo y Perfilamiento, Cotización y Rating Actuarial, Suscripción y Decisión.
   - *Pólizas y Operaciones*: Gestión de Pólizas, Siniestros y Peritaje, Pagos e Idempotencia.
4. **Datos y persistencia**: PostgreSQL (Identidad; Pólizas y Pagos), MongoDB primaria + réplica de lectura (Riesgo, consistencia eventual), MongoDB (Siniestros), Amazon S3/Blob (multimedia), Redis (caché distribuida).
5. **Servicios transversales**: Event Bus (Kafka/EventBridge), Motor Antifraude (ML), Digitalización/OCR, Auditoría inmutable (append-only), Analítica/BI, Notificaciones (push/SMS/email), Bodega de datos/Data Lake.
6. **Integración (ACL)**: colas de integración + workers/adaptadores anti-corrupción hacia el exterior.
7. **Integraciones externas**: KYC, pasarelas de pago, firma electrónica, telemetría/IoT, reaseguradoras/ACORD, Open Finance/Open Data.

Convenciones del diagrama: flujos síncronos (REST/GraphQL) en flecha continua, asíncronos/eventos en flecha punteada, request/reply asíncrono en flecha bidireccional punteada. El diagrama trae además una **leyenda de patrones de diseño** (sección 4 de las convenciones) que mapea cada uno de los 9 patrones documentados en [1.2](../02-diseno-detallado-arquitectura/) a su ubicación exacta — incluida la Saga coreografiada, que antes solo era visible como líneas punteadas sin nombrar el patrón.

**Razonamiento**: la decisión de organizar por capas horizontales (en vez de, por ejemplo, un diagrama de contenedores C4 Nivel 2 más plano) responde a que Solventa tiene responsabilidades transversales claramente diferenciadas por capa (orquestación de canal, negocio, datos, integración) que se corresponden 1:1 con los patrones documentados en [1.2](../02-diseno-detallado-arquitectura/) — BFF vive en la capa de orquestación, ACL en la capa de integración, etc. — lo que hace que el diagrama sirva directamente como mapa de dónde aplica cada patrón, sin tener que cruzarlo con otro documento.

## 3. Diagrama de despliegue

Infraestructura principal en **GCP región us-central1**, con dependencias puntuales en AWS y Firebase:

- **Edge (subnet pública)**: Cloud DNS, Cloud CDN, Cloud Armor (WAF/anti-DDoS), Cloud Load Balancer global multi-zona, Cloud Endpoints (API Gateway + JWT + rate limit).
- **Capa de aplicación (VPC privada)**: microservicios como Cloud Run (BFF GraphQL, AUTH, RISK, RATING, UNDER, POLICY, CLAIMS, PAYMENTS, NOTIFY, AUDIT, ACL Workers, API REST B2B), GKE Autopilot para el servidor WebSocket, Vertex AI (antifraude), Document AI (OCR), BigQuery + Looker (analítica), Cloud Pub/Sub (event bus) y Cloud Tasks (colas).
- **Subnet aislada de datos (sin ruta a Internet)**: Cloud SQL PostgreSQL con réplica HA multi-zona (failover ~60s), MongoDB Atlas (SSL, VPC allowlist), Cloud Storage (GCS), Memorystore Redis.
- **Seguridad y observabilidad**: Cloud KMS, Secret Manager, Cloud Monitoring, Cloud Build (CI/CD + Terraform IaC).
- **Fuera de GCP**: AWS SNS (fan-out push Android), Firebase FCM + Play Store (distribución app), e integraciones externas por Internet público (KYC, Open Finance, pasarela de pago, firma electrónica, reaseguradoras, IoT/MQTT).

**Razonamiento**: ver [ADR-04](../02-diseno-detallado-arquitectura/#adr-04--gcp-como-nube-principal-con-aws-acotado-a-un-único-propósito) y [ADR-05](../02-diseno-detallado-arquitectura/#adr-05--cloud-run-como-cómputo-por-defecto-gke-autopilot-solo-para-el-websocket) en 1.2: GCP se eligió como nube única para simplificar operación, con AWS acotado a un solo propósito (push Android vía SNS) en vez de una estrategia multi-cloud real; Cloud Run como cómputo por defecto y GKE solo para el caso que genuinamente lo necesita (WebSocket persistente).

## 4. Vista de información

> Nueva en esta pasada — antes solo existía implícita en la capa 4 del diagrama de componentes, sin explicar propiedad de datos ni decisiones de replicación.

Ver [`3.Vista_Informacion.puml`](3.Vista_Informacion.puml). Cubre, por cada almacén de datos: qué entidades contiene, qué microservicio es su único escritor, quién lo lee, y si hay replicación/caché derivada.

| Almacén | Entidades | Escritor único | Lectores | Replicación/particionamiento |
|---|---|---|---|---|
| PostgreSQL — Identidad | Usuario, Consentimiento, SesiónAuth | AUTH | AUTH | HA multi-zona (failover ~60s), sin réplica de lectura — se prioriza consistencia fuerte sobre latencia de lectura. |
| MongoDB — Riesgo (primaria) | PerfilRiesgo, SeñalOpenFinance, SeñalIoT | RISK | RISK | Réplica de lectura asíncrona consumida por RATING/UNDER — ver [Experimento 2](../03-diseno-experimento-arquitectura/#experimento-2--ventana-de-consistencia-eventual-de-la-réplica-de-lectura-de-riesgo-bajo-carga-concurrente). |
| PostgreSQL — Pólizas y Pagos | Póliza, Cobertura, Pago, Recibo | POLICY, PAYMENTS | POLICY, PAYMENTS, CLAIMS (consulta cobertura) | ACID; ambos servicios comparten el mismo almacén porque Pólizas y Pagos están en el mismo bounded context transaccional. |
| MongoDB — Siniestros | Siniestro, EvidenciaMetadata | CLAIMS | CLAIMS | Particionado aparte de Riesgo pese a ser el mismo motor (MongoDB), porque el patrón de acceso y el ciclo de vida del dato son distintos (siniestros crecen por evento, riesgo por perfil). |
| GCS/S3 — Multimedia | ArchivoMultimedia (fotos/video de siniestros, documentos firmados) | CLAIMS (y Firma electrónica vía ACL) | CLAIMS | Separado de las bases documentales/relacionales por tamaño y patrón de acceso binario, distinto al de datos estructurados. |
| Redis — Caché | TokenSesión, ScoreCacheado, CatálogoRápido | AUTH, RISK (según la clave) | AUTH, RISK, RATING | **Derivada, no es fuente de verdad**: todo lo que hay en Redis se puede reconstruir desde las bases transaccionales o recalcularse; su pérdida degrada rendimiento, no integridad. |
| Data Lake / BigQuery | EventoHistórico | Event Bus (consumidor asíncrono) | Analítica/BI, Motor Antifraude | Append-only, alimentado async para no competir por recursos con el tráfico transaccional; preserva histórico incluso si las bases operacionales depuran datos antiguos. |

**Decisiones de particionamiento/replicación explícitas** (más allá de lo que ya dice la tabla):

- **Base de datos por dominio (database-per-bounded-context)**: ningún dominio comparte tablas/colecciones directamente con otro — la única forma de comunicación entre dominios es vía API síncrona o evento asíncrono, nunca vía *join* directo entre bases. Esto es lo que permite que cada microservicio evolucione su esquema sin coordinar con los demás.
- **Replicación asimétrica**: solo Riesgo tiene réplica de lectura dedicada; Identidad y Pólizas/Pagos no. La asimetría es deliberada — Riesgo tiene un patrón de lectura repetida durante la sesión de cotización que justifica pagar el costo de una réplica adicional; Identidad y Pólizas priorizan consistencia fuerte inmediata (login, estado de póliza) sobre esa optimización.
- **HA para disponibilidad ≠ réplica para lectura**: Cloud SQL replica para *failover* (disponibilidad), no se lee desde la réplica; MongoDB en Riesgo replica explícitamente *para* servir lecturas. Son dos motivaciones distintas aunque el mecanismo (réplica) se parezca.

**Razonamiento**: se construyó esta vista porque el curso la exige como mínimo y porque, sin ella, las decisiones de particionamiento y replicación que ya estaban *dibujadas* en el diagrama de componentes (p. ej. "Escritor único: RISK") quedaban sin explicar el "por qué" — que es justo el criterio que más pesa según la guía del curso (ver más abajo).

---

## Qué exige el curso para esta sección

> Guía tomada de la sesión en vivo de la semana 4 (`utils/MISW4501-202614-S4C1-es-ES.vtt`) y del resumen de esa misma semana (`utils/subtitle (31).txt`).

- El mínimo exigido son **tres vistas**: funcional (modelos de componentes — cubierta por `4.1`), de despliegue (cubierta por `4.2`) y **de información** (cubierta ahora por `3.Vista_Informacion.puml`).
- "Esos son los mínimos, no se limiten": si se necesitan más vistas para explicar un ASR (Architecturally Significant Requirement), se deben agregar — no hay techo.
- Cada modelo debe ir acompañado del **razonamiento** (por qué este estilo, por qué esta decisión) — el modelo solo no basta para la nota; ese razonamiento es justamente lo que se explica en el [video de evidencias](../../04-video-evidencias/).
- Esta arquitectura **no es desechable**: es la misma que se implementará en el Proyecto Final II (solo se permiten ajustes menores), así que debe quedar en su "mejor versión", no en el mínimo viable.

### ¿Falta alguna vista adicional?

Con las 4 vistas actuales (contexto, funcional, despliegue, información) se cubren los 3 mínimos exigidos por el curso más el contexto de negocio. No se identifica, con la información disponible en este repositorio, un ASR que quede sin explicar con estas 4 — la única vista candidata a agregar más adelante sería una **vista de procesos** puntual para el flujo de la Saga coreografiada (2.7 en 1.2) si, al ejecutar el [Experimento 1.3](../03-diseno-experimento-arquitectura/), resulta que el manejo de compensación ante fallas parciales necesita explicarse con un diagrama de secuencia dedicado. Queda como decisión abierta del equipo, no como pendiente obligatorio.

## Consistencia de nombres entre vistas

Los tres diagramas técnicos (`4.1`, `4.2`, `3.Vista_Informacion`) nombran los mismos microservicios de forma distinta (nombre de negocio vs. identificador técnico). Tabla de equivalencia para evitar confusión al leerlos en paralelo:

| Nombre de negocio (`4.1`) | Identificador técnico (`4.2`, `3.Vista_Informacion`) |
|---|---|
| Identidad y Consentimiento | `AUTH` / `CR_AUTH` |
| Riesgo y Perfilamiento | `RISK` / `CR_RISK` |
| Cotización y Rating Actuarial | `RATING` / `CR_RATING` |
| Suscripción y Decisión | `UNDER` / `CR_UNDER` |
| Gestión de Pólizas | `POLICY` / `CR_POLICY` |
| Siniestros y Peritaje | `CLAIMS` / `CR_CLAIMS` |
| Pagos e Idempotencia | `PAYMENTS` / `CR_PAYMENTS` |
| Auditoría Inmutable | `AUDIT` / `CR_AUDIT` |
| Workers y Adaptadores (ACL) | `ACL Workers` / `CR_ACL` |
| BFF Web | `CR_GRAPHQL` |
| Servidor WebSocket | `GKE_WS` |
| API REST B2B | `CR_B2B` |

## Checklist

- [x] Elaborar la vista de información (modelos de datos + flujos + decisiones de particionamiento/replicación)
- [x] Redactar el razonamiento de cada vista existente
- [x] Confirmar si falta alguna vista adicional (resuelto: no obligatoria, candidata puntual identificada)
- [x] Resolver consistencia de nombres entre vistas (tabla de equivalencia)
- [x] Renderizar `3.Vista_Informacion.puml` y verificar visualmente que no haya solapamientos (validado con PlantUML `-charset UTF-8`; el archivo trae tildes, así que renderizar siempre indicando ese charset o los caracteres especiales se corrompen)
