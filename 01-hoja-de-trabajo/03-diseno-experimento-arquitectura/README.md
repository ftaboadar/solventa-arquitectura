# 1.3 Diseño del experimento de arquitectura (28 pts)

Un experimento de arquitectura valida —con evidencia medible, no solo con argumentación— que una decisión de diseño cumple el atributo de calidad que promete. Esta sección diseña 2 experimentos completos para Solventa, tomando como puntos de partida los dos puntos de incertidumbre que quedaron marcados explícitamente en [`02-diseno-detallado-arquitectura/`](../02-diseno-detallado-arquitectura/) (patrones [2.5](../02-diseno-detallado-arquitectura/#25-vista-de-lectura-desacoplada-patrón-cqrs-like-en-el-dominio-de-riesgo) y [2.6](../02-diseno-detallado-arquitectura/#26-circuit-breaker--retry-hacia-proveedores-externos)).

> ⚠️ **Supuesto a validar por el equipo**: la sección 9 de cada experimento (distribución de actividades) usa roles genéricos (Integrante A/B/C/D) porque este repositorio no tiene la composición real del equipo. Reemplazar por nombres reales antes de entregar. Los umbrales numéricos de los criterios de éxito (ms, %) son valores de referencia razonables para el dominio — deben calibrarse con el SLA real que el equipo haya definido para Solventa.

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

Aplicando la regla práctica de la guía del curso (*"¿esto ya lo probó toda la industria?"* / *"¿sabríamos, sin experimentar, cuál decisión es la correcta?"*), se revisaron los 9 patrones de [`02-diseno-detallado-arquitectura/`](../02-diseno-detallado-arquitectura/) y se descartaron como no-experimentables los que ya están resueltos por tecnología probada (BFF, API Gateway, Event Bus con Pub/Sub, Cache-Aside con Redis, WebSocket en GKE): su comportamiento base es conocido de la industria, lo único incierto sería la *configuración fina*, no la decisión en sí. Quedaron dos decisiones con incertidumbre real, sin resolver todavía en los diagramas:

1. **Circuit Breaker/Retry en ACL Workers (patrón 2.6)** — no está formalizado en `4.1.Diagrama_Componentes.drawio`; no se sabe si aísla realmente el flujo crítico de suscripción ante una falla de KYC/pasarela, ni qué umbrales de configuración lo logran.
2. **Réplica de lectura eventual en Riesgo (patrón 2.5)** — se sabe que MongoDB replica de forma asíncrona (eso lo prueba la industria), pero **no se sabe cuánto lag real produce bajo la carga concurrente esperada de Solventa**, ni si ese lag es aceptable para la experiencia de cotización. Eso sí es incertidumbre propia del diseño, no de la tecnología.

## Experimento 1 — Aislamiento de fallas externas vía Circuit Breaker + Retry en ACL Workers

| # | Campo | Contenido |
|---|---|---|
| 1 | **Propósito y resultado esperado** | Determinar si envolver las llamadas del ACL Worker de KYC con un Circuit Breaker + Retry con backoff exponencial contiene la degradación del flujo de suscripción cuando el proveedor de KYC falla o responde con latencia alta, en vez de propagar timeouts en cascada hacia Suscripción y Cotización. Resultado esperado: la latencia p95 del flujo de suscripción para casos **no** dependientes de KYC se mantiene dentro de su SLA normal aun con KYC caído. |
| 2 | **Estimación de recursos/esfuerzo** | ~3-4 días de un integrante con apoyo puntual de otro para la carga: 1 día para levantar el stub de KYC configurable, 1 día para el ACL Worker con circuit breaker, 1 día para instrumentar y correr las pruebas de carga con fallas inyectadas, 0.5-1 día para analizar resultados y documentar. |
| 3 | **Elementos de arquitectura implicados** | ACL Worker (adaptador KYC), un stub/mock de KYC con inyección de fallas configurable, y un consumidor simplificado que representa a Suscripción (UNDER) llamando al ACL Worker. No se replica el resto de la plataforma. |
| 4 | **Punto de sensibilidad y ASR** | *Punto de sensibilidad*: aplicar Circuit Breaker/Retry en el ACL Worker de KYC (patrón [2.6](../02-diseno-detallado-arquitectura/#26-circuit-breaker--retry-hacia-proveedores-externos)). *ASR*: "Cuando el proveedor de KYC no responde o responde con error durante más de un umbral T, el flujo de suscripción debe degradar de forma controlada (cola/reintento diferido) en vez de fallar para el usuario final, y las suscripciones no dependientes de KYC deben mantenerse dentro de su SLA normal de latencia." |
| 5 | **Patrones/tácticas a validar** | Circuit Breaker (open/half-open/closed), Retry con backoff exponencial, aislamiento de fallas externas vía ACL. |
| 6 | **Microservicios involucrados** | **ACL Worker (KYC)**: media las llamadas al proveedor, aplica circuit breaker/retry; comportamiento esperado: abre el circuito tras N fallos consecutivos o tasa de error > X% en una ventana, responde con fallback/estado "en cola" mientras el circuito está abierto, y cierra automáticamente tras la ventana de recuperación si el proveedor vuelve a responder. **Stub KYC**: simula al proveedor real, expone un flag para inyectar latencia alta o errores 5xx bajo demanda. **Suscripción (simplificado)**: consume el resultado del ACL Worker; comportamiento esperado: nunca bloquea indefinidamente, respeta un timeout propio corto y maneja la respuesta "en cola" sin error visible al usuario. |
| 7 | **Conectores involucrados** | HTTP/REST síncrono ACL Worker → Stub KYC (envuelto por el circuit breaker); HTTP/REST interno Suscripción → ACL Worker (con timeout acotado). Comportamiento esperado bajo prueba: fail-fast cuando el circuito está abierto, en vez de esperar el timeout completo del proveedor real. |
| 8 | **Ficha de tecnología** | Runtime del ACL Worker: Node.js/TypeScript (alineado con despliegue en Cloud Run). Librería de circuit breaker: [Opossum](https://github.com/nodeshift/opossum) (o `resilience4j` si el equipo usa JVM). Stub de KYC: servidor Express/WireMock con endpoint configurable de latencia/error. Carga: [k6](https://k6.io/). Contenedores: Docker, para reproducir el modelo de despliegue de Cloud Run. Métricas/dashboards: Prometheus + Grafana locales, o Cloud Monitoring si se despliega en un proyecto GCP de pruebas. |
| 9 | **Distribución de actividades** | *Integrante A*: stub de KYC + inyección de fallas. *Integrante B*: ACL Worker con circuit breaker/retry + instrumentación de métricas. *Integrante A o B*: guiones de carga en k6 (escenario base vs. escenario con KYC degradado). *Todo el equipo*: revisión de resultados y redacción de conclusiones. |

**Criterios de éxito**: (a) con el circuito abierto, la latencia p95 de Suscripción para solicitudes no dependientes de KYC permanece dentro de +10% de la línea base sin KYC caído; (b) 0 timeouts en cascada observados en Suscripción durante la ventana de falla simulada; (c) el circuito cierra automáticamente dentro de la ventana de recuperación configurada una vez el stub de KYC vuelve a responder sano.

**Criterios de fracaso**: latencia p95 se dispara por encima del umbral, o se observan timeouts/errores propagados hacia Suscripción durante la falla simulada de KYC.

**Resultados y análisis**: _pendiente de ejecución — corresponde a las semanas 6-7 del curso, no a esta entrega de diseño._

**Amenazas a la validez**: el stub de KYC no replica exactamente la variabilidad de latencia/errores del proveedor real; el experimento corre en un entorno reducido (sin el resto de microservicios reales compitiendo por recursos), por lo que la latencia base puede no ser representativa del entorno productivo con toda la carga concurrente de Solventa.

---

## Experimento 2 — Ventana de consistencia eventual de la réplica de lectura de Riesgo bajo carga concurrente

| # | Campo | Contenido |
|---|---|---|
| 1 | **Propósito y resultado esperado** | Medir el lag real de replicación entre la instancia primaria de MongoDB (escritor único: RISK) y la réplica de lectura consumida por RATING, bajo un volumen de escrituras concurrentes representativo de un pico de uso de Solventa. Resultado esperado: el lag se mantiene por debajo de un umbral que garantice que el score de riesgo mostrado durante una sesión de cotización no quede perceptiblemente desactualizado. |
| 2 | **Estimación de recursos/esfuerzo** | ~2-3 días de un integrante: 0.5 día para levantar un replica set de MongoDB (Atlas M10 de prueba o Docker local con 1 primario + 1 secundario), 1 día para el script de carga concurrente de escrituras (perfiles de riesgo simulados), 0.5-1 día para instrumentar la medición de lag y correr los escenarios, 0.5 día para análisis. |
| 3 | **Elementos de arquitectura implicados** | RISK (servicio de escritura), MongoDB primario + réplica de lectura, RATING (servicio de lectura), un inyector de carga que simula perfiles de riesgo concurrentes (incluyendo señales tipo Open Finance/IoT, que son las que más volumen aportan según el diagrama de componentes). |
| 4 | **Punto de sensibilidad y ASR** | *Punto de sensibilidad*: usar una réplica de lectura con consistencia eventual para Riesgo, en vez de leer siempre de la primaria (patrón [2.5](../02-diseno-detallado-arquitectura/#25-vista-de-lectura-desacoplada-patrón-cqrs-like-en-el-dominio-de-riesgo)). *ASR*: "Cuando un usuario ajusta coberturas durante una sesión de cotización y eso dispara un recálculo de riesgo, el score actualizado debe reflejarse en RATING en un tiempo razonable (objetivo: < 2 s), de forma que el precio mostrado sea consistente con el riesgo evaluado." |
| 5 | **Patrones/tácticas a validar** | Réplica de lectura (CQRS-like) como táctica de rendimiento; consistencia eventual como trade-off aceptado frente a lecturas siempre-consistentes contra la primaria. |
| 6 | **Microservicios involucrados** | **RISK**: escribe perfiles de riesgo actualizados a la primaria; comportamiento esperado: cada escritura queda con un timestamp para poder medir cuándo se vuelve visible en la réplica. **RATING**: lee de la réplica de lectura para calcular la prima; comportamiento esperado: bajo carga, debe seguir devolviendo un score (aunque potencialmente desactualizado por el lag) sin bloquearse. **Inyector de carga**: simula N perfiles/segundo escribiendo concurrentemente en RISK. |
| 7 | **Conectores involucrados** | Protocolo *wire* de MongoDB para el path de escritura RISK → primaria; replicación interna primaria → secundaria (mecanismo nativo de MongoDB, vía oplog); protocolo *wire* de MongoDB para el path de lectura RATING → réplica secundaria. |
| 8 | **Ficha de tecnología** | MongoDB Atlas (tier de prueba) o replica set Dockerizado (1 primario + 1 secundario) para reproducir fielmente el mecanismo de replicación real de Atlas. Script de carga: Node.js o Python con el driver oficial de MongoDB, o k6 con una extensión para MongoDB. Medición de lag: `rs.printSecondaryReplicationInfo()` / métricas de oplog lag de MongoDB, combinado con instrumentación propia (timestamp de escritura vs. timestamp en que el dato aparece en la réplica). Dashboards: Grafana o el panel de métricas de Atlas. |
| 9 | **Distribución de actividades** | *Integrante C*: levantar el replica set de MongoDB (Atlas o Docker) y exponer las métricas de oplog lag. *Integrante D*: script de carga concurrente de escrituras en RISK + instrumentación de staleness end-to-end. *Integrante C o D*: script de lectura continua desde RATING/réplica para medir cuándo cada escritura se vuelve visible. *Todo el equipo*: análisis de resultados y decisión sobre si el diseño actual es suficiente o requiere ajuste (p. ej. *read-your-writes* forzando lectura a primaria justo después de una escritura propia). |

**Criterios de éxito**: (a) el lag de replicación observado se mantiene por debajo de 1 segundo en el percentil 95, bajo la carga concurrente objetivo; (b) el tiempo end-to-end entre una escritura en RISK y su visibilidad en RATING vía la réplica es consistentemente menor al objetivo de UX (<2 s) definido en el ASR.

**Criterios de fracaso**: el lag crece de forma no acotada con la carga, o el percentil 95 de staleness supera el objetivo de UX — en ese caso el diseño debe ajustarse (p. ej. lectura forzada a primaria tras una escritura propia, o invalidación activa de caché en vez de solo esperar la réplica).

**Resultados y análisis**: _pendiente de ejecución — corresponde a las semanas 6-7 del curso, no a esta entrega de diseño._

**Amenazas a la validez**: el volumen de "perfiles/segundo" simulado es una estimación del equipo, no un dato de tráfico real de producción (Solventa aún no tiene usuarios); el entorno de prueba (Atlas tier bajo o Docker local) puede tener características de red distintas a los nodos de producción, afectando el lag medido.

---

## Candidatos considerados y descartados para esta ronda

Para justificar el criterio de estimación que pide el curso (por qué 2 experimentos y no más), se evaluaron otros candidatos y se descartaron **por esfuerzo, no por falta de incertidumbre**:

- **Saga coreografiada del flujo de indemnización paramétrica** (patrón [2.7](../02-diseno-detallado-arquitectura/#27-saga-coreografiada-para-el-flujo-transaccional-distribuido)): sí tiene incertidumbre real (manejo de compensación si `PaymentConfirmed` nunca llega tras `ClaimApproved`), pero requiere levantar 3+ microservicios y 2 bases de datos distintas para reproducir el flujo completo — esfuerzo desproporcionado frente a las 2 semanas disponibles, compartidas con UX. Queda como candidato para una siguiente ronda de experimentación si el equipo tiene margen.
- **Elección de región/zona GCP para minimizar latencia**: no se incluyó porque, a diferencia del ejemplo discutido en clase, Solventa ya tiene una decisión tomada y sin duda expresada en los diagramas (`us-central1`); no hay hoy una incertidumbre documentada del equipo sobre esa elección que amerite experimentar.

## Checklist

- [x] Identificar los puntos de sensibilidad con incertidumbre real (no ya resueltos por la industria)
- [x] Redactar escenario de calidad (ASR) por punto de sensibilidad
- [x] Redactar hipótesis de diseño verificable por experimento
- [x] Completar la estructura de 9 puntos para los 2 experimentos
- [x] Definir criterios de éxito/fracaso por experimento
- [x] Documentar amenazas a la validez de cada experimento
- [x] Mostrar criterio de estimación de cuántos experimentos son viables (sección de candidatos descartados)
- [ ] **Reemplazar los roles genéricos (Integrante A/B/C/D) por los nombres reales del equipo**
- [ ] **Calibrar los umbrales numéricos (ms, %, lag) contra el SLA/ASR real que el equipo haya definido para Solventa**, no los de referencia usados aquí
- [ ] Ejecutar ambos experimentos en las semanas 6-7 y completar "Resultados y análisis" con datos reales
- [ ] Verificar que el razonamiento de esta sección quede también explicado verbalmente en el [video de evidencias](../../04-video-evidencias/)
