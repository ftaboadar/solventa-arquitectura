variable "project_id" {
  description = "Proyecto de GCP donde se despliega el experimento."
  type        = string
}

variable "region" {
  description = "Región de despliegue. us-central1 replica la decisión ya tomada en el diseño de Solventa (sin incertidumbre documentada que amerite experimentar sobre región/zona)."
  type        = string
  default     = "us-central1"
}

variable "repository_id" {
  description = "Nombre del repositorio de Artifact Registry que guarda las 3 imágenes del experimento."
  type        = string
  default     = "solventa-experimento-1"
}

variable "image_tag" {
  description = "Tag de las imágenes a desplegar (debe existir ya en Artifact Registry — ver scripts/build-and-push.sh)."
  type        = string
  default     = "latest"
}

variable "allow_unauthenticated" {
  description = "Si true, expone los 3 servicios sin autenticación (allUsers). Aceptable para este experimento de curso (sin datos reales, credenciales dummy de Truora); NUNCA usar así en producción."
  type        = bool
  default     = true
}

variable "kyc_timeout_ms" {
  description = "Umbral T del ASR (ver DISENO-EXPERIMENTOS.md) — valor de referencia, aún no calibrado contra un SLA real."
  type        = number
  default     = 1500
}

variable "breaker_reset_timeout_ms" {
  description = "Tiempo que el circuito permanece abierto antes de pasar a half-open."
  type        = number
  default     = 5000
}

variable "breaker_rolling_count_timeout_ms" {
  description = "Ventana móvil de acumulación de fallos del Circuit Breaker — ver el hallazgo documentado en acl-worker/README.md sobre por qué el default de Opossum (10s) no sirve aquí."
  type        = number
  default     = 30000
}
