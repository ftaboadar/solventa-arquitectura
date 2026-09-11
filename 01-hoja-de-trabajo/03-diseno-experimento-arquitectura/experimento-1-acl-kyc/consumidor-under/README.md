# consumidor-under

Consumidor simplificado de UNDER (Suscripción) para el Experimento 1 (Circuit Breaker/Retry) de
arquitectura de Solventa. Es andamiaje de prueba de un solo uso: **no** lleva estructura de
puertos/adaptadores (esa capa hexagonal es del `acl-worker/`, no de esta pieza — ver la sección
"Alcance deliberadamente NO hexagonal" del [README de diseño](../../README.md)).

Expone dos endpoints porque el criterio de éxito (a) del experimento compara explícitamente la
latencia de solicitudes dependientes de KYC contra las que no dependen de KYC:

| Endpoint | Depende de KYC | Comportamiento |
|---|---|---|
| `POST /suscripcion/con-kyc` | Sí | Llama a `POST {ACL_WORKER_URL}/verificaciones/kyc` con un timeout propio corto. Si el ACL Worker responde `degradado`, o si el timeout propio se cumple, responde igual `200` con la suscripción "pendiente de verificación" — nunca un 5xx visible al usuario. |
| `POST /suscripcion/sin-kyc` | No | No toca el ACL Worker. Simula ~20-50 ms de trabajo trivial de suscripción y responde rápido. Es el control del experimento: debe mantenerse dentro de su SLA normal aunque KYC esté caído. |
| `GET /health` | — | Chequeo simple de vida. |

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

## Cómo levantarlo

### Local (Node.js)

```bash
cd consumidor-under
npm install
npm run dev     # con nodemon, recarga en caliente
# o
npm start       # sin nodemon
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
