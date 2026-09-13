# consolidador-kyc

Quinta pieza (aditiva) del Experimento 1 de arquitectura de Solventa. Reconcilia en segundo plano
los casos que el Circuit Breaker del `acl-worker/` degradó, sin tocar el camino síncrono
UNDER → ACL ya validado en las otras 4 piezas — ver
["Extensión de diseño: Consolidador KYC (reconciliación diferida)"](../../DISENO-EXPERIMENTOS.md#extensión-de-diseño-consolidador-kyc-reconciliación-diferida)
en el README de diseño, que es el contrato exacto que implementa este código.

Es un **worker de cola (BullMQ)**, no una API de negocio: no expone endpoints funcionales, solo un
`/health` mínimo (con el módulo `http` nativo, sin Express) útil para el healthcheck de
docker-compose. Deliberadamente **sin estructura de puertos/adaptadores** — esa capa hexagonal es
exclusiva del `acl-worker/`; esta pieza es andamiaje de reconciliación, no el ACL boundary.

## Qué hace

1. Consume la cola `kyc-reconciliacion` del mismo Redis que usa `acl-worker/` para encolar
   (fire-and-forget) cada vez que `ServicioVerificacion` resuelve una llamada como `degradado`.
2. Por cada job `{ clienteId, timestamp }`, vuelve a llamar **al ACL Worker**
   (`POST {ACL_WORKER_URL}/verificaciones/kyc`) — **nunca** al proveedor KYC directo. El ACL Worker
   sigue siendo el único punto de salida hacia proveedores externos (principio ACL ya establecido).
3. Si la respuesta es `aprobado`/`rechazado`, escribe `kyc:estado:<clienteId>` en Redis como
   `{"estado": "...", "timestamp": ...}` con TTL de 1 hora (`KYC_ESTADO_TTL_SEGUNDOS`).
4. Si sigue `degradado`, lanza un error dentro del processor — eso hace que **BullMQ** programe el
   siguiente reintento según la política de backoff configurada por el productor (ver más abajo).
   Si se agotan los intentos, BullMQ mueve el job a su *failed set* automáticamente — es la "DLQ"
   del diseño, no se construye nada adicional para eso.

## Dónde vive la política de reintentos (decisión de diseño)

Los parámetros `attempts`/`backoff` de cada job **no se configuran aquí**, sino en el productor
(`../acl-worker/src/infra/ColaReconciliacion.ts`, función `encolarReconciliacion`), porque son
opciones de `queue.add(...)`, no del worker que consume. Este servicio solo decide, por job, si
tuvo éxito (no lanza) o si debe reintentarse (lanza un error) — BullMQ se encarga del resto con la
config que trae cada job: **5 intentos, backoff exponencial con 2000 ms de base**.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis compartido con `acl-worker/` (cola) y leído por `consumidor-under/` (estado consolidado). |
| `ACL_WORKER_URL` | `http://localhost:5000` | Base URL del ACL Worker — único destino permitido para reintentar la verificación. |
| `KYC_ESTADO_TTL_SEGUNDOS` | `3600` | TTL de `kyc:estado:<clienteId>` en Redis. |
| `CONSOLIDADOR_PORT` | `7000` | Puerto del `/health` mínimo (no esencial). |

## Cómo levantarlo

### Local (Node.js)

```bash
cd consolidador-kyc
npm install
npm run dev     # node --watch
# o
npm start
```

Requiere Redis (`docker run -p 6379:6379 redis:7-alpine`) y el `acl-worker/` corriendo.

### Docker

```bash
cd consolidador-kyc
docker build -t consolidador-kyc .
docker run --rm \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e ACL_WORKER_URL=http://host.docker.internal:5000 \
  -p 7000:7000 consolidador-kyc
```

Normalmente se levanta junto con el resto vía `../docker-compose.yml` (`docker compose up`).

## Inspeccionar la cola/estado manualmente con redis-cli

```bash
# Ver el estado consolidado de un cliente
redis-cli GET kyc:estado:cliente-1

# Ver jobs esperando/activos de la cola (claves de BullMQ)
redis-cli KEYS "bull:kyc-reconciliacion:*"
```

## Alcance deliberadamente fuera de esta pieza

- Sin puertos/adaptadores (ver nota de alcance arriba).
- Sin dashboard de administración de la cola, sin API de reintentos manuales, sin UI — el objetivo
  es demostrar el flujo de reconciliación diferida, no construir un producto de mensajería.
- La decisión de negocio de qué hacer si UNDER ya emitió una póliza con `pendiente_verificacion` y
  este servicio luego resuelve `rechazado` queda explícitamente fuera de alcance (ver el README de
  diseño) — es un flujo de reversión/revisión de producto, no de arquitectura.
