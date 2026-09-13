# consolidador-kyc

Quinta pieza (aditiva) del Experimento 1 de arquitectura de Solventa. Reconcilia en segundo plano
los casos que el Circuit Breaker del `acl-worker/` degradó, sin tocar el camino síncrono
UNDER → ACL ya validado en las otras 4 piezas — ver
["Extensión de diseño: Consolidador KYC (reconciliación diferida)"](../../DISENO-EXPERIMENTOS.md#extensión-de-diseño-consolidador-kyc-reconciliación-diferida)
en el README de diseño, que es el contrato exacto que implementa este código.

**Stack: Python/RQ (Redis Queue) + FastAPI** (migrado desde Node.js/BullMQ el 2026-09-13 — ver
"Resultados y análisis" del Experimento 1 en `../../DISENO-EXPERIMENTOS.md`, y "Decisión sobre la
librería de cola" en `../acl-worker/README.md` para la justificación completa del cambio de
BullMQ a RQ).

Es un **worker de cola (RQ)**, no una API de negocio: no expone endpoints funcionales más allá de un
`/health` mínimo (FastAPI, por consistencia con el resto de servicios del experimento — corre en un
hilo aparte porque el hilo principal está ocupado con el loop bloqueante de `Worker.work()`).
Deliberadamente **sin estructura de puertos/adaptadores** — esa capa hexagonal es exclusiva del
`acl-worker/`; esta pieza es andamiaje de reconciliación, no el ACL boundary.

## Estructura

```
src/
├── jobs.py     # reconciliar_cliente(cliente_id, encolado_en_ms): el código que RQ ejecuta por job
└── worker.py   # arranca el Worker de RQ (con scheduler) + el health-check FastAPI
```

`jobs.py` vive en un módulo aparte porque RQ resuelve el job por su import path como string
(`"jobs.reconciliar_cliente"`, encolado desde `../acl-worker/src/infra/cola_reconciliacion.py`) —
el ACL Worker (productor) nunca importa este módulo ni conoce su código, solo el nombre.

## Qué hace

1. Consume la cola `kyc-reconciliacion` del mismo Redis que usa `acl-worker/` para encolar
   (fire-and-forget) cada vez que `ServicioVerificacion` resuelve una llamada como `degradado`.
2. Por cada job, vuelve a llamar **al ACL Worker** (`POST {ACL_WORKER_URL}/verificaciones/kyc`) —
   **nunca** al proveedor KYC directo. El ACL Worker sigue siendo el único punto de salida hacia
   proveedores externos (principio ACL ya establecido).
3. Si la respuesta es `aprobado`/`rechazado`, escribe `kyc:estado:<clienteId>` en Redis como
   `{"estado": "...", "timestamp": ...}` con TTL de 1 hora (`KYC_ESTADO_TTL_SEGUNDOS`).
4. Si sigue `degradado`, lanza una excepción dentro del job — eso hace que **RQ** programe el
   siguiente reintento según la política de backoff configurada por el productor (ver más abajo). Si
   se agotan los intentos, RQ mueve el job a su `FailedJobRegistry` automáticamente — es la "DLQ"
   del diseño, no se construye nada adicional para eso.

## Dónde vive la política de reintentos (decisión de diseño)

Los parámetros de reintento (`rq.Retry(max=4, interval=[2, 4, 8, 16])`) **no se configuran aquí**,
sino en el productor (`../acl-worker/src/infra/cola_reconciliacion.py`), porque son opciones de
`queue.enqueue(...)`, no del worker que consume. Este servicio solo decide, por job, si tuvo éxito
(no lanza) o si debe reintentarse (lanza una excepción) — RQ se encarga del resto con la config que
trae cada job: **5 intentos totales, backoff exponencial 2/4/8/16 s**.

## Por qué el Worker necesita `with_scheduler=True`

RQ solo mueve automáticamente los jobs con retry programado (`interval` > 0) de vuelta a la cola
cuando el hilo interno de *scheduling* está activo. Sin `worker.work(with_scheduler=True)` (ver
`worker.py`), los reintentos con backoff configurados por el productor quedarían encolados en el
registro "scheduled" de RQ pero nunca se dispararían — hallazgo verificado en vivo durante la
migración.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis compartido con `acl-worker/` (cola) y leído por `consumidor-under/` (estado consolidado). |
| `ACL_WORKER_URL` | `http://localhost:5000` | Base URL del ACL Worker — único destino permitido para reintentar la verificación. |
| `KYC_ESTADO_TTL_SEGUNDOS` | `3600` | TTL de `kyc:estado:<clienteId>` en Redis. |
| `CONSOLIDADOR_PORT` | `7000` | Puerto del `/health` mínimo (no esencial). |

## Cómo levantarlo

### Local (Python)

```bash
cd consolidador-kyc
python -m venv .venv && source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
python src/worker.py
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

# Ver jobs de la cola (claves de RQ)
redis-cli KEYS "rq:*"
```

## Verificación en vivo (2026-09-13, con Docker Compose)

Se levantó el stack completo y se repitió la secuencia de verificación original: con el stub en
`pending-forever`, cada llamada degradada del ACL Worker encoló exactamente un job (sin la cadena
sin fin corregida por la bandera `origen`, preservada de la versión Node — ver
`../acl-worker/README.md`); los logs de `consolidador-kyc` mostraron sus reintentos contra el ACL
Worker resolviendo `kyc_aun_degradado` mientras el circuito seguía abierto. Al volver el stub a
`healthy`, un reintento posterior resolvió `aprobado` y escribió `kyc:estado:<clienteId>` en Redis
— confirmado con `redis-cli GET`. El comportamiento es funcionalmente idéntico al documentado en la
versión Node.

## Alcance deliberadamente fuera de esta pieza

- Sin puertos/adaptadores (ver nota de alcance arriba).
- Sin dashboard de administración de la cola, sin API de reintentos manuales, sin UI — el objetivo
  es demostrar el flujo de reconciliación diferida, no construir un producto de mensajería.
- La decisión de negocio de qué hacer si UNDER ya emitió una póliza con `pendiente_verificacion` y
  este servicio luego resuelve `rechazado` queda explícitamente fuera de alcance (ver el README de
  diseño) — es un flujo de reversión/revisión de producto, no de arquitectura.
