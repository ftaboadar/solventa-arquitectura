# acl-worker

ACL Worker de KYC para el Experimento 1 (Circuit Breaker/Retry) de arquitectura de Solventa. Es la
única pieza de este experimento que lleva estructura de **puertos y adaptadores (hexagonal)** — ver
["Refinamiento de diseño"](../../DISENO-EXPERIMENTOS.md#refinamiento-de-diseño-contrato-del-stub-y-arquitectura-interna-del-acl-worker)
en el README de diseño. El stub de KYC (`../stub-kyc/`) y el consumidor simplificado de UNDER
(`../consumidor-under/`) son andamiaje de prueba y deliberadamente **no** llevan esta estructura.

**Stack: Python/FastAPI** (migrado desde Node.js/TypeScript el 2026-09-13 — ver "Resultados y
análisis" del Experimento 1 en [`../../DISENO-EXPERIMENTOS.md`](../../DISENO-EXPERIMENTOS.md) para
los números re-verificados tras la migración). El contrato HTTP no cambió: mismas rutas, mismos
códigos de estado, mismas variables de entorno — los guiones de `../k6/` siguen funcionando sin
cambios contra este servicio. La estructura hexagonal (puertos/adaptadores) y el contrato del
Consolidador KYC se preservaron intactos; lo que cambió fue el lenguaje y las librerías concretas
de Circuit Breaker/cola (ver más abajo, con la justificación de cada una).

## Estructura

```
src/
├── domain/puerto_proveedor_identidad.py   # puerto: verificar(cliente) -> ResultadoVerificacion
├── adapters/
│   ├── stub_kyc_adapter.py                # implementa el puerto contra stub-kyc/ (HTTP)
│   └── truora_adapter.py                  # mismo puerto contra la baseUrl real de Truora — NO probado
├── application/servicio_verificacion.py   # orquesta: adaptador inyectado + Circuit Breaker (purgatory) + retry
├── infra/cola_reconciliacion.py           # productor de la cola RQ "kyc-reconciliacion"
├── http/server.py                         # endpoint HTTP (FastAPI) que consume UNDER
└── config.py                              # variables de entorno centralizadas
```

El dominio y la aplicación nunca instancian un adaptador concreto — `http/server.py` decide cuál
inyectar según `KYC_PROVIDER` y se lo pasa a `ServicioVerificacion` por el constructor.

## El ciclo asíncrono del proveedor vive dentro del adaptador

Tal como decide el README de diseño, UNDER → ACL es una llamada **síncrona** (no hay Pub/Sub aquí:
es una dependencia de decisión de negocio antes de emitir la póliza). Pero el proveedor real
(Truora) es internamente **asíncrono** (crear → pollear). Por eso cada adaptador (`StubKycAdapter`,
`TruoraAdapter`) implementa el ciclo completo:

1. `POST /v1/validations` con header `Truora-API-Key` → `validation_id`.
2. Polling propio contra `GET /v1/validations/:id` cada `POLL_INTERVAL_MS` hasta `success`/`failure`.
3. Si no resuelve dentro de `KYC_TIMEOUT_MS` (umbral T del ASR), **lanza una excepción** — nunca se
   queda esperando indefinidamente. Así es como el adaptador se comporta correctamente ante los
   modos `pending-forever`/`down` del stub (que, por diseño, nunca dicen que no — solo nunca
   contestan).

`ServicioVerificacion` y `http/server.py` nunca ven el detalle de este polling: solo reciben un
`ResultadoVerificacion` ya resuelto (`aprobado`/`rechazado`) o una excepción que el Circuit Breaker
convierte en `degradado`.

> **`KYC_TIMEOUT_MS` (default 1500 ms) es un valor de referencia.** El diseño (README, sección
> "Refinamiento de diseño" y su checklist) todavía no lo calibra contra un SLA real de Solventa — el
> backlog trae criterios cualitativos ("en línea", "de forma inmediata") pero no un número. Este
> default es razonable para hacer el experimento observable, no una cifra de producción.

## Por qué el puerto y los adaptadores son SÍNCRONOS (no `async def`)

A diferencia de la versión original en TypeScript (`Promise<ResultadoVerificacion>`), el puerto
`PuertoProveedorIdentidad.verificar()` y ambos adaptadores son funciones **síncronas** en Python —
ver la sección siguiente sobre la librería de Circuit Breaker: `purgatory` (la elegida) tiene una
variante `Sync` pensada para código bloqueante con hilos, y mezclar esa variante con
`httpx.AsyncClient`/`asyncio.sleep` habría sido innecesariamente complejo. `ServicioVerificacion`
completa (adaptador + retry + breaker) corre dentro de un hilo (`asyncio.to_thread`, invocado desde
`http/server.py`) para no bloquear el event loop de FastAPI mientras una verificación está en curso.

## Decisión sobre la librería de retry

Ninguna librería de Circuit Breaker de Python evaluada (`pybreaker`, `purgatory`) trae retry
incorporado — igual que `opossum` en la versión Node. Se mantiene la misma implementación propia de
~15 líneas (`_con_reintento` dentro de `servicio_verificacion.py`) por las mismas dos razones ya
documentadas en la versión original:

1. El comportamiento requerido es simple (N intentos con backoff exponencial `base * 2^(intento-1)`)
   y no justifica una dependencia adicional.
2. **El retry debe ejecutarse *dentro* de la acción que envuelve el breaker, no por fuera.** Si se
   reintentara por fuera, el circuito vería cada reintento como una llamada independiente,
   distorsionando sus métricas de tasa de error. Con el retry adentro, cada llamada de UNDER produce
   una sola ejecución protegida — éxito o fallo final — que es lo que el breaker necesita para
   decidir correctamente cuándo abrir el circuito.

`RETRY_ATTEMPTS` (default 2, es decir 1 reintento) y `RETRY_BASE_DELAY_MS` (default 100 ms) siguen
siendo valores de referencia — con 2 intentos y `KYC_TIMEOUT_MS=1500`, el peor caso de una sola
llamada de UNDER es de ~3.1 s antes de que el Circuit Breaker cuente un fallo (idéntico a la versión
Node, ver resultados de verificación abajo).

## Decisión sobre la librería de Circuit Breaker: de `pybreaker` a `purgatory`

Se evaluaron dos librerías idiomáticas de Python (las mismas que sugiere el encargo de migración):

### Intento 1: `pybreaker` (descartado tras un hallazgo real en la verificación de carga)

`pybreaker.CircuitBreaker` fue la primera opción — API simple, muy usada, con `CircuitBreaker(
fail_max, reset_timeout, listeners=[...])` y `breaker.call(func, *args)`. La migración inicial (con
`fail_max=BREAKER_VOLUME_THRESHOLD`, `reset_timeout=BREAKER_RESET_TIMEOUT_MS/1000`) pasó todas las
pruebas manuales (aprobado en healthy, fail-fast tras abrir, recuperación automática), pero **la
corrida de carga con k6 (`baseline.js`) reveló un problema real**: con 8 VUs concurrentes contra el
stub en modo `healthy`, `con-kyc` daba p95 ≈ **2.9-3.2 s** — muy por encima de los ~600 ms
esperados (y de lo medido en Node). Se investigó con pruebas dirigidas (8 requests directos y
paralelos contra `/verificaciones/kyc`) y el patrón de latencias fue inequívoco: **incrementos
lineales de ~450 ms por llamada** (520 ms, 831 ms, 1288 ms, 1745 ms, ...), la firma clásica de
ejecuciones **serializadas**, no paralelas.

Revisando el código fuente de `pybreaker` (`CircuitBreaker.call`, línea ~246-251 de
`pybreaker/__init__.py` en la versión 1.2.0):

```python
def call(self, func, *args, **kwargs):
    with self._lock:                      # threading.RLock()
        return self.state.call(func, *args, **kwargs)   # ejecuta func() AQUÍ, con el lock tomado
```

`pybreaker` mantiene un `threading.RLock` **tomado durante toda la ejecución de `func()`**, no solo
durante la actualización de sus contadores internos. Esto serializa por completo cualquier uso
concurrente del breaker: aunque `asyncio.to_thread` lanzara 8 hilos en paralelo, todos terminaban
esperando turno para entrar al único `with self._lock:` del breaker compartido. Es un diseño
razonable si se protege una única dependencia de baja concurrencia, pero incompatible con el ASR de
este experimento (el ACL Worker debe absorber tráfico concurrente de UNDER sin volverse él mismo el
cuello de botella).

### Elegida: `purgatory` (`SyncCircuitBreakerFactory`)

[`purgatory`](https://github.com/mardiros/purgatory) expone una variante síncrona
(`SyncCircuitBreakerFactory`) que se usa como context manager: `with breaker: resultado = accion()`.
Revisando su código (`purgatory.domain.model.Context.__enter__`/`__exit__`), **no hay ningún lock**:
`__enter__` solo verifica el estado actual (lanza `OpenedState`, que es a la vez el estado Y la
excepción, si el circuito está abierto) y `__exit__` solo actualiza el contador de fallos/estado
según si el bloque `with` lanzó una excepción o no. La función protegida (`accion()`) se ejecuta
**fuera** de cualquier sección crítica — verificado repitiendo la misma prueba de 8 llamadas
paralelas tras el cambio: los 8 requests resolvieron en **360-675 ms cada uno** (concurrentes de
verdad), y el `baseline.js` de k6 volvió a dar el p95 ≈ 600 ms esperado.

**Trade-off aceptado, documentado explícitamente**: al no haber lock, `purgatory` no protege sus
contadores de `failure_count`/estado contra condiciones de carrera bajo concurrencia muy alta (dos
hilos fallando en el mismo instante podrían pisarse el incremento del contador). Para la escala de
este experimento (8 VUs) esto no se observó como un problema — el circuito abrió y cerró de forma
correcta y consistente en todas las corridas — pero es un límite conocido de la elección, no una
garantía formal de exactitud bajo alta concurrencia.

**Mapeo de parámetros** (mismo modelo de fallos CONSECUTIVOS que `pybreaker`, distinto de la ventana
móvil + % de error de `opossum` — ver la nota en `config.py` sobre qué variables de entorno de
`opossum` ya no aplican):

| purgatory | Variable de entorno | Rol |
|---|---|---|
| `default_threshold` | `BREAKER_VOLUME_THRESHOLD` (default 3) | Fallos consecutivos que abren el circuito. |
| `default_ttl` | `BREAKER_RESET_TIMEOUT_MS` (default 5000, convertido a segundos) | Tiempo que el circuito permanece abierto antes de la próxima llamada de prueba (half-open). |

`BREAKER_ERROR_THRESHOLD_PERCENTAGE`, `BREAKER_ROLLING_COUNT_TIMEOUT_MS` y
`BREAKER_ROLLING_COUNT_BUCKETS` (específicos del modelo de ventana móvil de `opossum`) **ya no
existen** como variables de entorno en esta versión — no tienen equivalente en un breaker de fallos
consecutivos.

### Decisión sobre la librería de cola: de `BullMQ` a `RQ` (Redis Queue)

`BullMQ` es una librería de Node.js; no se usó su puerto experimental a Python por preferir una
librería nativa y madura del ecosistema Python. Se eligió [`RQ`](https://python-rq.org/) porque:

1. Usa el mismo Redis que ya está en el diseño (ningún broker nuevo).
2. Soporta reintentos con backoff (`rq.Retry(max=4, interval=[2, 4, 8, 16])`, ver
   `infra/cola_reconciliacion.py`) — mismos 5 intentos totales y el mismo backoff 2/4/8/16 s que la
   versión Node.
3. Su `FailedJobRegistry` cumple el mismo rol que el *failed set* de BullMQ como "DLQ" del diagrama.
4. RQ encola funciones por su **import path como string** (`"jobs.reconciliar_cliente"`) — el ACL
   Worker (productor) nunca importa ni conoce el código real de esa función, que vive solo en
   `../consolidador-kyc/src/jobs.py`. Ver ese README para el detalle.
5. Requiere habilitar explícitamente el *scheduler* interno del Worker
   (`worker.work(with_scheduler=True)`, en `../consolidador-kyc/src/worker.py`) para que los
   reintentos con `interval` (backoff) se disparen — sin eso, RQ encola el reintento pero nunca lo
   mueve de vuelta a la cola.

## Circuit Breaker: transiciones observables

`ServicioVerificacion` registra un listener (`SyncCircuitBreakerFactory.add_listener`) que loguea a
stdout cada `state_changed` (`opened`/`half-opened`/`closed`) con el prefijo
`[acl-worker] acl-worker.circuit: transición -> ...` — necesario para poder observar en los logs que
el circuito cierra solo al recuperarse el proveedor (criterio de éxito del experimento). También se
mantienen contadores propios (`fires`, `successes`, `failures`, `timeouts`, `rejects`, `fallbacks`)
expuestos en `/circuit-status`, porque ni `pybreaker` ni `purgatory` traen ese desglose incorporado
(a diferencia de `opossum.stats` en la versión Node).

## Endpoints

| Método/ruta | Descripción |
|---|---|
| `POST /verificaciones/kyc` | Body `{ "clienteId": "..." }`. Responde `200` siempre, con `{ estado: 'aprobado'|'rechazado'|'degradado', ... , duracionMs }`. Este es el endpoint que consume el consumidor de UNDER. |
| `GET /circuit-status` | Solo lectura. `{ estado: 'closed'|'open'|'halfOpen', habilitado, stats }`. |
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
| `BREAKER_VOLUME_THRESHOLD` | `3` | Fallos consecutivos que abren el circuito (`purgatory.default_threshold`). |
| `BREAKER_RESET_TIMEOUT_MS` | `5000` | Tiempo que el circuito permanece abierto antes de la próxima llamada de prueba (`purgatory.default_ttl`, convertido a segundos). |
| `REDIS_URL` | `redis://localhost:6379` | Redis compartido con `../consolidador-kyc/` (cola RQ) y `../consumidor-under/` (lectura de estado consolidado). |

## Cómo levantarlo

### Local (Python)

```bash
cd acl-worker
python -m venv .venv && source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
python -m src.http.server
```

Requiere el `stub-kyc/` corriendo en `http://localhost:4000` cuando `KYC_PROVIDER=stub` (default), y
Redis corriendo en `REDIS_URL` para el encolado de reconciliación.

### Docker

```bash
cd acl-worker
docker build -t acl-worker .
docker run --rm -p 5000:5000 -e KYC_BASE_URL=http://host.docker.internal:4000 acl-worker
```

## Verificación en vivo — versión Python (2026-09-13)

Se levantó el stack completo con Docker Compose (`stub-kyc`, `acl-worker`, `consumidor-under`,
`consolidador-kyc`, `redis`) y se repitió la secuencia de verificación original:

### (a) Stub en `healthy`

```json
{"estado":"aprobado","proveedor":"stub-kyc","validationId":"9a3d8cae-...","duracionMs":304}
```

`GET /circuit-status` → `{"estado":"closed", ...}`. Latencia consistente con el rango simulado del
stub (200-500 ms) + overhead — sin degradar.

### (b) Stub en `pending-forever`

Igual que en Node: las primeras llamadas agotan `KYC_TIMEOUT_MS` + 1 reintento (~3.1 s cada una) y
resultan en `degradado`; al alcanzar `BREAKER_VOLUME_THRESHOLD=3` fallos consecutivos el circuito
abre y las llamadas siguientes responden **fail-fast en 45-56 ms** de tiempo de red (0-1 ms de
`duracionMs` interno).

### (c) Recuperación automática

Al volver el stub a `healthy`, los logs muestran las transiciones automáticas sin intervención
manual:

```
[acl-worker] acl-worker.circuit: transición -> OPEN (fail-fast activado, no se llamará más al proveedor hasta el reset)
[acl-worker] acl-worker.circuit: transición -> HALF-OPEN (probando si el proveedor ya respondió)
[acl-worker] acl-worker.circuit: transición -> CLOSED (proveedor recuperado, tráfico normal)
```

### Carga real con k6 (ver `../k6/README.md` para el detalle completo)

| Escenario | `con-kyc` p95 | `sin-kyc` p95 | `http_req_failed` |
|---|---|---|---|
| Baseline (KYC sano) | 608.6 ms | 48.6 ms | 0% (336/336 checks OK) |
| Falla inyectada (KYC caído 15-45s) | 3.1 s | 49.7 ms | 0% (627/627 checks OK) |

Números prácticamente idénticos a los medidos en Node (616.6 ms / 50.8 ms baseline; 3.1 s / 49.6 ms
falla inyectada) — la migración de lenguaje no cambió el comportamiento observable del experimento,
una vez corregido el hallazgo de `pybreaker` documentado arriba.

### Nota importante sobre el proceso de verificación

La corrida de carga inicial con `pybreaker` (antes del cambio a `purgatory`) SÍ pasó los thresholds
declarados en `baseline.js` (`p(95)<10000` para con-kyc) porque ese umbral es deliberadamente laxo —
un p95 de 2.9 s todavía "pasa" un threshold de 10 s. Esto es un recordatorio de que los thresholds
de k6 (pensados para no fallar la corrida durante fallas inyectadas reales) no sustituyen comparar
los números reales contra la línea base esperada; el hallazgo se detectó comparando el p95 medido
contra el ~600 ms ya documentado en Node, no porque k6 marcara la corrida como fallida.

## Alcance deliberadamente fuera de esta pieza

- No hay base de datos (más allá de Redis para la cola, ver abajo), autenticación de usuarios ni UI
  — no aplican a este experimento.
- `truora_adapter.py` implementa la misma forma de contrato documentada pero **no fue probado contra
  el proveedor real** (no hay credenciales reales de Truora en este curso) — ver la advertencia en
  el propio archivo.

## Extensión: encolado fire-and-forget para el Consolidador KYC

Ver ["Extensión de diseño: Consolidador KYC (reconciliación diferida)"](../../DISENO-EXPERIMENTOS.md#extensión-de-diseño-consolidador-kyc-reconciliación-diferida)
en el README de diseño — es el contrato exacto que implementa esta sección. Cuando el fallback del
Circuit Breaker resuelve `degradado` (timeout interno o circuito abierto), además de responder a
quien llamó, se encola (fire-and-forget, en un hilo aparte) un job `(clienteId, timestamp)` en la
cola RQ `kyc-reconciliacion`, para que `../consolidador-kyc/` reintente más tarde.

**Módulo**: `src/infra/cola_reconciliacion.py`. **Enganche**: dentro de `_fallback(...)` en
`servicio_verificacion.py` — se llama `encolar_reconciliacion(cliente.cliente_id)` desde un
`threading.Thread` propio (equivalente al `.then()/.catch()` sin `await` de la versión Node).

- **Nunca puede tumbar ni retrasar la respuesta a UNDER**: `encolar_reconciliacion` nunca lanza hacia
  arriba — cualquier fallo (Redis caído, error de conexión) se loguea y se ignora. Además corre en un
  hilo separado, así que ni siquiera el tiempo del `PUSH` a Redis se suma a la respuesta.
- **Política de reintentos del job**: 5 intentos totales (1 inicial + 4 reintentos), backoff
  exponencial 2/4/8/16 s (`rq.Retry(max=4, interval=[2, 4, 8, 16])`), configurados en
  `queue.enqueue(...)` — mismos números que la versión Node/BullMQ. Si se agotan, RQ mueve el job a
  su `FailedJobRegistry` automáticamente (la "DLQ" del diagrama); no se construyó nada adicional para
  eso.

### Bandera técnica `origen` — necesaria para evitar una cadena sin fin de jobs

Se preserva sin cambios el hallazgo y la corrección ya documentados en la versión Node: sin la
bandera `origen` (`'under'` por defecto, `'consolidador'` cuando la llamada viene del Consolidador
KYC reintentando), cada reintento del Consolidador que sigue degradado encolaría un job **nuevo**
además del que RQ ya programa sobre el job original, generando una cadena sin fin mientras el
circuito esté abierto. `Cliente.origen` (`domain/puerto_proveedor_identidad.py`) transporta esa
bandera; `ServicioVerificacion._fallback` solo encola cuando `cliente.origen != 'consolidador'`.
