# stub-kyc

Stub del proveedor de KYC para el Experimento 1 (Circuit Breaker/Retry en el ACL Worker). Imita el
contrato **asíncrono** real de Truora ([dev.truora.com](https://dev.truora.com/)) — crear→pollear,
no un simple síncrono 200/500 — según el "Refinamiento de diseño" en
[`../../README.md`](../../README.md).

Es andamiaje de prueba de un solo uso: **no** lleva estructura de puertos/adaptadores (esa capa
hexagonal es del ACL Worker, no de este stub — ver la sección "Alcance deliberadamente NO
hexagonal" del README de diseño).

## Contrato

- `POST /v1/validations` → `201` + `{ "validation_id": "<uuid>", "status": "pending" }`
- `GET /v1/validations/:id` → `{ "validation_id": "<uuid>", "status": "pending"|"success"|"failure" }`, o `404` si el id no existe.
- Header obligatorio en toda ruta `/v1/validations*`: `Truora-API-Key`. Si falta o está vacío → `401`.
- `GET /health` → chequeo simple de vida (no es parte del contrato de Truora).

## Modos de falla (endpoint de control, cambia el comportamiento en caliente sin reiniciar)

- `GET /control/mode` → `{ "mode": "healthy" }` (consulta el modo actual)
- `POST /control/mode` con body `{ "mode": "<modo>" }` (cambia el modo)

| Modo | Comportamiento |
|---|---|
| `healthy` (default) | `POST` crea en `pending`; `GET` resuelve a `success` tras una latencia simulada de `SIM_LATENCY_MIN_MS`–`SIM_LATENCY_MAX_MS` (200–500 ms por defecto), como un proveedor real. |
| `pending-forever` | `GET` siempre devuelve `pending`, nunca resuelve. |
| `error-429` | `POST` y `GET` responden `429` con el mensaje real documentado de Truora: *"There are too many high priority background checks being processed. Please try again later."* |
| `down` | El servidor no responde en absoluto a `/v1/validations*` (simula caída total). El proceso sigue vivo y `/control/mode` sigue funcionando para poder salir del modo. |

El modo se evalúa **en caliente en cada request**, no se congela al crear la validación — así se
puede inyectar una falla a mitad de una corrida de carga (k6) y afecta de inmediato a validaciones
ya creadas.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto donde escucha el servidor. |
| `SIM_LATENCY_MIN_MS` | `200` | Latencia mínima simulada antes de resolver a `success` en modo `healthy`. |
| `SIM_LATENCY_MAX_MS` | `500` | Latencia máxima simulada antes de resolver a `success` en modo `healthy`. |

## Cómo levantarlo

### Local (Node.js)

```bash
cd stub-kyc
npm install
npm run dev     # con nodemon, recarga en caliente
# o
npm start       # sin nodemon
```

### Docker

```bash
cd stub-kyc
docker build -t stub-kyc .
docker run --rm -p 4000:4000 -e PORT=4000 stub-kyc
```

## Probarlo manualmente con curl

Todas las pruebas asumen el servidor corriendo en `http://localhost:4000`.

### 1. Sin header `Truora-API-Key` → 401

```bash
curl -i -X POST http://localhost:4000/v1/validations
```

### 2. Modo `healthy` (default): flujo POST → GET termina en `success`

```bash
# Crear la validación
curl -i -X POST http://localhost:4000/v1/validations \
  -H "Truora-API-Key: test-key"

# Copiar el validation_id de la respuesta y consultarlo (repetir tras ~500ms)
curl -i http://localhost:4000/v1/validations/<validation_id> \
  -H "Truora-API-Key: test-key"
```

### 3. Modo `pending-forever`: el mismo flujo se queda en `pending`

```bash
curl -i -X POST http://localhost:4000/control/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "pending-forever"}'

curl -i -X POST http://localhost:4000/v1/validations \
  -H "Truora-API-Key: test-key"

curl -i http://localhost:4000/v1/validations/<validation_id> \
  -H "Truora-API-Key: test-key"
# -> siempre "status": "pending", sin importar cuántas veces se repita
```

### 4. Modo `error-429`: rate limit del proveedor

```bash
curl -i -X POST http://localhost:4000/control/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "error-429"}'

curl -i -X POST http://localhost:4000/v1/validations \
  -H "Truora-API-Key: test-key"
# -> 429 con el mensaje de rate limit de Truora
```

### 5. Modo `down`: caída total (no responde)

```bash
curl -i -X POST http://localhost:4000/control/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "down"}'

curl -i --max-time 3 -X POST http://localhost:4000/v1/validations \
  -H "Truora-API-Key: test-key"
# -> curl agota su --max-time sin respuesta (simula proveedor caído)

# Volver a un modo operativo:
curl -i -X POST http://localhost:4000/control/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "healthy"}'
```

## Notas de alcance

- Estado en memoria (`Map`), sin persistencia — se reinicia si el proceso se reinicia. Suficiente
  para un stub de experimento (ver README de diseño, sección "Amenazas a la validez").
- No implementa el estado `delayed` (horas/días) que documenta Truora para validaciones profundas
  — no está entre los 4 modos que el diseño del experimento decidió cubrir.
