# Diseño y construcción de los experimentos de arquitectura de Solventa

> Este repo se acotó deliberadamente a solo esto: el diseño y la construcción de los 2 experimentos de arquitectura. El resto de la entrega de arquitectura de Solventa (vistas, patrones, estrategia de pruebas, plan de trabajo, video) vive fuera de este repo — aquí no se versiona para no perdernos entre carpetas que no son el objetivo de este espacio de trabajo.

Un experimento de arquitectura valida —con evidencia medible, no solo con argumentación— que una decisión de diseño cumple el atributo de calidad que promete. Esta sección diseña 2 experimentos completos para Solventa, tomando como puntos de partida dos puntos de incertidumbre ya identificados sobre los patrones de Circuit Breaker/Retry (KYC) y de réplica de lectura (Riesgo) del diseño detallado de arquitectura (patrones 2.5 y 2.6, documentados fuera de este repo).

> ⚠️ **Supuesto parcialmente resuelto**: el backlog real (`utils/Jira.xml`) solo identifica 2 personas del equipo por nombre — **Frans Taboada** (`f.taboada`, reporter de casi todas las historias) y **Daniel Felipe Urrego** (reporter de KAN-38, siniestro paramétrico) — el resto de historias están "sin asignar". La sección 9 de cada experimento ya usa estos 2 nombres donde hay una relación directa con la historia que motiva el experimento; los roles restantes siguen genéricos (Integrante C/D) porque no hay más nombres en el backlog — completar con el resto del equipo real. Los umbrales numéricos de los criterios de éxito (ms, %) siguen siendo valores de referencia razonables para el dominio — el backlog trae criterios de aceptación cualitativos ("en línea", "de forma inmediata") pero no SLAs numéricos, así que calibrarlos contra el SLA real del equipo sigue pendiente.

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (33).txt` (módulo específico sobre diseño del experimento) y de la discusión en vivo en `utils/MISW4501-202614-S4C1-es-ES.vtt` (min. ~2:00–16:00).

### Qué SÍ es un experimento válido

El experimento valida una **hipótesis de diseño**: una decisión de arquitectura sobre la que el equipo tiene incertidumbre real de si permitirá cumplir un requisito de calidad. Esa decisión crítica se llama el **punto de sensibilidad**.

> *"Si el punto de sensibilidad no genera incertidumbre en el equipo de arquitectura, no deberíamos experimentarlo."*

Ejemplo discutido en clase (válido): un equipo dudaba entre GCP y AWS, y entre distintas regiones/zonas de cada proveedor, para minimizar la latencia de un flujo crítico. Como **no sabían de antemano** cuál combinación era mejor, y no existía un benchmark público concluyente para su caso, el profesor lo validó como experimento legítimo: construir el mismo microservicio, desplegarlo en distintas regiones de cada proveedor, y medir la latencia real bajo distintos horarios/condiciones.

### Qué NO es un experimento válido

El profesor fue explícito con ejemplos de lo que **rechaza**:

- Probar si una tecnología ya probada mundialmente hace lo que se supone que hace (ej. *"¿Kong sirve como API Gateway?"*, *"¿MongoDB guarda documentos?"*, *"¿AWS me deja provisionar una máquina virtual?"*). Cita textual: *"eso no es una táctica de arquitectura, es... no es una decisión de diseño"*.
- Instalar una herramienta nueva "a ver si funciona" sin que esté ligada a una decisión de arquitectura incierta. Aprender una tecnología nueva que el experimento requiere sí es válido como *actividad dentro* del experimento, pero no puede ser la razón de ser del experimento.
- Validar si una funcionalidad del producto funciona o no — eso es prueba funcional, no experimento de arquitectura.

**Regla práctica**: si la respuesta a "¿esto ya lo probó toda la industria?" es sí, no es un experimento. Si la respuesta a "¿sabríamos, sin experimentar, cuál decisión es la correcta?" es no, ahí sí hay justificación.

### Estructura esperada del experimento (según `subtitle (33).txt`)

1. **Propósito del experimento** y resultado esperado.
2. **Estimación de recursos/esfuerzo** requeridos.
3. **Elementos de arquitectura** que se van a implementar en el experimento.
4. **Punto de sensibilidad**: la decisión crítica de arquitectura a experimentar, y el ASR/requisito de calidad que debe cumplir.
5. **Patrones y tácticas de arquitectura** que se desean validar explícitamente.
6. **Microservicios involucrados**: cuáles, su propósito y el comportamiento esperado de cada uno.
7. **Conectores involucrados**: cuáles, comportamiento esperado, y tecnología asociada.
8. **Ficha de tecnología completa**: bases de datos, librerías, herramientas de prueba/ejecución/análisis de resultados.
9. **Distribución de actividades** por integrante del equipo, de forma equitativa.

### Cuántos experimentos hacer

No hay un número fijo en el rubric — es decisión del equipo, pero con restricciones reales de tiempo:

- El diseño se define en semanas 4–5; la **construcción y ejecución** de los experimentos ocurre en semanas 6–7, que se comparten con todo el trabajo de UX (mockups/wireframes).
- El profesor advierte contra los dos extremos: proponer 1 solo experimento (insuficiente para una arquitectura con varios puntos de incertidumbre) o proponer 8 (imposible de construir en 2 semanas compartidas con UX). Referencia de otros equipos en la sesión: entre 2 y 4 experimentos fue lo típico.
- Se debe mostrar **criterio de estimación** de cuántos son viables, no solo una cifra.

---

## Por qué estos dos puntos de sensibilidad (y no otros)

Aplicando la regla práctica de la guía del curso (*"¿esto ya lo probó toda la industria?"* / *"¿sabríamos, sin experimentar, cuál decisión es la correcta?"*), se revisaron los 9 patrones del diseño detallado de arquitectura (fuera de este repo) y se descartaron como no-experimentables los que ya están resueltos por tecnología probada (BFF, API Gateway, Event Bus con Pub/Sub, Cache-Aside con Redis, WebSocket en GKE): su comportamiento base es conocido de la industria, lo único incierto sería la *configuración fina*, no la decisión en sí. Quedaron dos decisiones con incertidumbre real, sin resolver todavía en los diagramas:

1. **Circuit Breaker/Retry en ACL Workers (patrón 2.6)** — no está formalizado en `4.1.Diagrama_Componentes.drawio`; no se sabe si aísla realmente el flujo crítico de suscripción ante una falla de KYC/pasarela, ni qué umbrales de configuración lo logran.
2. **Réplica de lectura eventual en Riesgo (patrón 2.5)** — se sabe que MongoDB replica de forma asíncrona (eso lo prueba la industria), pero **no se sabe cuánto lag real produce bajo la carga concurrente esperada de Solventa**, ni si ese lag es aceptable para la experiencia de cotización. Eso sí es incertidumbre propia del diseño, no de la tecnología.

## Experimento 1 — Aislamiento de fallas externas vía Circuit Breaker + Retry en ACL Workers

| # | Campo | Contenido |
|---|---|---|
| 1 | **Propósito y resultado esperado** | Determinar si envolver las llamadas del ACL Worker de KYC con un Circuit Breaker + Retry con backoff exponencial contiene la degradación del flujo de suscripción cuando el proveedor de KYC falla o responde con latencia alta, en vez de propagar timeouts en cascada hacia Suscripción y Cotización. Resultado esperado: la latencia p95 del flujo de suscripción para casos **no** dependientes de KYC se mantiene dentro de su SLA normal aun con KYC caído. |
| 2 | **Estimación de recursos/esfuerzo** | ~3-4 días de un integrante con apoyo puntual de otro para la carga: 1 día para levantar el stub de KYC configurable, 1 día para el ACL Worker con circuit breaker, 1 día para instrumentar y correr las pruebas de carga con fallas inyectadas, 0.5-1 día para analizar resultados y documentar. |
| 3 | **Elementos de arquitectura implicados** | ACL Worker (adaptador KYC), un stub/mock de KYC con inyección de fallas configurable, y un consumidor simplificado que representa a Suscripción (UNDER) llamando al ACL Worker. No se replica el resto de la plataforma. |
| 4 | **Punto de sensibilidad y ASR** | *Punto de sensibilidad*: aplicar Circuit Breaker/Retry en el ACL Worker de KYC (patrón 2.6 del diseño detallado de arquitectura). *Historia que lo motiva*: **KAN-31 — HU-M01 Onboarding y verificación biométrica** (*Highest*, 13 pts): el registro con KYC/AML bajo regulación colombiana no puede depender de que el proveedor externo esté siempre disponible. *ASR*: "Cuando el proveedor de KYC no responde o responde con error durante más de un umbral T, el flujo de suscripción debe degradar de forma controlada (cola/reintento diferido) en vez de fallar para el usuario final, y las suscripciones no dependientes de KYC deben mantenerse dentro de su SLA normal de latencia." |
| 5 | **Patrones/tácticas a validar** | Circuit Breaker (open/half-open/closed), Retry con backoff exponencial, aislamiento de fallas externas vía ACL. |
| 6 | **Microservicios involucrados** | **ACL Worker (KYC)**: media las llamadas al proveedor, aplica circuit breaker/retry; comportamiento esperado: abre el circuito tras N fallos consecutivos o tasa de error > X% en una ventana, responde con fallback/estado "en cola" mientras el circuito está abierto, y cierra automáticamente tras la ventana de recuperación si el proveedor vuelve a responder. **Stub KYC**: simula al proveedor real, expone un flag para inyectar latencia alta o errores 5xx bajo demanda. **Suscripción (simplificado)**: consume el resultado del ACL Worker; comportamiento esperado: nunca bloquea indefinidamente, respeta un timeout propio corto y maneja la respuesta "en cola" sin error visible al usuario. |
| 7 | **Conectores involucrados** | HTTP/REST síncrono ACL Worker → Stub KYC (envuelto por el circuit breaker); HTTP/REST interno Suscripción → ACL Worker (con timeout acotado). Comportamiento esperado bajo prueba: fail-fast cuando el circuito está abierto, en vez de esperar el timeout completo del proveedor real. |
| 8 | **Ficha de tecnología** | Runtime del ACL Worker: Node.js/TypeScript (alineado con despliegue en Cloud Run). Librería de circuit breaker: [Opossum](https://github.com/nodeshift/opossum) (o `resilience4j` si el equipo usa JVM). Stub de KYC: servidor Express/WireMock con endpoint configurable de latencia/error. Carga: [k6](https://k6.io/). Contenedores: Docker, para reproducir el modelo de despliegue de Cloud Run. Métricas/dashboards: Prometheus + Grafana locales, o Cloud Monitoring si se despliega en un proyecto GCP de pruebas. |
| 9 | **Distribución de actividades** | **Frans Taboada** (`f.taboada`, reporter de KAN-31): stub de KYC + inyección de fallas, dado que es quien redactó los criterios de aceptación de la historia de onboarding. *Integrante C (por confirmar)*: ACL Worker con circuit breaker/retry + instrumentación de métricas. *Integrante D (por confirmar)*: guiones de carga en k6 (escenario base vs. escenario con KYC degradado). *Todo el equipo*: revisión de resultados y redacción de conclusiones. |

**Criterios de éxito**: (a) con el circuito abierto, la latencia p95 de Suscripción para solicitudes no dependientes de KYC permanece dentro de +10% de la línea base sin KYC caído; (b) 0 timeouts en cascada observados en Suscripción durante la ventana de falla simulada; (c) el circuito cierra automáticamente dentro de la ventana de recuperación configurada una vez el stub de KYC vuelve a responder sano.

**Criterios de fracaso**: latencia p95 se dispara por encima del umbral, o se observan timeouts/errores propagados hacia Suscripción durante la falla simulada de KYC.

**Resultados y análisis**: ✅ **ejecutado el 2026-09-10**, con las 4 piezas construidas y corriendo de verdad (stub, ACL Worker, consumidor de UNDER, k6). Detalle completo en [`experimento-1-acl-kyc/`](experimento-1-acl-kyc/) (cada pieza documenta su propia verificación en vivo). Resumen:

- **Aislado (ACL Worker + stub, sin UNDER ni k6)**: con el proveedor sano, `aprobado` en 490ms, circuito `closed`. Con el proveedor en `pending-forever`, las 2 primeras llamadas tardan ~3.1s (agotan el umbral T + 1 reintento) y resultan en `degradado`; al tercer `fire` el circuito abre y las llamadas siguientes responden **fail-fast en 0-1ms**. Al volver el proveedor a sano, el circuito transiciona solo `open → half-open → closed` (~5s después de abrir) y la siguiente llamada resuelve en 465ms.
- **Carga real con k6 contra el stack completo** (`baseline.js`, 8 VUs/30s, 330 requests, 0% fallos; `falla-inyectada.js`, 60s con ventana caída t=15s→45s, 515 requests, 0% `http_req_failed`):

  | Escenario | `con-kyc` p95 | `sin-kyc` p95 |
  |---|---|---|
  | Baseline (KYC sano) | 616.6 ms | 50.8 ms |
  | Falla inyectada (KYC caído 15-45s) | 3.1 s | **49.6 ms** |

**Veredicto contra los 3 criterios de éxito**:
- (a) ✅ `sin-kyc` p95 prácticamente idéntico entre baseline y falla (49.6ms vs 50.8ms, muy por debajo de +10%) — las suscripciones no dependientes de KYC no se ven afectadas.
- (b) ✅ 0% de requests fallidos (`http_req_failed`) en ambas corridas — ningún timeout/error propagado hacia Suscripción; `con-kyc` siempre responde 200 (aprobado/rechazado/degradado), nunca 5xx.
- (c) ✅ el circuito cerró automáticamente al final de la corrida de falla inyectada, sin intervención manual, tanto en la verificación aislada como en la corrida de k6 de extremo a extremo.

Ningún criterio de fracaso se disparó. Pendiente (no bloqueante): calibrar `KYC_TIMEOUT_MS` y los parámetros del Circuit Breaker contra un SLA numérico real (hoy son valores de referencia, documentados como tales en `acl-worker/README.md`) — ver checklist.

**Amenazas a la validez**: el stub de KYC no replica exactamente la variabilidad de latencia/errores del proveedor real; el experimento corre en un entorno reducido (sin el resto de microservicios reales compitiendo por recursos), por lo que la latencia base puede no ser representativa del entorno productivo con toda la carga concurrente de Solventa.

### Refinamiento de diseño: contrato del stub y arquitectura interna del ACL Worker

Esta sección detalla decisiones de diseño discutidas después de la primera redacción de la tabla anterior, para que quien construya el experimento en semanas 6-7 no tenga que re-derivarlas.

**Proveedor de referencia para el contrato del stub.** Se eligió **Truora** ([dev.truora.com](https://dev.truora.com/)) como proveedor candidato concreto para modelar el stub, por su encaje con el contexto LatAm/Colombia del caso (identidad, listas restrictivas, AML). Su contrato real, verificado en la documentación pública, es **asíncrono**, no un simple request/response:

- `POST /v1/validations` → `201 Created` + `validation_id`.
- `GET /v1/validations/{validation_id}` → estado `pending` → `success` | `failure` (el cliente hace polling).
- Autenticación por header `Truora-API-Key`.
- Falla realista adicional: `429 Too Many Requests` por rate limiting, y estado `delayed` que puede durar horas/días en validaciones más profundas.

**Implicación para el stub**: no basta con un stub que responda `200/500/timeout` de forma síncrona — debe imitar el ciclo crear→pollear, con modos de falla configurables: `healthy`, `pending-forever` (nunca resuelve), `error-429` (rate limit), `down` (no responde). Esto hace que el experimento valide un fallo más parecido al real: un proveedor que "no dice que no", solo nunca contesta.

**La llamada UNDER → ACL sigue siendo síncrona (no hay Pub/Sub aquí).** Confirmado en la vista de información/journeys: UNDER coordina llamadas síncronas hacia ACL (KYC/AML y firma electrónica) **antes de emitir la póliza** — es una dependencia de decisión de negocio, no un efecto colateral, así que no puede resolverse publicando un evento y "enterándose después" (eso sí aplica, y ya está en el diseño, para lo que ocurre después de `PolicyIssued`: notificar/auditar/cobrar en paralelo vía Event Bus). Consecuencia para el ACL Worker: como el proveedor real (Truora) es internamente asíncrono pero UNDER necesita una respuesta síncrona acotada, el ACL Worker debe absorber ese ciclo con un **polling interno acotado por el umbral T** del ASR — si no resuelve a tiempo, corta y responde degradado a UNDER, sin que UNDER vea nunca el detalle del polling.

**Arquitectura interna del ACL Worker: puertos y adaptadores (hexagonal).** Justificado por un requisito ya existente en el caso (facilidad de modificación — sustituir el proveedor de KYC detrás de una interfaz estable, sin propagar cambios al resto): el ACL Worker define un puerto de dominio, p. ej. `PuertoProveedorIdentidad.verificar(cliente)`, con dos adaptadores intercambiables que lo implementan — `TruoraAdapter` (proveedor real) y `StubKycAdapter` (usado en el experimento). El Circuit Breaker/Retry envuelve la llamada al adaptador concreto, nunca vive en el dominio de UNDER ni en el puerto. Cambiar de proveedor en el futuro (Onfido, MetaMap, etc.) es agregar un adaptador nuevo, no tocar el Circuit Breaker ni a UNDER.

**Alcance deliberadamente NO hexagonal**: el consumidor simplificado que representa a UNDER (fila 3/6 de la tabla) y el propio stub de KYC son código de un solo uso para el experimento — no llevan esta estructura de puertos/adaptadores. Meterle esa capa sería sobre-ingeniería para piezas que solo existen para generar carga y respuestas simuladas; la hexagonal aplica al ACL Worker real que se lleva a producción, no al andamiaje de prueba.

### Extensión de diseño: Consolidador KYC (reconciliación diferida)

Decisión del equipo (post-ejecución inicial): agregar una **quinta pieza**, el **Consolidador KYC**, que reconcilia en segundo plano los casos que el circuito degradó, sin tocar el camino síncrono ya validado arriba. Esto **no reemplaza ni relaja** la regla ya establecida ("UNDER → ACL sigue siendo síncrona, no hay Pub/Sub aquí") — la agrega como un segundo carril, puramente para des-envejecer el estado cuando el proveedor se recupera.

**Punto de sensibilidad adicional**: cuando el Circuit Breaker degrada una verificación, hoy esa decisión queda "congelada" — UNDER nunca se entera si el cliente, en realidad, sí pasaba KYC una vez el proveedor volvió a responder. El Consolidador resuelve eso sin bloquear a nadie.

**Contrato exacto** (fuente de verdad para el código):

1. **Disparo**: cada vez que `ServicioVerificacion` (dentro del ACL Worker) resuelve una llamada como `degradado` (timeout interno o circuito abierto), además de responder a UNDER, **encola** (fire-and-forget, no bloquea la respuesta) un job `{ clienteId, timestamp }` en una cola `kyc-reconciliacion`.
2. **Tecnología de la cola**: BullMQ sobre Redis (el mismo Redis que ya está en el diseño para el valor por defecto) — evita introducir un broker nuevo (Pub/Sub, RabbitMQ) solo para este experimento, y da reintentos con backoff y un "failed set" (equivalente a una DLQ) sin código adicional.
3. **Consolidador KYC** (nuevo servicio, sin hexagonal — es andamiaje de reconciliación, no el ACL boundary): consume `kyc-reconciliacion`, y por cada job **vuelve a llamar al ACL Worker** (`POST /verificaciones/kyc`), nunca al proveedor KYC directo — el ACL Worker sigue siendo el único punto de salida hacia proveedores externos (principio ACL ya establecido). Si el circuito ya cerró (proveedor recuperado), la llamada resuelve con el estado real.
4. **Persistencia del resultado**: al resolver (`aprobado`/`rechazado`), el Consolidador escribe `kyc:estado:<clienteId>` en Redis (con TTL) — ese es el "valor consolidado" que UNDER puede leer después.
5. **Agotamiento de reintentos**: si BullMQ agota los intentos configurados sin que el proveedor se recupere, el job queda en el *failed set* de BullMQ (la DLQ del diagrama) para revisión manual — no se reintenta indefinidamente.
6. **Lectura por UNDER**: cuando el ACL Worker responde `degradado`, UNDER lee `kyc:estado:<clienteId>` en Redis (síncrono, ~1ms) **antes** de decidir qué mostrar — si ya hay un estado consolidado de un intento anterior, lo usa; si no, usa el placeholder neutro `pendiente_verificacion` que ya existía.

**Decisión de negocio que esto deja explícita** (no resuelta aquí, señalada para que no se pierda): si UNDER ya emitió una póliza con `pendiente_verificacion` y el Consolidador después resuelve `rechazado`, hace falta un flujo de reversión/revisión — eso es una decisión de producto/riesgo, no de arquitectura, y queda **fuera de alcance de este experimento**.

**Correspondencia con el diagrama de componentes** (`Experimento_Modelo_Componentes-*.drawio`, fuera de este repo):

| Arista | Naturaleza | Ya corregida a |
|---|---|---|
| ACL Workers → Cola | async, dispara al degradar | punteada, etiqueta "Encola al degradar (async)" |
| Cola → Consolidador | async, consumo | punteada, etiqueta "Consume" |
| Consolidador → ACL Workers | síncrono, reintento | continua, etiqueta "Reintenta verificación (REST, vía ACL)" |
| Consolidador → Redis | síncrono, escritura | continua, etiqueta "Actualiza estado consolidado" |
| UNDER → Redis | síncrono, lectura | continua, etiqueta "Lee estado consolidado" (reemplaza la etiqueta genérica "lee valor por defecto") |

La arista suelta `ACL Workers → Redis` directa (sin pasar por el Consolidador) que había quedado en el diagrama se elimina — no tiene contrato definido y duplicaba el camino real.

---

## Experimento 2 — Ventana de consistencia eventual de la réplica de lectura de Riesgo bajo carga concurrente

| # | Campo | Contenido |
|---|---|---|
| 1 | **Propósito y resultado esperado** | Medir el lag real de replicación entre la instancia primaria de MongoDB (escritor único: RISK) y la réplica de lectura consumida por RATING, bajo un volumen de escrituras concurrentes representativo de un pico de uso de Solventa. Resultado esperado: el lag se mantiene por debajo de un umbral que garantice que el score de riesgo mostrado durante una sesión de cotización no quede perceptiblemente desactualizado. |
| 2 | **Estimación de recursos/esfuerzo** | ~2-3 días de un integrante: 0.5 día para levantar un replica set de MongoDB (Atlas M10 de prueba o Docker local con 1 primario + 1 secundario), 1 día para el script de carga concurrente de escrituras (perfiles de riesgo simulados), 0.5-1 día para instrumentar la medición de lag y correr los escenarios, 0.5 día para análisis. |
| 3 | **Elementos de arquitectura implicados** | RISK (servicio de escritura), MongoDB primario + réplica de lectura, RATING (servicio de lectura), un inyector de carga que simula perfiles de riesgo concurrentes (incluyendo señales tipo Open Finance/IoT, que son las que más volumen aportan según el diagrama de componentes). |
| 4 | **Punto de sensibilidad y ASR** | *Punto de sensibilidad*: usar una réplica de lectura con consistencia eventual para Riesgo, en vez de leer siempre de la primaria (patrón 2.5 del diseño detallado de arquitectura). *Historia que lo motiva*: **KAN-24 — HU-W01 Perfilamiento en línea y oferta Vida Hipotecario** (*Highest*, 20 pts — la de más puntos de todo el backlog): el criterio de aceptación exige ejecutar el motor de calificación y desplegar la prima "en línea", en el mismo flujo donde se consultan Open Finance/Open Data. *ASR*: "Cuando un usuario ajusta coberturas durante una sesión de cotización y eso dispara un recálculo de riesgo, el score actualizado debe reflejarse en RATING en un tiempo razonable (objetivo: < 2 s), de forma que el precio mostrado sea consistente con el riesgo evaluado." |
| 5 | **Patrones/tácticas a validar** | Réplica de lectura (CQRS-like) como táctica de rendimiento; consistencia eventual como trade-off aceptado frente a lecturas siempre-consistentes contra la primaria. |
| 6 | **Microservicios involucrados** | **RISK**: escribe perfiles de riesgo actualizados a la primaria; comportamiento esperado: cada escritura queda con un timestamp para poder medir cuándo se vuelve visible en la réplica. **RATING**: lee de la réplica de lectura para calcular la prima; comportamiento esperado: bajo carga, debe seguir devolviendo un score (aunque potencialmente desactualizado por el lag) sin bloquearse. **Inyector de carga**: simula N perfiles/segundo escribiendo concurrentemente en RISK. |
| 7 | **Conectores involucrados** | Protocolo *wire* de MongoDB para el path de escritura RISK → primaria; replicación interna primaria → secundaria (mecanismo nativo de MongoDB, vía oplog); protocolo *wire* de MongoDB para el path de lectura RATING → réplica secundaria. |
| 8 | **Ficha de tecnología** | MongoDB Atlas (tier de prueba) o replica set Dockerizado (1 primario + 1 secundario) para reproducir fielmente el mecanismo de replicación real de Atlas. Script de carga: Node.js o Python con el driver oficial de MongoDB, o k6 con una extensión para MongoDB. Medición de lag: `rs.printSecondaryReplicationInfo()` / métricas de oplog lag de MongoDB, combinado con instrumentación propia (timestamp de escritura vs. timestamp en que el dato aparece en la réplica). Dashboards: Grafana o el panel de métricas de Atlas. |
| 9 | **Distribución de actividades** | **Daniel Felipe Urrego** (reporter de KAN-38, con interés ya demostrado en benchmarking de infraestructura — ver la discusión sobre latencia GCP/AWS en `utils/MISW4501-202614-S4C1-es-ES.vtt`): levantar el replica set de MongoDB (Atlas o Docker) y exponer las métricas de oplog lag. *Integrante D (por confirmar)*: script de carga concurrente de escrituras en RISK + instrumentación de staleness end-to-end. *Frans Taboada* (`f.taboada`, reporter de KAN-24): script de lectura continua desde RATING/réplica para medir cuándo cada escritura se vuelve visible, dado que fue quien definió el criterio de aceptación de "en línea" que este experimento valida. *Todo el equipo*: análisis de resultados y decisión sobre si el diseño actual es suficiente o requiere ajuste (p. ej. *read-your-writes* forzando lectura a primaria justo después de una escritura propia). |

**Criterios de éxito**: (a) el lag de replicación observado se mantiene por debajo de 1 segundo en el percentil 95, bajo la carga concurrente objetivo; (b) el tiempo end-to-end entre una escritura en RISK y su visibilidad en RATING vía la réplica es consistentemente menor al objetivo de UX (<2 s) definido en el ASR.

**Criterios de fracaso**: el lag crece de forma no acotada con la carga, o el percentil 95 de staleness supera el objetivo de UX — en ese caso el diseño debe ajustarse (p. ej. lectura forzada a primaria tras una escritura propia, o invalidación activa de caché en vez de solo esperar la réplica).

**Resultados y análisis**: _pendiente de ejecución — corresponde a las semanas 6-7 del curso, no a esta entrega de diseño._ Código en [`experimento-2-replica-riesgo/`](experimento-2-replica-riesgo/).

**Amenazas a la validez**: el volumen de "perfiles/segundo" simulado es una estimación del equipo, no un dato de tráfico real de producción (Solventa aún no tiene usuarios); el entorno de prueba (Atlas tier bajo o Docker local) puede tener características de red distintas a los nodos de producción, afectando el lag medido.

---

## Candidatos considerados y descartados para esta ronda

Para justificar el criterio de estimación que pide el curso (por qué 2 experimentos y no más), se evaluaron otros candidatos y se descartaron **por esfuerzo, no por falta de incertidumbre**:

- **Saga coreografiada del flujo de indemnización paramétrica** (patrón 2.7 del diseño detallado de arquitectura): respaldada por **KAN-38 — HU-M04** (*High*, 13 pts), que exige que el pago se liquide "sin trámites" e "instantáneo" ante un evento paramétrico — sí tiene incertidumbre real (manejo de compensación si `PaymentConfirmed` nunca llega tras `ClaimApproved`), pero requiere levantar 3+ microservicios y 2 bases de datos distintas para reproducir el flujo completo — esfuerzo desproporcionado frente a las 2 semanas disponibles, compartidas con UX. Queda como candidato para una siguiente ronda de experimentación si el equipo tiene margen — es, junto con KAN-30 y KAN-24, una de las historias de mayor prioridad del backlog, así que si sobra tiempo debería ser el primer candidato a agregar como 3er experimento.
- **Elección de región/zona GCP para minimizar latencia**: no se incluyó porque, a diferencia del ejemplo discutido en clase, Solventa ya tiene una decisión tomada y sin duda expresada en los diagramas (`us-central1`); no hay hoy una incertidumbre documentada del equipo sobre esa elección que amerite experimentar.

## Checklist

- [x] Identificar los puntos de sensibilidad con incertidumbre real (no ya resueltos por la industria)
- [x] Redactar escenario de calidad (ASR) por punto de sensibilidad
- [x] Redactar hipótesis de diseño verificable por experimento
- [x] Completar la estructura de 9 puntos para los 2 experimentos
- [x] Definir criterios de éxito/fracaso por experimento
- [x] Documentar amenazas a la validez de cada experimento
- [x] Mostrar criterio de estimación de cuántos experimentos son viables (sección de candidatos descartados)
- [x] Refinar el contrato del stub de KYC del Experimento 1 contra un proveedor real de referencia (Truora) y decidir la arquitectura interna del ACL Worker (hexagonal: puerto `PuertoProveedorIdentidad` + adaptadores `TruoraAdapter`/`StubKycAdapter`)
- [x] Asignar los 2 nombres reales disponibles en el backlog (Frans Taboada, Daniel Felipe Urrego) a los roles con relación directa a la historia que motiva cada experimento
- [ ] **Completar los roles restantes (Integrante C/D) con el resto del equipo real** — el backlog no identifica más personas por nombre
- [ ] **Calibrar los umbrales numéricos (ms, %, lag) contra el SLA/ASR real que el equipo haya definido para Solventa** — el backlog trae criterios cualitativos ("en línea", "inmediato") pero no números; en el Experimento 1 esto queda como `KYC_TIMEOUT_MS`/parámetros de Opossum documentados como valores de referencia en `experimento-1-acl-kyc/acl-worker/README.md`
- [x] **Experimento 1 ejecutado** (2026-09-10): 4 piezas construidas y verificadas en vivo (`experimento-1-acl-kyc/`), 3/3 criterios de éxito cumplidos con datos reales de k6 — ver "Resultados y análisis" arriba
- [ ] **Experimento 2 pendiente de construir y ejecutar** — el esqueleto de carpeta existe (`experimento-2-replica-riesgo/`) pero sin código aún; es el punto de partida de la próxima sesión
- [ ] Verificar que el razonamiento de esta sección quede también explicado verbalmente en el video de evidencias (documentado fuera de este repo)
