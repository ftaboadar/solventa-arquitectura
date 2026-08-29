# Correcciones aplicadas al catálogo de Escenarios de Calidad (EdeC)

Registro de cambios hechos en respuesta a la retroalimentación del tutor sobre la sección **"Se incluyen al menos dos escenarios de calidad por cada requisito definido"** (26/30 pts).

- **Fuente del catálogo original**: `utils/Jira.csv` — 35 issues de tipo "Escenario de calidad" (EC001–EC035), derivados de los 6 atributos de calidad del enunciado oficial (`utils/MISW4501-202614-Proyecto (2).pdf`, sección 6).
- **Dónde se corrigió**: directamente en Jira (los EC son issues del proyecto KAN), no en este repositorio — este documento es el registro de qué se cambió y por qué.
- **Estado**: ✅ las 5 correcciones fueron aplicadas manualmente por el equipo.

## Comentarios del tutor y su origen

| Comentario del tutor | EdeC afectado(s) |
|---|---|
| "EC009 parece más un requisito funcional que un EdeC" | EC009 |
| "'Latencia total del journey no excede el presupuesto' no es necesariamente medible" | EC010 |
| "Las medidas de escalabilidad están incompletas" | EC013, EC014, EC015, EC018 |

## Correcciones

### 1. EC009 — Latencia: llamada a un tercero (KYC, datos, pago) en ambiente degradado

| | Antes | Después |
|---|---|---|
| Respuesta | El sistema aborta la llamada externa *(mecanismo de implementación)* | El sistema corta la dependencia lenta y continúa el journey sin bloquear al usuario, degradando a un valor de respaldo |
| Medida de la respuesta | Timeout duro a 700 ms *(es el disparador, no el resultado medido)* | 100% de las llamadas que superan 700 ms se cortan; 0 solicitudes de usuario quedan bloqueadas |

**Por qué corrige el comentario**: la respuesta ahora describe un efecto de calidad observable (continuidad del journey), no una especificación técnica de implementación (el timeout de 700 ms sigue existiendo, pero como mecanismo/estímulo en EC008, no como la "respuesta" de EC009).

### 2. EC010 — Latencia: journey de cotización con proveedor de datos degradado

| | Antes | Después |
|---|---|---|
| Medida de la respuesta | "Latencia total del journey no excede el presupuesto" *(el presupuesto no está definido en esta misma fila)* | "La latencia total del journey de cotización se mantiene ≤ 500 ms en p99 (mismo presupuesto de EC001/EC002), incluso usando caché/valor por defecto" |

**Por qué corrige el comentario**: la medida ahora es autocontenida y verificable con un número — regla aplicada: todo EdeC que hable de "no exceder el presupuesto" debe citar el número exacto del EdeC de latencia del mismo journey.

### 3. EC013 / EC014 — Escalabilidad: pico de cierres de crédito a fin de mes

| | Antes | Después |
|---|---|---|
| Relación entre ambos | Prácticamente duplicados (mismo estímulo, misma medida "≥ 20.000 transacciones/hora") | Diferenciados explícitamente (o fusionados en uno), cada uno con su propio alcance claro |
| Medida de la respuesta | Sin umbral cuantificado de "no degradar el tráfico en línea" | Se agregó el umbral citando el presupuesto de latencia ya definido en EC003/EC004 (p95 ≤ 400 ms) |

### 4. EC015 — Escalabilidad: tráfico crece 100x por promoción de un socio

| | Antes | Después |
|---|---|---|
| Medida de la respuesta | "Autoescalado completado en ≤ 60 s" *(solo el tiempo de reacción)* | "Escalar de 500 a 50.000 cotizaciones/min conservando p95 ≤ 250 ms, con autoescalado completado en ≤ 60 s" |

**Por qué corrige el comentario**: una medida de escalabilidad completa necesita las 3 dimensiones — factor de crecimiento, desempeño sostenido y tiempo de reacción. La versión anterior solo tenía la tercera.

### 5. EC018 — Escalabilidad: se pasa de 5 a 50 socios de distribución

| | Antes | Después |
|---|---|---|
| Medida de la respuesta | "Cero degradación de servicio por crecimiento de socios" *(sin umbral verificable)* | "El alta de nuevos socios no incrementa la latencia p95 de las APIs del núcleo en más de 5%, ni afecta el presupuesto de latencia de los socios ya existentes" |

---

## Pendiente relacionado (no cubierto por esta corrección)

El otro bloque de retroalimentación del tutor (30/40 pts, historias de usuario y priorización) señaló por separado que **no era clara la metodología de priorización** (0/10 en ese criterio). Esa corrección es independiente de los EdeC — ver la propuesta de metodología (Value vs. Risk Score) discutida en la conversación, pendiente de formalizar como documento explícito en el backlog.
