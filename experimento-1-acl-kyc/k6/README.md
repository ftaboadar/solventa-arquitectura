# k6 — Experimento 1 (ACL Worker de KYC)

Guiones de carga para medir el criterio de éxito (a) del Experimento 1: que la latencia p95 de
Suscripción para solicitudes **no** dependientes de KYC se mantenga dentro de su SLA normal aun con
KYC caído. Ambos scripts apuntan a `consumidor-under` (UNDER), **no** directo al ACL Worker — el
punto es medir el impacto en "Suscripción", no en el ACL Worker por sí solo (eso ya se verificó de
forma aislada en `../acl-worker/README.md`).

Estos scripts son agnósticos al lenguaje del backend — no cambiaron cuando las 4 piezas del
experimento se migraron de Node.js a Python (2026-09-13): el contrato HTTP (rutas, códigos de
estado, `/control/mode`) se preservó exactamente. Ver "Resultados y análisis" del Experimento 1 en
`../../DISENO-EXPERIMENTOS.md` para los números re-verificados contra el stack Python.

Requiere los tres servicios del experimento levantados: `stub-kyc` (4000), `acl-worker` (5000 o el
puerto que se use) y `consumidor-under` (6000).

## `baseline.js`

Línea base: el stub debe estar en modo `healthy` **antes** de correr el script y se mantiene así
durante toda la corrida — este script no toca `/control/mode`. VUs constantes (default 8, 30s)
golpeando `con-kyc` y `sin-kyc`, con tags `{ endpoint: 'con-kyc' }` / `{ endpoint: 'sin-kyc' }` para
poder leer el p95 de cada uno por separado en el resumen.

```bash
# Asegurar el stub en healthy antes de correr
curl -s -X POST http://localhost:4000/control/mode -H "Content-Type: application/json" -d '{"mode":"healthy"}'

k6 run baseline.js
```

Qué esperar en el resumen: `http_req_duration{endpoint:con-kyc}` con p95 cercano a la latencia
simulada del stub sano (~200-500 ms + overhead), y `http_req_duration{endpoint:sin-kyc}` con p95
bajo (decenas de ms), porque ese endpoint nunca toca el ACL Worker.

## `falla-inyectada.js`

Dos `scenarios` de k6 corriendo en paralelo:

- `carga`: mismos parámetros que `baseline.js` (VUs constantes golpeando `con-kyc`/`sin-kyc` con los
  mismos tags), durante 60s.
- `controlador`: 1 VU, línea de tiempo fija contra `stub-kyc` (comentada al inicio del archivo):
  `t=0s` fuerza `healthy`, `t=15s` cambia a `pending-forever`, `t=45s` vuelve a `healthy`.

```bash
k6 run falla-inyectada.js
```

Qué esperar en el resumen: `http_req_duration{endpoint:sin-kyc}` con un p95 similar al de
`baseline.js` (ese endpoint no se ve afectado porque no depende de KYC), mientras que
`http_req_duration{endpoint:con-kyc}` sube durante la ventana de falla (los primeros fallos pagan el
timeout+retry del ACL Worker, ~3.1 s cada uno, antes de que el circuito abra y empiece a responder
rápido en modo degradado) y debería volver a bajar tras `t=45s` una vez el circuito cierra. El
análisis completo contra los criterios de éxito/fracaso del experimento se documenta en el README de
diseño (`../../DISENO-EXPERIMENTOS.md`), no aquí.

## Variables de entorno (ambos scripts)

| Variable | Default | Descripción |
|---|---|---|
| `UNDER_URL` | `http://localhost:6000` | Base URL de `consumidor-under`. |
| `STUB_URL` | `http://localhost:4000` | Base URL de `stub-kyc` (solo usado por `falla-inyectada.js`). |
| `VUS` | `8` | VUs constantes del scenario `carga`. |
| `DURATION` | `30s` (baseline) / `60s` (falla-inyectada) | Duración total del scenario `carga`. |
