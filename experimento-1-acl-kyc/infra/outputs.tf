output "stub_kyc_url" {
  description = "URL pública del stub de KYC (para usar su endpoint /control/mode en las pruebas)."
  value       = google_cloud_run_v2_service.stub_kyc.uri
}

output "acl_worker_url" {
  description = "URL pública del ACL Worker (endpoint /verificaciones/kyc y /circuit-status)."
  value       = google_cloud_run_v2_service.acl_worker.uri
}

output "consumidor_under_url" {
  description = "URL pública del consumidor de UNDER — objetivo de los guiones de k6 (/suscripcion/con-kyc, /suscripcion/sin-kyc)."
  value       = google_cloud_run_v2_service.consumidor_under.uri
}

output "artifact_registry_repository" {
  description = "Ruta del repositorio de Artifact Registry — usar en scripts/build-and-push.sh."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.experimento1.repository_id}"
}
