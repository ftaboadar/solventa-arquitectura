# acl-worker

ACL Worker de KYC para el Experimento 1 (Circuit Breaker/Retry) de arquitectura de Solventa. Es la
única pieza de este experimento que lleva estructura de **puertos y adaptadores (hexagonal)** — ver
["Refinamiento de diseño"](../../DISENO-EXPERIMENTOS.md#refinamiento-de-diseño-contrato-del-stub-y-arquitectura-interna-del-acl-worker)
en el README de diseño. El stub de KYC (`../stub-kyc/`) y el futuro consumidor simplificado de UNDER
son andamiaje de prueba y deliberadamente **no** llevan esta capa.

## Estructura

```
src/
├── domain/PuertoProveedorIdentidad.ts   # puerto: verificar(cliente) -> Promise<ResultadoVerificacion>
├── adapters/
│   ├── StubKycAdapter.ts                # implementa el puerto contra stub-kyc/ (HTTP)
│   └── TruoraAdapter.ts                 # mismo puerto contra la baseUrl real de Truora — NO probado
├── application/ServicioVerificacion.ts  # orquesta: adaptador inyectado + Circuit Breaker (opossum) + retry
├── http/server.ts                       # endpoint HTTP síncrono que consumirá UNDER
└── config.ts                            # variables de entorno centralizadas
```

El dominio y la aplicación nunca instancian un adaptador concreto — `http/server.ts` decide cuál
inyectar según `KYC_PROVIDER` y se lo pasa a `ServicioVerificacion` por el constructor.

## El ciclo asíncrono del proveedor vive dentro del adaptador

Tal como decide el README de diseño, UNDER → ACL es una llamada **síncrona** (no hay Pub/Sub aquí:
es una dependencia de decisión de negocio antes de emitir la póliza). Pero el proveedor real
(Truora) es internamente **asíncrono** (crear → pollear). Por eso cada adaptador (`StubKycAdapter`,
`TruoraAdapter`) implementa el ciclo completo:

1. `POST /v1/validations` con header `Truora-API-Key` → `validation_id`.
2. Polling propio contra `GET /v1/validations/:id` cada `POLL_INTERVAL_MS` hasta `success`/`failure`.
3. Si no resuelve dentro de `KYC_TIMEOUT_MS` (umbral T del ASR), **lanza un error** — nunca se queda
   esperando indefinidamente. Así es como el adaptador se comporta correctamente ante los modos
   `pending-forever`/`down` del stub (que, por diseño, nunca dicen que no — solo nunca contestan).

`ServicioVerificacion` y `http/server.ts` nunca ven el detalle de este polling: solo reciben un
`ResultadoVerificacion` ya resuelto (`aprobado`/`rechazado`) o un error que el Circuit Breaker
convierte en `degradado`.

> **`KYC_TIMEOUT_MS` (default 1500 ms) es un valor de referencia.** El diseño (README, sección
> "Refinamiento de diseño" y su checklist) todavía no lo calibra contra un SLA real del equipo — el
> backlog trae criterios cualitativos ("en línea", "de forma inmediata") pero no un número. Este
> default es razonable para hacer el experimento observable, no una cifra de producción.

## Decisión sobre la librería de retry

`opossum` **no trae retry incorporado** — solo Circuit Breaker, timeout de la acción y `fallback`.
Se evaluó sumar `p-retry`, pero se optó por una implementación propia de ~15 líneas
(`conReintento` dentro de `ServicioVerificacion.ts`) por dos razones:

1. El comportamiento requerido es simple (N intentos con backoff exponencial `base * 2^(intento-1)`)
   y no justifica una dependencia adicional.
2. **El retry debe ejecutarse *dentro* de la acción que envuelve el breaker, no por fuera.** Si se
   reintentara por fuera (p. ej. `pRetry(() => breaker.fire(cliente))`), el circuito vería cada
   reintento como una llamada (`fire`) independiente, distorsionando sus métricas de tasa de error y
   volumen. Con el retry adentro, cada llamada de UNDER produce **un solo** `fire()` — éxito o fallo
   final — que es justo lo que opossum necesita para decidir correctamente cuándo abrir el circuito.

`RETRY_ATTEMPTS` (default 2, es decir 1 reintento) y `RETRY_BASE_DELAY_MS` (default 100 ms) son
también valores de referencia — con 2 intentos y `KYC_TIMEOUT_MS=1500`, el peor caso de una sola
llamada de UNDER es de ~3.1 s antes de que el Circuit Breaker cuente un fallo (ver resultados de
verificación abajo). Subir `RETRY_ATTEMPTS` sin bajar `KYC_TIMEOUT_MS` alarga ese peor caso — es
parte de lo que falta calibrar contra el SLA real de Solventa.

## Circuit Breaker (opossum)

`ServicioVerificacion` envuelve `adaptador.verificar` (con su retry interno) en un
`CircuitBreaker` de opossum, con:

- `fallback`: cuando el circuito está abierto o la acción falla, devuelve
  `{ estado: 'degradado', motivo: 'kyc_no_disponible', detalle: { error } }` — **nunca** un 5xx crudo
  hacia UNDER.
- Transiciones (`open`, `halfOpen`, `close`) logueadas a stdout con el prefijo
  `[acl-worker][circuit]`, además de `failure`, `timeout`, `reject` y `fallback` — necesario para
  poder observar en los logs que el circuito cierra solo al recuperarse el proveedor (criterio de
  éxito del experimento).
- `rollingCountTimeoutMs` (default 30000 ms) / `rollingCountBuckets` (default 10): la ventana móvil
  sobre la que opossum acumula fallos para decidir si abre el circuito. **Hallazgo de la
  verificación en vivo de esta pieza**: con el default de opossum (`rollingCountTimeout` de 10 s) y
  un `KYC_TIMEOUT_MS`+retry de ~3.1 s por llamada fallida, los fallos "expiraban" de la ventana antes
  de acumular `volumeThreshold`, y el circuito nunca abría pese a fallos consecutivos. Se subió la
  ventana a 30 s (configurable) para que quepan varias llamadas fallidas consecutivas dentro de ella
  — otro parámetro que queda documentado como pendiente de calibrar junto al resto de umbrales.

## Endpoints

| Método/ruta | Descripción |
|---|---|
| `POST /verificaciones/kyc` | Body `{ "clienteId": "..." }`. Responde `200` siempre, con `{ estado: 'aprobado'|'rechazado'|'degradado', ... , duracionMs }`. Este es el endpoint que consumirá el futuro consumidor de UNDER. |
| `GET /circuit-status` | Solo lectura. `{ estado: 'closed'|'open'|'halfOpen', habilitado, stats }` — usa el estado que opossum expone internamente. |
| `GET /health` | Chequeo simple de vida. |

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `ACL_WORKER_PORT` | `5000` | Puerto propio del ACL Worker. |
| `KYC_PROVIDER` | `stub` | `stub` (contra `stub-kyc/`) o `truora` (real, no probado). |
| `KYC_BASE_URL` | `http://localhost:4000` | Base URL del stub, usada cuando `KYC_PROVIDER=stub`. |
| `TRUORA_BASE_URL` | `https://api.identity-platform.truora.com` | Base URL real de Truora (referencia de la documentación pública, no verificada), usada cuando `KYC_PROVIDER=truora`. |
| `TRUORA_API_KEY` | `dummy-truora-api-key` | API key enviada en el header `Truora-API-Key`. Dummy en este experimento. |
| `POLL_INTERVAL_MS` | `150` | Intervalo de polling interno del adaptador. |
| `KYC_TIMEOUT_MS` | `1500` | Umbral T del ASR — ver nota de calibración pendiente arriba. |
| `RETRY_ATTEMPTS` | `2` | Intentos totales por llamada (1 = sin reintento) antes de que el breaker cuente un fallo. |
| `RETRY_BASE_DELAY_MS` | `100` | Demora base del backoff exponencial entre intentos. |
| `BREAKER_TIMEOUT_MS` | `5000` | Timeout propio de opossum sobre la acción completa (debe ser mayor al peor caso de retry). |
| `BREAKER_ERROR_THRESHOLD_PERCENTAGE` | `50` | % de fallos en la ventana móvil que abre el circuito. |
| `BREAKER_VOLUME_THRESHOLD` | `3` | Mínimo de llamadas en la ventana antes de que el % de error pueda abrir el circuito. |
| `BREAKER_RESET_TIMEOUT_MS` | `5000` | Tiempo que el circuito permanece abierto antes de pasar a half-open. |
| `BREAKER_ROLLING_COUNT_TIMEOUT_MS` | `30000` | Ventana móvil (ms) de acumulación de fallos — ver hallazgo arriba. |
| `BREAKER_ROLLING_COUNT_BUCKETS` | `10` | Número de buckets en que se divide la ventana anterior. |

## Cómo levantarlo

### Local (Node.js/TypeScript)

```bash
cd acl-worker
npm install
npm run dev     # tsx watch, recarga en caliente sobre src/http/server.ts
# o, compilado:
npm run build   # tsc -> dist/
npm start        # node dist/http/server.js
```

Requiere el `stub-kyc/` corriendo en `http://localhost:4000` (`cd ../stub-kyc && npm run dev`) cuando
`KYC_PROVIDER=stub` (default).

### Docker

```bash
cd acl-worker
docker build -t acl-worker .
docker run --rm -p 5000:5000 -e KYC_BASE_URL=http://host.docker.internal:4000 acl-worker
```

## Verificación en vivo realizada (2026-09-10)

Se levantaron `stub-kyc` (puerto 4000) y `acl-worker` (puerto 5050, para evitar el conflicto local
con `ControlCenter`/AirPlay de macOS en el puerto 5000 — el default en código y Docker sigue siendo
5000) y se probó contra `POST http://localhost:5050/verificaciones/kyc` con curl real. Configuración
usada: la de los defaults de la tabla anterior (`KYC_TIMEOUT_MS=1500`, `RETRY_ATTEMPTS=2`,
`RETRY_BASE_DELAY_MS=100`, `BREAKER_VOLUME_THRESHOLD=3`, `BREAKER_RESET_TIMEOUT_MS=5000`,
`BREAKER_ROLLING_COUNT_TIMEOUT_MS=30000`).

### (a) Stub en `healthy`

```json
{"estado":"aprobado","proveedor":"stub-kyc","validationId":"ef18820a-...","duracionMs":490}
```

`GET /circuit-status` → `{"estado":"closed","stats":{"fires":1,"successes":1,"failures":0}}`.

Respuesta exitosa y rápida (490 ms, dentro del rango de latencia simulada 200–500 ms del stub +
overhead de polling), circuito cerrado. **No degradado.**

### (b) Stub en `pending-forever`, llamadas consecutivas

| Llamada | Resultado | Duración | Estado del circuito tras la llamada |
|---|---|---|---|
| 1 | `degradado` (kyc_timeout) | 3106 ms | `closed` (fires:2, failures:1 — arrastra el éxito de (a)) |
| 2 | `degradado` (kyc_timeout) | 3105 ms | **`open`** (fires:3, failures:2 → abre al llegar a `volumeThreshold=3`) |
| 3 | `degradado` (`Breaker is open`) | **1 ms** | `open` |
| 4 | `degradado` (`Breaker is open`) | **0 ms** | `open` |
| 5 | `degradado` (`Breaker is open`) | **0 ms** | `open` |

Las llamadas 1 y 2 agotan `KYC_TIMEOUT_MS` con su reintento interno (~1500 + 100 backoff + 1500 ≈
3105 ms — coincide con el cálculo teórico). Tras el segundo fallo consecutivo el circuito abre
(el volumen mínimo de 3 `fires` se completó contando el éxito previo de (a) + los 2 fallos). A
partir de ahí, las llamadas 3–5 responden en **0–1 ms** — fail-fast real, sin volver a esperar el
timeout del proveedor, tal como exige el criterio de éxito del experimento.

**Hallazgo durante esta verificación**: con el `rollingCountTimeout` por defecto de opossum (10 s),
el circuito nunca llegó a abrir en una primera corrida pese a 4 fallos consecutivos, porque cada
llamada fallida tarda ~3.1 s y los fallos más viejos salían de la ventana móvil antes de acumular
`volumeThreshold`. Se corrigió subiendo `BREAKER_ROLLING_COUNT_TIMEOUT_MS` a 30000 (ver sección
"Circuit Breaker" arriba) y se repitió la verificación completa desde cero con el resultado de la
tabla anterior.

### (c) Stub de vuelta a `healthy`, tras el `resetTimeout`

El log del ACL Worker mostró las transiciones automáticas, sin intervención manual salvo cambiar el
modo del stub y esperar:

```
[acl-worker][circuit] transición -> OPEN (fail-fast activado, no se llamará más al proveedor hasta el reset)
...
[acl-worker][circuit] transición -> HALF-OPEN (probando si el proveedor ya respondió)
...
[acl-worker][circuit] transición -> CLOSED (proveedor recuperado, tráfico normal)
```

El circuito pasó a `half-open` automáticamente ~5 s después de abrir (el `resetTimeout` configurado),
incluso mientras el stub seguía en `pending-forever` (opossum arma el timer al abrir, no espera a que
el proveedor se recupere). Al volver el stub a `healthy` y llegar la siguiente llamada — la primera
tras `half-open` — esa llamada de prueba se resolvió con éxito:

```json
{"estado":"aprobado","proveedor":"stub-kyc","validationId":"52f39b17-...","duracionMs":465}
```

y el circuito cerró automáticamente (`GET /circuit-status` → `{"estado":"closed", ...}`). Una
llamada adicional post-recuperación confirmó operación normal: `aprobado` en 463 ms.

### Conclusión de esta pieza

Los 3 comportamientos exigidos por el punto de sensibilidad del Experimento 1 se observaron con
datos reales: (a) latencia normal y rápida con el proveedor sano, (b) fail-fast (0–1 ms) tras abrir
el circuito en vez de seguir esperando el timeout completo del proveedor caído, y (c) recuperación
automática (`open` → `half-open` → `closed`) sin intervención manual una vez el proveedor vuelve a
responder. Estos resultados corresponden a esta pieza aislada (ACL Worker + stub); la medición de
impacto en la latencia p95 de "Suscripción" (criterios de éxito/fracaso del experimento completo,
README de diseño) queda pendiente para cuando se construya el consumidor simplificado de UNDER y los
guiones de k6, en una sesión siguiente.

## Alcance deliberadamente fuera de esta pieza

- No hay base de datos (más allá de Redis para la cola, ver abajo), autenticación de usuarios ni UI
  — no aplican a este experimento.
- `TruoraAdapter.ts` implementa la misma forma de contrato documentada pero **no fue probado contra
  el proveedor real** (no hay credenciales reales de Truora en este curso) — ver la advertencia en
  el propio archivo.

## Extensión: encolado fire-and-forget para el Consolidador KYC

Ver ["Extensión de diseño: Consolidador KYC (reconciliación diferida)"](../../DISENO-EXPERIMENTOS.md#extensión-de-diseño-consolidador-kyc-reconciliación-diferida)
en el README de diseño — es el contrato exacto que implementa esta sección. Cuando el fallback del
Circuit Breaker resuelve `degradado` (timeout interno o circuito abierto), además de responder a
quien llamó, se encola (fire-and-forget) un job `{ clienteId, timestamp }` en la cola BullMQ
`kyc-reconciliacion`, para que `../consolidador-kyc/` reintente más tarde.

**Módulo**: `src/infra/ColaReconciliacion.ts`. **Enganche**: dentro de `this.breaker.fallback(...)`
en `ServicioVerificacion.ts` — se llama `encolarReconciliacion(cliente.clienteId)` sin `await`.

- **Librería de cola**: BullMQ sobre Redis (mismo Redis que ya estaba en el diseño para el valor
  por defecto — no se introduce un broker nuevo). BullMQ requiere `ioredis` como cliente de
  conexión; se agregó como dependencia directa (no solo transitiva) para tener control explícito de
  sus opciones (`maxRetriesPerRequest: null`, requerido por BullMQ).
- **Nunca puede tumbar ni retrasar la respuesta a UNDER**: `encolarReconciliacion` nunca lanza hacia
  arriba — cualquier fallo (Redis caído, error de conexión) se loguea y se ignora. El listener
  `connection.on('error', ...)` evita que un error de conexión de ioredis se propague como excepción
  no capturada y tumbe el proceso.
- **Política de reintentos del job**: 5 intentos, backoff exponencial con 2000 ms de base
  (`attempts: 5, backoff: { type: 'exponential', delay: 2000 }`), configurados en `queue.add(...)` —
  son opciones del job, no del worker que lo consume (`consolidador-kyc/`). Si se agotan, BullMQ
  mueve el job a su *failed set* automáticamente (la "DLQ" del diagrama); no se construyó nada
  adicional para eso.

### Bandera técnica `origen` — necesaria para evitar una cadena sin fin de jobs

**Hallazgo real durante la verificación en vivo de esta extensión**: la primera versión encolaba un
job en *cualquier* resolución `degradado` de `ServicioVerificacion`, sin distinguir si la llamada
venía de UNDER o del propio `consolidador-kyc` reintentando. Como el Consolidador reintenta contra
`POST /verificaciones/kyc` — el mismo endpoint, la misma instancia de `ServicioVerificacion` — cada
reintento suyo que seguía degradado también encolaba un job **nuevo** (además del reintento que
BullMQ ya programa sobre el job original). Con el circuito abierto (fail-fast en ~1-2 ms), esto
generó **~95.000 jobs en poco más de un minuto** en la verificación inicial — una cadena sin fin
acotada solo por la velocidad del fail-fast, no por ningún límite real.

**Corrección aplicada**: `Cliente` (`domain/PuertoProveedorIdentidad.ts`) gana un campo opcional
`origen?: 'under' | 'consolidador'` — una bandera puramente técnica, no de negocio. El body de
`POST /verificaciones/kyc` acepta `origen` (default `'under'` si no viene); `consolidador-kyc/`
siempre envía `origen: 'consolidador'`. El fallback de `ServicioVerificacion` solo llama a
`encolarReconciliacion` cuando `cliente.origen !== 'consolidador'`. Con la corrección, N llamadas de
UNDER que resuelven degradado encolan exactamente N jobs — verificado en vivo (ver sección
siguiente).

## Variables de entorno adicionales (Consolidador KYC)

| Variable | Default | Descripción |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis compartido con `consolidador-kyc/` (cola) y `consumidor-under/` (lectura de estado consolidado). |

## Verificación en vivo de la extensión (2026-09-12, con Docker Compose)

Se levantó el stack completo (`docker compose up`, 5 servicios) y se repitió la secuencia de
verificación original más los pasos nuevos del Consolidador KYC:

1. **Stub `healthy`**: `con-kyc` siguió respondiendo `aprobado` en 322-485 ms (rango consistente con
   los 490-620 ms ya documentados; variación normal de Docker), `sin-kyc` en 28-49 ms — **sin cambio
   de comportamiento ni de latencia** por el encolado fire-and-forget.
2. **Stub `pending-forever`**: 3 llamadas agotaron el timeout (~3.1 s) hasta abrir el circuito;
   las siguientes fueron fail-fast (4 ms). Cada una de las 5 llamadas encoló exactamente un job
   (`[acl-worker][cola-reconciliacion] job encolado para clienteId=...`, 5 líneas totales) — **sin
   la cadena sin fin del hallazgo anterior**. `consolidador-kyc` mostró en sus logs sus propios
   reintentos contra el ACL Worker resolviendo `kyc_aun_degradado` e incrementando
   `intento N/5` con backoff exponencial visible entre cada uno.
3. **Stub de vuelta a `healthy`**: en el intento 5/5 de cada job, `consolidador-kyc` resolvió
   `aprobado` y escribió `kyc:estado:cliente-paso2` en Redis (confirmado con
   `redis-cli GET kyc:estado:cliente-paso2` → `{"estado":"aprobado","timestamp":...}`).
4. **Stub en modo `down`** (falla distinta a la del paso 2) para el mismo `clienteId`: `con-kyc`
   devolvió `{"estado":"suscripcion_aprobada","kyc":"aprobado","motivo":"kyc_reconciliado_por_consolidador",...}`
   — el estado consolidado de Redis, **no** el placeholder genérico. Una llamada de control con un
   `clienteId` nuevo (sin estado consolidado) sí devolvió el placeholder genérico
   `pendiente_verificacion`, confirmando que ambos caminos coexisten correctamente.
5. Se confirmó `bull:kyc-reconciliacion:*` acotado (10 claves) durante todo el proceso — sin
   crecimiento descontrolado — y se detuvo el stack (`docker compose down`) al terminar.

### Conclusión de la extensión

El comportamiento síncrono ya validado del Experimento 1 (criterios de éxito (a)/(b)/(c) del README
de diseño) **no se vio afectado**: mismas latencias, mismo comportamiento del circuito. La quinta
pieza demuestra el flujo completo de reconciliación diferida descrito en el diseño: encolado
fire-and-forget → reintento acotado por BullMQ vía el ACL Worker (nunca al proveedor directo) →
persistencia del resultado en Redis → lectura por UNDER en el siguiente intento degradado.
