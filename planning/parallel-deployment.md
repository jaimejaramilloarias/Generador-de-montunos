# Despliegue paralelo de la aplicación de escritorio y la versión web

Este plan garantiza que ambas variantes del generador de montunos sigan disponibles mientras la versión web alcanza paridad funcional.

## Objetivos

1. Publicar automáticamente la versión web en GitHub Pages en cada commit de `main`.
2. Adjuntar artefactos listos para ejecución de la aplicación de escritorio en cada release.
3. Proveer instrucciones consistentes para probar ambas plataformas durante QA.

## Flujo recomendado

1. **CI en ramas principales**
   - Ejecutar `npm run test:ci` dentro de `frontend/` para validar unitarias y pruebas E2E.
   - Construir la carpeta `docs/` mediante `npm run build:pages` y cargarla como artefacto de GitHub Pages.
2. **Empaquetado de la aplicación de escritorio**
   - Utilizar el script `python -m zipfile -c dist/montuno-desktop.zip desktop_app` para generar un paquete reutilizable.
   - Subir el ZIP como artefacto dentro del workflow de GitHub Actions (ver `.github/workflows/pages.yml`, paso "Package desktop app").
   - Anexar el artefacto a los releases o distribuirlo manualmente mientras se automatiza su publicación.
3. **QA paralelo**
   - Validar que la misma progresión de acordes produce resultados equivalentes en la build web (`docs/`) y en la app de escritorio incluida en `dist/montuno-desktop.zip`.
   - Registrar discrepancias como issues bloqueadoras antes de retirar la versión de escritorio.

## Próximos pasos

- Automatizar la publicación del ZIP de escritorio en los releases de GitHub.
- Añadir pruebas de regresión musical que comparen archivos `.mid` generados por ambas variantes.
