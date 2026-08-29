# 1.3 Diseño del experimento de arquitectura (28 pts)

**Estado: pendiente.** Un experimento de arquitectura valida —con evidencia medible, no solo con argumentación— que una decisión de diseño cumple el atributo de calidad que promete.

## Qué exige el curso para esta sección

> Guía tomada de `utils/subtitle (33).txt` (módulo específico sobre diseño del experimento) y de la discusión en vivo en `utils/MISW4501-202614-S4C1-es-ES.vtt` (min. ~2:00–16:00).

### Qué SÍ es un experimento válido

El experimento valida una **hipótesis de diseño**: una decisión de arquitectura sobre la que el equipo tiene incertidumbre real de si permitirá cumplir un requisito de calidad. Esa decisión crítica se llama el **punto de sensibilidad**.

> *"Si el punto de sensibilidad no genera incertidumbre en el equipo de arquitectura, no deberíamos experimentarlo."*

Ejemplo discutido en clase (válido): un equipo dudaba entre GCP y AWS, y entre distintas regiones/zonas de cada proveedor, para minimizar la latencia de un flujo crítico. Como **no sabían de antemano** cuál combinación era mejor, y no existía un benchmark público concluyente para su caso, el profesor lo validó como experimento legítimo: construir el mismo microservicio, desplegarlo en distintas regiones de cada proveedor, y medir la latencia real bajo distintos horarios/condiciones.

### Qué NO es un experimento válido

El profesor fue explícito con ejemplos de lo que **rechaza**:

- Probar si una tecnología ya probada mundialmente hace lo que se supone que hace (ej. *"¿Kong sirve como API Gateway?"*, *"¿MongoDB guarda documentos?"*, *"¿AWS me deja provisionar una máquina virtual?"*). Cita textual: *"eso no es una táctica de arquitectura, es... no es una decisión de diseño"*.
- Instalar una herramienta nueva "a ver si funciona" sin que esté ligada a una decisión de arquitectura incierta. Aprender una tecnología nueva que el experimento requiere sí es válido como *actividad dentro* del experimento, pero no puede ser la razón de ser del experimento.
- Validar si una funcionalidad del producto funciona o no — eso es prueba funcional, no experimento de arquitectura.

**Regla práctica**: si la respuesta a "¿esto ya lo probó toda la industria?" es sí, no es un experimento. Si la respuesta a "¿sabríamos, sin experimentar, cuál decisión es la correcta?" es no, ahí sí hay justificación.

### Estructura esperada del experimento (según `subtitle (33).txt`)

1. **Propósito del experimento** y resultado esperado.
2. **Estimación de recursos/esfuerzo** requeridos.
3. **Elementos de arquitectura** que se van a implementar en el experimento.
4. **Punto de sensibilidad**: la decisión crítica de arquitectura a experimentar, y el ASR/requisito de calidad que debe cumplir.
5. **Patrones y tácticas de arquitectura** que se desean validar explícitamente.
6. **Microservicios involucrados**: cuáles, su propósito y el comportamiento esperado de cada uno.
7. **Conectores involucrados**: cuáles, comportamiento esperado, y tecnología asociada.
8. **Ficha de tecnología completa**: bases de datos, librerías, herramientas de prueba/ejecución/análisis de resultados.
9. **Distribución de actividades** por integrante del equipo, de forma equitativa.

### Cuántos experimentos hacer

No hay un número fijo en el rubric — es decisión del equipo, pero con restricciones reales de tiempo:

- El diseño se define en semanas 4–5; la **construcción y ejecución** de los experimentos ocurre en semanas 6–7, que se comparten con todo el trabajo de UX (mockups/wireframes).
- El profesor advierte contra los dos extremos: proponer 1 solo experimento (insuficiente para una arquitectura con varios puntos de incertidumbre) o proponer 8 (imposible de construir en 2 semanas compartidas con UX). Referencia de otros equipos en la sesión: entre 2 y 4 experimentos fue lo típico.
- Se debe mostrar **criterio de estimación** de cuántos son viables, no solo una cifra.

## Checklist sugerido

- [ ] Identificar el/los **punto(s) de sensibilidad**: decisiones de arquitectura de [`02-diseno-detallado-arquitectura/`](../02-diseno-detallado-arquitectura/) con incertidumbre real (no ya resueltas por la industria).
- [ ] Para cada punto de sensibilidad, redactar el escenario de calidad asociado (estímulo/entorno/respuesta/medida de respuesta).
- [ ] Redactar la hipótesis de diseño verificable.
- [ ] Completar la estructura de 9 puntos listada arriba para cada experimento.
- [ ] Definir criterios de éxito/fracaso **antes** de ejecutar.
- [ ] Ejecutar y registrar resultados, análisis y conclusión (validado / refutado / requiere ajuste).
- [ ] Documentar amenazas a la validez (qué no se pudo simular fielmente respecto a producción).
- [ ] Verificar que el número de experimentos elegidos sea ejecutable por el equipo en 2 semanas compartidas con el trabajo de UX.

## Relación con el resto de la hoja de trabajo

El experimento debe probar una de las tácticas documentadas en [`02-diseno-detallado-arquitectura/`](../02-diseno-detallado-arquitectura/), no un aspecto arbitrario del sistema ni una tecnología ya probada.
