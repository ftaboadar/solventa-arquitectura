# 1.1 Modelos de arquitectura (20 pts)

Tres vistas del sistema **Solventa**, organizadas de lo general a lo específico. Todas fueron elaboradas previamente y aquí solo se documentan y ordenan.

## Inventario

| Archivo | Vista | Herramienta |
|---|---|---|
| [`1.Diagrama_Contexto.puml`](1.Diagrama_Contexto.puml) | Contexto del sistema (C4 Nivel 1) | PlantUML |
| [`4.1.Diagrama_Componentes.drawio`](4.1.Diagrama_Componentes.drawio) | Componentes y conectores | draw.io |
| [`4.2.Diagrama_Despliegue.drawio`](4.2.Diagrama_Despliegue.drawio) | Despliegue en infraestructura | draw.io |

> Los archivos `.drawio` se abren en [app.diagrams.net](https://app.diagrams.net) o en la extensión draw.io de VS Code. El `.puml` se renderiza con PlantUML (extensión de VS Code, plugin de IntelliJ, o `plantuml -tpng archivo.puml`).

---

## 1. Diagrama de contexto

Ubica a Solventa frente a sus actores y sistemas externos:

- **Actores**: cliente asegurado (web/móvil), asesores de venta asistida, socios de distribución (bancos, aerolíneas, fintech vía API embebida), áreas internas (actuaría, CISO, cumplimiento).
- **Fuentes de datos externas**: Open Finance, Open Data, Telemetría/IoT (clima, movilidad, vuelos — dispara pagos paramétricos).
- **Servicios operacionales**: proveedor KYC/AML, pasarelas de pago, firma electrónica y notificaciones, red de peritos/talleres/prestadores.
- **Gobierno y norma**: reaseguradoras, Superintendencia Financiera, estándares ACORD, sistemas analíticos/BI y de modelos de fraude.

## 2. Diagrama de componentes y conectores

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

Convenciones del diagrama: flujos síncronos (REST/GraphQL) en flecha continua, asíncronos/eventos en flecha punteada, request/reply asíncrono en flecha bidireccional punteada.

## 3. Diagrama de despliegue

Infraestructura principal en **GCP región us-central1**, con dependencias puntuales en AWS y Firebase:

- **Edge (subnet pública)**: Cloud DNS, Cloud CDN, Cloud Armor (WAF/anti-DDoS), Cloud Load Balancer global multi-zona, Cloud Endpoints (API Gateway + JWT + rate limit).
- **Capa de aplicación (VPC privada)**: microservicios como Cloud Run (BFF GraphQL, AUTH, RISK, RATING, UNDER, POLICY, CLAIMS, PAYMENTS, NOTIFY, AUDIT, ACL Workers, API REST B2B), GKE Autopilot para el servidor WebSocket, Vertex AI (antifraude), Document AI (OCR), BigQuery + Looker (analítica), Cloud Pub/Sub (event bus) y Cloud Tasks (colas).
- **Subnet aislada de datos (sin ruta a Internet)**: Cloud SQL PostgreSQL con réplica HA multi-zona (failover ~60s), MongoDB Atlas (SSL, VPC allowlist), Cloud Storage (GCS), Memorystore Redis.
- **Seguridad y observabilidad**: Cloud KMS, Secret Manager, Cloud Monitoring, Cloud Build (CI/CD + Terraform IaC).
- **Fuera de GCP**: AWS SNS (fan-out push Android), Firebase FCM + Play Store (distribución app), e integraciones externas por Internet público (KYC, Open Finance, pasarela de pago, firma electrónica, reaseguradoras, IoT/MQTT).

---

## Pendiente por verificar

- [ ] Confirmar contra el enunciado del curso si se exige alguna vista adicional (p. ej. vista de procesos, vista de desarrollo, diagrama de contenedores C4 Nivel 2) que hoy no está cubierta por estos tres artefactos.
- [ ] Revisar consistencia de nombres entre las tres vistas (algunos componentes cambian de nombre entre el diagrama de componentes y el de despliegue, p. ej. "Cotización y Rating Actuarial" vs. `CR_RATING`).
