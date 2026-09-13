# consumidor-under

Consumidor simplificado de UNDER (Suscripción) para el Experimento 1 (Circuit Breaker/Retry) de
arquitectura de Solventa. Es andamiaje de prueba de un solo uso: **no** lleva estructura de
puertos/adaptadores (esa capa hexagonal es del `acl-worker/`, no de esta pieza — ver la sección
"Alcance deliberadamente NO hexagonal" del [README de diseño](../../DISENO-EXPERIMENTOS.md)).

**Stack: Python/FastAPI** (migrado desde Node.js/Express el 2026-09-13 — ver "Resultados y
análisis" del Experimento 1 en `../../DISENO-EXPERIMENTOS.md`). Mismas rutas y comportamiento; los
guiones de `../k6/` siguen funcionando sin cambios.

Expone dos endpoints porque el criterio de éxito (a) del experimento compara explícitamente la
latencia de solicitudes dependientes de KYC contra las que no dependen de KYC:

| Endpoint | Depende de KYC | Comportamiento |
|---|---|---|
| `POST /suscripcion/con-kyc` | Sí | Llama a `POST {ACL_WORKER_URL}/verificaciones/kyc` con un timeout propio corto. Si el ACL Worker responde `degradado`, lee primero `kyc:estado:<clienteId>` en Redis (ver sección "Extensión: lectura del estado consolidado" abajo); si no hay nada, responde `200` con la suscripción "pendiente de verificación" — nunca un 5xx visible al usuario. |
| `POST /suscripcion/sin-kyc` | No | No toca el ACL Worker. Simula ~20-50 ms de trabajo trivial de suscripción y responde rápido. Es el control del experimento: debe mantenerse dentro de su SLA normal aunque KYC esté caído. |
| `GET /health` | — | Chequeo simple de vida. |

## Extensión: lectura del estado consolidado (Consolidador KYC)

Ver ["Extensión de diseño: Consolidador KYC (reconciliación diferida)"](../../DISENO-EXPERIMENTOS.md#extensión-de-diseño-consolidador-kyc-reconciliación-diferida),
punto 6 del contrato. Cuando el ACL Worker responde `degradado`, **antes** de devolver el
placeholder genérico `pendiente_verificacion`, este consumidor lee `kyc:estado:<clienteId>` en
Redis (mismo Redis que usan `acl-worker/` y `consolidador-kyc/`). Si existe un estado consolidado
de un intento de reconciliación anterior (`{estado, timestamp}`), se usa en la respuesta en vez del
placeholder genérico; si no existe (o la lectura falla), se conserva el comportamiento previo.

- **Cliente Redis**: `redis` (redis-py, `redis.asyncio`), el mismo paquete usado en `acl-worker/` y
  `consolidador-kyc/` por consistencia.
- **Por qué la lectura no puede convertirse en el nuevo cuello de botella**: se configuró con
  `socket_connect_timeout=0.3` y `socket_timeout=0.3` (segundos) — si Redis está caído o lento, la
  lectura falla rápido, se loguea (no bloqueante) y se cae al placeholder genérico. Nunca se espera
  indefinidamente por Redis.
- **Nueva variable de entorno**: `REDIS_URL` (default `redis://localhost:6379`).

## Por qué el timeout propio (`UNDER_HTTP_TIMEOUT_MS`) es 4000 ms por default

El ACL Worker documenta un peor caso de ~3.1 s por llamada fallida (`KYC_TIMEOUT_MS=1500` +
backoff + reintento, ver `acl-worker/README.md`). `UNDER_HTTP_TIMEOUT_MS=4000` da margen sobre ese
peor caso para no cortar una llamada legítima que el ACL Worker sí iba a resolver, pero sigue
acotado: `con-kyc` nunca espera indefinidamente, incluso si el ACL Worker se cuelga.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `UNDER_PORT` | `6000` | Puerto propio del consumidor. |
| `ACL_WORKER_URL` | `http://localhost:5000` | Base URL del ACL Worker. |
| `UNDER_HTTP_TIMEOUT_MS` | `4000` | Timeout propio de la llamada a `con-kyc` hacia el ACL Worker. |
| `SIN_KYC_MIN_MS` / `SIN_KYC_MAX_MS` | `20` / `50` | Rango del trabajo trivial simulado en `sin-kyc`. |
| `REDIS_URL` | `redis://localhost:6379` | Redis compartido, para leer `kyc:estado:<clienteId>` (ver extensión del Consolidador KYC arriba). |

## Cómo levantarlo

### Local (Python)

```bash
cd consumidor-under
python -m venv .venv && source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
python src/server.py
```

Requiere el `acl-worker/` corriendo (default `http://localhost:5000`) para que `con-kyc` tenga algo
que llamar; `sin-kyc` funciona incluso sin el ACL Worker levantado.

### Docker

```bash
cd consumidor-under
docker build -t consumidor-under .
docker run --rm -p 6000:6000 -e ACL_WORKER_URL=http://host.docker.internal:5000 consumidor-under
```

## Probarlo manualmente con curl

```bash
# Flujo que depende de KYC
curl -i -X POST http://localhost:6000/suscripcion/con-kyc \
  -H "Content-Type: application/json" \
  -d '{"clienteId": "cliente-1"}'

# Flujo que NO depende de KYC (control del experimento)
curl -i -X POST http://localhost:6000/suscripcion/sin-kyc \
  -H "Content-Type: application/json" \
  -d '{"clienteId": "cliente-1"}'

curl -i http://localhost:6000/health
```

## Alcance deliberadamente fuera de esta pieza

- Sin lógica de negocio real de suscripción, sin persistencia, sin autenticación.
- Sin estructura de puertos/adaptadores (ver nota de alcance arriba).
- La medición de impacto en p95 se hace con los guiones de `../k6/`, no aquí.
