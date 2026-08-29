# 1.3 Diseño del experimento de arquitectura (28 pts)

**Estado: pendiente.** Un experimento de arquitectura valida —con evidencia medible, no solo con argumentación— que una decisión de diseño cumple el atributo de calidad que promete.

## Checklist sugerido

- [ ] **Atributo de calidad a validar** y por qué es crítico para Solventa (ej. disponibilidad del flujo de cotización ante caída de un proveedor externo, latencia p95 del BFF bajo carga, resiliencia del pago paramétrico por IoT).
- [ ] **Escenario de calidad** en formato estímulo/entorno/respuesta/medida de respuesta (estilo ATAM/QAW), ligado a un componente concreto del diagrama de componentes o despliegue.
- [ ] **Hipótesis** verificable (ej. "el Circuit Breaker en el ACL Worker limita la degradación del flujo de suscripción a X ms cuando el proveedor KYC falla").
- [ ] **Método/diseño del experimento**: qué se va a construir o simular (prototipo, prueba de carga, inyección de fallas), variables controladas, variables medidas, herramientas (ej. k6/JMeter para carga, Chaos Toolkit para fallas, Cloud Monitoring para métricas).
- [ ] **Criterios de éxito/fracaso** definidos antes de ejecutar el experimento.
- [ ] **Resultados y análisis**: datos obtenidos, comparación contra el criterio, conclusión sobre si la decisión de arquitectura queda validada, refutada o requiere ajuste.
- [ ] **Amenazas a la validez** del experimento (qué no se pudo controlar o simular fielmente respecto al entorno productivo real).

## Relación con el resto de la hoja de trabajo

El experimento debe probar una de las tácticas documentadas en [`02-diseno-detallado-arquitectura/`](../02-diseno-detallado-arquitectura/), no un aspecto arbitrario del sistema.
