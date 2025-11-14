# Plan de retirada gradual de la aplicación de escritorio

La versión web ya cubre la mayor parte de los flujos del generador de montunos. Este documento define los hitos para desactivar delicadamente la aplicación de escritorio sin afectar a los usuarios actuales.

## Hitos

1. **Paridad funcional**
   - Completar la cobertura de pruebas end-to-end para los casos críticos (generación, reproducción y exportación).
   - Documentar cualquier diferencia funcional entre ambas versiones y calendarizar su resolución.
2. **Comunicación a usuarios**
   - Publicar un aviso dentro del README y en las notas de lanzamiento anunciando la transición con al menos dos versiones de antelación.
   - Proveer enlaces directos a la versión web y al ZIP más reciente de la app de escritorio.
3. **Periodo de soporte dual**
   - Mantener ambos despliegues durante al menos dos ciclos de lanzamiento completos.
   - Recabar métricas de uso (descargas del ZIP, visitas a GitHub Pages) para confirmar la adopción de la versión web.
4. **Retirada**
   - Marcar el repositorio de la app de escritorio como "legacy" y dejar de publicar nuevos paquetes.
   - Conservar la última versión empaquetada en la sección de releases para referencia histórica.

## Requisitos previos

- Suite de regresión musical que compare archivos `.mid` generados en ambas plataformas.
- Automatización de CI/CD verificada (ver `planning/parallel-deployment.md`).

## Indicadores de éxito

- Reducción sostenida en las descargas de la app de escritorio.
- Usuarios generando montunos únicamente desde la interfaz web.
- Tiempo de soporte dedicado a la versión de escritorio < 10% del total después de dos ciclos de lanzamiento.
