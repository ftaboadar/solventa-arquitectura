# Despliegue en Cloud Run del Experimento 1 (Circuit Breaker/Retry en ACL Worker de KYC).
# Reproduce el modelo de despliegue real de Solventa (Cloud Run, us-central1 — ver DISENO-EXPERIMENTOS.md
# y la ficha de tecnología del experimento) para correr las pruebas de carga en un entorno más fiel
# que Docker Compose local. No cambia el diseño ni el código de las 3 piezas, solo dónde corren.

locals {
  registry_host = "${var.region}-docker.pkg.dev"
  image_base    = "${local.registry_host}/${var.project_id}/${google_artifact_registry_repository.experimento1.repository_id}"
}

# --- APIs requeridas ---

resource "google_project_service" "run" {
  project            = var.project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  project            = var.project_id
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

# --- Artifact Registry: repositorio Docker para las 3 imágenes ---

resource "google_artifact_registry_repository" "experimento1" {
  depends_on    = [google_project_service.artifact_registry]
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  format        = "DOCKER"
  description   = "Imágenes del Experimento 1 (stub-kyc, acl-worker, consumidor-under) — Solventa MISW4501."
}

# --- stub-kyc ---

resource "google_cloud_run_v2_service" "stub_kyc" {
  depends_on = [google_project_service.run]
  project    = var.project_id
  name       = "stub-kyc"
  location   = var.region
  ingress    = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${local.image_base}/stub-kyc:${var.image_tag}"
      ports {
        container_port = 8080
      }
      # PORT es una env var reservada que Cloud Run inyecta solo (= container_port).
      # stub-kyc ya lee process.env.PORT, así que no hace falta fijarla aquí.
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "stub_kyc_public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.stub_kyc.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- acl-worker (depende de stub-kyc: necesita su URL para KYC_BASE_URL) ---

resource "google_cloud_run_v2_service" "acl_worker" {
  depends_on = [google_project_service.run, google_cloud_run_v2_service.stub_kyc]
  project    = var.project_id
  name       = "acl-worker"
  location   = var.region
  ingress    = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${local.image_base}/acl-worker:${var.image_tag}"
      ports {
        container_port = 8080
      }
      env {
        name  = "ACL_WORKER_PORT"
        value = "8080"
      }
      env {
        name  = "KYC_PROVIDER"
        value = "stub"
      }
      env {
        name  = "KYC_BASE_URL"
        value = google_cloud_run_v2_service.stub_kyc.uri
      }
      env {
        name  = "TRUORA_API_KEY"
        value = "dummy-truora-api-key"
      }
      env {
        name  = "KYC_TIMEOUT_MS"
        value = tostring(var.kyc_timeout_ms)
      }
      env {
        name  = "BREAKER_RESET_TIMEOUT_MS"
        value = tostring(var.breaker_reset_timeout_ms)
      }
      env {
        name  = "BREAKER_ROLLING_COUNT_TIMEOUT_MS"
        value = tostring(var.breaker_rolling_count_timeout_ms)
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "acl_worker_public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.acl_worker.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- consumidor-under (depende de acl-worker: necesita su URL) ---

resource "google_cloud_run_v2_service" "consumidor_under" {
  depends_on = [google_project_service.run, google_cloud_run_v2_service.acl_worker]
  project    = var.project_id
  name       = "consumidor-under"
  location   = var.region
  ingress    = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${local.image_base}/consumidor-under:${var.image_tag}"
      ports {
        container_port = 8080
      }
      env {
        name  = "UNDER_PORT"
        value = "8080"
      }
      env {
        name  = "ACL_WORKER_URL"
        value = google_cloud_run_v2_service.acl_worker.uri
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "consumidor_under_public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.consumidor_under.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
