# Plan de migración a aplicación web

Este documento describe las tareas necesarias para convertir el generador de montunos en una aplicación web que pueda ejecutarse directamente desde GitHub Pages (sin dependencias locales). Las tareas están organizadas por fases para facilitar una implementación progresiva.

## Fase 1 · Preparación y análisis
- [ ] Auditar dependencias actuales (`tkinter`, `customtkinter`, `pygame`, `mido`, `pretty_midi`, etc.) e identificar equivalentes o alternativas que funcionen en el navegador.
- [ ] Determinar si la lógica central puede ejecutarse con WebAssembly (Pyodide) o si conviene reescribir partes en JavaScript.
- [ ] Extraer la lógica de generación de montunos a módulos independientes sin dependencias de GUI para reutilizarla desde un front-end web.
- [ ] Documentar los puntos de interacción entre la interfaz actual y la lógica para establecer una API clara.

## Fase 2 · Reorganización del proyecto
- [ ] Reestructurar el repositorio para separar `frontend/` (estáticos web) y `backend/` (lógica/motores). Asegurarse de que la lógica se exporte como un paquete reutilizable (por ejemplo, `montuno_core`).
- [ ] Crear un sistema de construcción (p. ej. Vite, Astro o Next.js) que pueda desplegarse en GitHub Pages sin servidor.
- [ ] Configurar automatización para empaquetar los recursos estáticos (scripts, estilos, assets) dentro de `docs/` o la carpeta esperada por GitHub Pages.

## Fase 3 · Interfaz web
- [ ] Diseñar una UI web equivalente usando frameworks ligeros (Svelte, React, Vue o Vanilla JS con Web Components) manteniendo todas las funcionalidades existentes.
- [ ] Implementar componentes para entrada de acordes, selección de armonizaciones, modos, variaciones y controles de reproducción/edición de MIDI.
- [ ] Asegurarse de que el rendimiento sea ágil optimizando renders y utilizando Web Workers cuando sea necesario.

## Fase 4 · Motor de audio/MIDI en el navegador
- [ ] Reemplazar el uso de `pygame.midi` y `mido` por Web MIDI API o bibliotecas JavaScript equivalentes (p. ej. `webmidi`, `tone.js`).
- [ ] Implementar generación y reproducción de secuencias MIDI usando APIs web, exportando archivos `.mid` cuando el usuario lo solicite.
- [ ] Validar compatibilidad con navegadores modernos y definir degradaciones aceptables.

## Fase 5 · Persistencia y almacenamiento
- [ ] Migrar `save_preferences`/`load_preferences` a almacenamiento web (`localStorage`, `IndexedDB`).
- [ ] Implementar guardados/recuperación de progresiones desde el navegador.

## Fase 6 · Pruebas y optimización
- [ ] Crear suite de pruebas unitarias para la lógica en el nuevo paquete `montuno_core`.
- [ ] Configurar pruebas E2E en el frontend (Playwright/Cypress) para validar flujos críticos.
- [ ] Optimizar el tamaño del bundle y habilitar carga diferida de módulos pesados.
- [ ] Configurar CI/CD para construir y publicar automáticamente en GitHub Pages.

## Fase 7 · Migración progresiva
- [ ] Implementar despliegue paralelo (escritorio y web) hasta que la versión web alcance paridad total de funciones.
- [ ] Documentar pasos de migración y uso de la nueva versión web en `README.md`.
- [ ] Planificar la desactivación gradual de la versión de escritorio cuando la versión web esté madura.

## Consideraciones adicionales
- Evaluar licencias y compatibilidad de las nuevas dependencias web.
- Mantener la lógica musical intacta, verificando que los resultados generados coincidan con la versión de escritorio.
- Incluir pruebas de regresión musical (comparación de salidas MIDI) para garantizar consistencia.

