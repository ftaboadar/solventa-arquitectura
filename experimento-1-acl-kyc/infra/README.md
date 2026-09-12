# infra/ — Despliegue del Experimento 1 en Cloud Run

Terraform que despliega las 3 piezas del Experimento 1 (`stub-kyc`, `acl-worker`, `consumidor-under`) en **Cloud Run**, región `us-central1` — la misma decisión de región/zona ya tomada para Solventa (ver `DISENO-EXPERIMENTOS.md`, "Candidatos considerados y descartados": no hay incertidumbre documentada sobre esa elección, así que aquí no se experimenta con ella, solo se reutiliza).

**Por qué esto y no solo Docker Compose local:** correr las pruebas de carga (k6) contra el stack en Cloud Run real es más fiel al entorno de producción de Solventa que un `docker-compose` local — valida el mismo modelo de despliegue (contenedores serverless, cold starts, red entre servicios gestionados) que menciona la ficha de tecnología del experimento. No reemplaza la verificación local ya hecha (documentada en cada README de pieza) — la complementa.

**No cambia el diseño ni el código.** El puerto interno de cada servicio se fija a `8080` (convención de Cloud Run) vía variables de entorno (`PORT`, `ACL_WORKER_PORT`, `UNDER_PORT`) — el código fuente no se toca.

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

## Nota de seguridad (deliberada para este experimento)

Los 3 servicios se despliegan con `allow_unauthenticated = true` (invocables por `allUsers`) para que k6 y curl les peguen directo sin manejar tokens de identidad de GCP. Es aceptable aquí porque no hay datos reales ni credenciales reales (el stub usa una API key dummy) — **nunca uses este patrón para un despliegue de producción real**. Para exigir autenticación, pon `allow_unauthenticated = false` en `terraform.tfvars` y autentica las llamadas con `gcloud auth print-identity-token`.
