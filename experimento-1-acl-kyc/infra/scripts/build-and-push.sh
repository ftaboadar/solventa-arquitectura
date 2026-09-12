#!/usr/bin/env bash
# Construye y publica en Artifact Registry las 3 imágenes del Experimento 1.
# Requiere: docker con soporte buildx, gcloud autenticado con permisos sobre el proyecto.
#
# Uso:
#   ./build-and-push.sh <project_id> <region> <repository_id> [image_tag]
#
# Ejemplo (valores por defecto de variables.tf):
#   ./build-and-push.sh hda-projectt us-central1 solventa-experimento-1 latest

set -euo pipefail

PROJECT_ID="${1:?Falta project_id. Uso: build-and-push.sh <project_id> <region> <repository_id> [image_tag]}"
REGION="${2:?Falta region}"
REPOSITORY_ID="${3:?Falta repository_id}"
IMAGE_TAG="${4:-latest}"

REGISTRY_HOST="${REGION}-docker.pkg.dev"
IMAGE_BASE="${REGISTRY_HOST}/${PROJECT_ID}/${REPOSITORY_ID}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPERIMENTO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Autenticando Docker contra ${REGISTRY_HOST}"
gcloud auth configure-docker "${REGISTRY_HOST}" --quiet

# Cloud Run corre sobre linux/amd64 — se construye explícitamente para esa plataforma
# aunque la máquina local sea arm64 (Apple Silicon).
build_and_push() {
  local service_name="$1"
  local service_dir="${EXPERIMENTO_DIR}/${service_name}"
  local image="${IMAGE_BASE}/${service_name}:${IMAGE_TAG}"

  echo "==> Construyendo ${service_name} (${image})"
  docker buildx build \
    --platform linux/amd64 \
    -t "${image}" \
    "${service_dir}" \
    --push
}

build_and_push "stub-kyc"
build_and_push "acl-worker"
build_and_push "consumidor-under"

echo "==> Listo. Imágenes publicadas en ${IMAGE_BASE}"
