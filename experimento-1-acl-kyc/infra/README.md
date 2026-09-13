# infra/ — Despliegue del Experimento 1 en Cloud Run

Terraform que despliega las 3 piezas del Experimento 1 (`stub-kyc`, `acl-worker`, `consumidor-under`) en **Cloud Run**, región `us-central1` — la misma decisión de región/zona ya tomada para Solventa (ver `DISENO-EXPERIMENTOS.md`, "Candidatos considerados y descartados": no hay incertidumbre documentada sobre esa elección, así que aquí no se experimenta con ella, solo se reutiliza).

**Por qué esto y no solo Docker Compose local:** correr las pruebas de carga (k6) contra el stack en Cloud Run real es más fiel al entorno de producción de Solventa que un `docker-compose` local — valida el mismo modelo de despliegue (contenedores serverless, cold starts, red entre servicios gestionados) que menciona la ficha de tecnología del experimento. No reemplaza la verificación local ya hecha (documentada en cada README de pieza) — la complementa.

**No cambia el diseño ni el código.** El puerto interno de cada servicio se fija a `8080` (convención de Cloud Run). Para `acl-worker` y `consumidor-under` se fija vía sus propias env vars (`ACL_WORKER_PORT`, `UNDER_PORT`); `stub-kyc` no necesita ninguna porque ya lee `process.env.PORT`, y `PORT` es un nombre reservado que Cloud Run inyecta solo — fijarlo manualmente hace fallar el despliegue (`400: reserved env names were provided: PORT`).

**Memoria mínima 512Mi.** Con CPU siempre asignada (el default de este Terraform), Cloud Run rechaza límites de memoria por debajo de 512Mi (`Total memory < 512 Mi is not supported with cpu always allocated`).

## Prerrequisitos

- `gcloud` CLI autenticado (`gcloud auth login`) con permisos sobre el proyecto de destino.
- Un proyecto de GCP con **facturación habilitada** (verificado ya para `hda-projectt`: `gcloud billing projects describe hda-projectt`).
- Docker con soporte `buildx` (para construir imágenes `linux/amd64` desde Apple Silicon).
- Terraform >= 1.5.

## Costo

Cloud Run tiene una capa gratuita generosa (2M requests/mes, `min_instance_count = 0` en los 3 servicios así que no cobra nada mientras no reciben tráfico). Artifact Registry cobra centavos por GB de almacenamiento de imágenes. Para las corridas de este experimento (minutos de carga con k6, no producción 24/7) el costo esperado es marginal, pero **sigue siendo dinero real de una cuenta de facturación real** — revisa la consola de facturación después de las pruebas si te preocupa.

## Secuencia de despliegue (orden importa)

Cloud Run necesita que la imagen exista en Artifact Registry *antes* de poder desplegarla, pero Terraform es quien crea el repositorio de Artifact Registry. Por eso el despliegue es en 2 fases:

```bash
cd experimento-1-acl-kyc/infra
cp terraform.tfvars.example terraform.tfvars   # ajusta project_id si no es hda-projectt
terraform init

# Fase 1: solo crear el repositorio de Artifact Registry (las imágenes aún no existen)
terraform apply -target=google_artifact_registry_repository.experimento1

# Fase 2: construir y publicar las 3 imágenes ahora que el repositorio existe
# (mismos valores que pusiste en terraform.tfvars — project_id, region, repository_id)
./scripts/build-and-push.sh hda-projectt us-central1 solventa-experimento-1 latest

# Fase 3: desplegar los 3 servicios de Cloud Run (ya con imágenes disponibles)
terraform apply
```

Al terminar, `terraform output` da las 3 URLs públicas (`stub_kyc_url`, `acl_worker_url`, `consumidor_under_url`) — son las que reemplazan a `http://localhost:4000/5000/6000` en las pruebas manuales y en los guiones de k6 (pasa la URL de `consumidor_under_url` como `UNDER_URL` de `k6/falla-inyectada.js` y la de `stub_kyc_url` como `STUB_URL`, en vez de los defaults de `localhost`).

## Redeploy tras cambios de código

Cada cambio en `stub-kyc/`, `acl-worker/` o `consumidor-under/` requiere repetir `build-and-push.sh` (nueva imagen con el mismo tag `latest`) y luego `terraform apply` (Cloud Run no re-lee la imagen sola si el tag no cambió a nivel de digest — Terraform sí detecta el cambio de digest subyacente y fuerza una nueva revisión).

## Limpieza (destruir todo)

```bash
terraform destroy
```

Esto borra los 3 servicios de Cloud Run y el repositorio de Artifact Registry (con las imágenes dentro). **No lo ejecutes sin confirmar que ya no necesitas el entorno** — es una acción destructiva sobre infraestructura real, no solo archivos locales.

## Despliegue real ya verificado (2026-09-12)

Las 3 fases se ejecutaron contra `hda-projectt` y los 3 servicios respondieron con el mismo comportamiento ya validado en local (ver `DISENO-EXPERIMENTOS.md`):

- KYC sano: `aprobado` en 581-981ms (incluye red pública + *cold start*, mayor que en local), circuito `closed`.
- KYC caído (`pending-forever`): 2 llamadas agotan ~3.1s, el circuito abre, las siguientes responden fail-fast (`duracionMs` interno de 14-15ms).
- Recuperación: el circuito cierra solo tras el `resetTimeout` configurado, sin intervención manual.

Los 3 criterios de éxito del experimento se cumplen igual en Cloud Run que en local.

## Nota de seguridad (deliberada para este experimento)

Los 3 servicios se despliegan con `allow_unauthenticated = true` (invocables por `allUsers`) para que k6 y curl les peguen directo sin manejar tokens de identidad de GCP. Es aceptable aquí porque no hay datos reales ni credenciales reales (el stub usa una API key dummy) — **nunca uses este patrón para un despliegue de producción real**. Para exigir autenticación, pon `allow_unauthenticated = false` en `terraform.tfvars` y autentica las llamadas con `gcloud auth print-identity-token`.
