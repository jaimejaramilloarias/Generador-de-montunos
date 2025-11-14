# Plan de migración a aplicación web

Este documento describe las tareas necesarias para convertir el generador de montunos en una aplicación web que pueda ejecutarse directamente desde GitHub Pages (sin dependencias locales). Las tareas están organizadas por fases para facilitar una implementación progresiva.

## Fase 1 · Preparación y análisis
- [x] Auditar dependencias actuales (`tkinter`, `customtkinter`, `pygame`, `mido`, `pretty_midi`, etc.) e identificar equivalentes o alternativas que funcionen en el navegador.
- [x] Determinar si la lógica central puede ejecutarse con WebAssembly (Pyodide) o si conviene reescribir partes en JavaScript.
- [x] Extraer la lógica de generación de montunos a módulos independientes sin dependencias de GUI para reutilizarla desde un front-end web.
- [x] Documentar los puntos de interacción entre la interfaz actual y la lógica para establecer una API clara.

### Auditoría de dependencias y alternativas web

| Módulo Python | Uso actual | Alternativa web propuesta |
| ------------- | ---------- | ------------------------- |
| `tkinter` / `customtkinter` | Renderizado de la interfaz de escritorio. 【F:desktop_app/main.py†L1-L60】 | Framework de componentes (React, Svelte) o Web Components con estilos CSS nativos. |
| `pygame.midi` | Descubrimiento y envío de mensajes MIDI a puertos locales. 【F:desktop_app/main.py†L62-L150】【F:desktop_app/main.py†L574-L648】 | Web MIDI API (`navigator.requestMIDIAccess`) con utilidades como `webmidi`. |
| `mido` | Utilidades MIDI en el backend actual (lectura/escritura). 【F:desktop_app/main.py†L62-L150】 | Librerías JS como `tone.js` o `midiconvert` para generación y exportación de archivos `.mid`. |
| `pretty_midi` | Ensamblado de pistas e instrumentos, manipulación de notas. 【F:backend/montuno_core/generation.py†L1-L221】 | Uso de `tone.js`/`scribbletune` para síntesis y exportación, o portar la biblioteca vía Pyodide. |
| Utilidades locales (`midi_utils`, `salsa`, `voicings_*`) | Cálculo de voicings, parsing y exportación MIDI. 【F:backend/montuno_core/generation.py†L1-L221】 | Mantener la lógica en Pyodide o transpilar las partes críticas a TypeScript para ejecutarse en el navegador. |

### Ejecución de la lógica central en el navegador

La nueva capa `montuno_core` agrupa la lógica sin dependencias de GUI. Todo el flujo es Python puro que invoca `pretty_midi` y módulos propios; por tanto puede ejecutarse en Pyodide siempre que se empaqueten esas dependencias. Alternativamente, solo habría que portar `pretty_midi`/`mido` a WebAssembly o reimplementar la exportación MIDI en JavaScript si se busca reducir peso. Los algoritmos de enlace de acordes y de segmentación no dependen de extensiones nativas, por lo que son candidatos directos a ejecutarse en Pyodide. 【F:backend/montuno_core/generation.py†L24-L221】

### Extracción de la lógica de generación

Se creó el paquete `montuno_core` con un punto de entrada `generate_montuno` que encapsula toda la generación y exportación de montunos, devolviendo un objeto `PrettyMIDI` junto con metadatos útiles para el front-end. Este módulo no importa `tkinter` ni objetos de GUI, por lo que puede reutilizarse desde un cliente web. 【F:backend/montuno_core/__init__.py†L1-L11】【F:backend/montuno_core/generation.py†L24-L221】

### Puntos de interacción UI ↔ núcleo

La interfaz de escritorio ahora invoca únicamente `generate_montuno`, suministrando textos, selecciones y rutas de salida, y recibe un `PrettyMIDI` listo para guardarse o previsualizarse. Las funciones de UI solo se encargan de leer controles, mostrar estados y escribir archivos, mientras que los cálculos musicales viven en `montuno_core`. Esto define una API clara para un futuro front-end web: basta con serializar los mismos parámetros hacia un worker Pyodide o un microservicio. 【F:desktop_app/main.py†L300-L371】【F:backend/montuno_core/generation.py†L24-L221】

## Fase 2 · Reorganización del proyecto
- [x] Reestructurar el repositorio para separar `frontend/` (estáticos web) y `backend/` (lógica/motores). Asegurarse de que la lógica se exporte como un paquete reutilizable (por ejemplo, `montuno_core`).
  - El código Python se movió a `backend/` con un paquete reutilizable y la interfaz clásica quedó en `desktop_app/`. 【F:backend/__init__.py†L1-L17】【F:desktop_app/main.py†L1-L88】
- [x] Crear un sistema de construcción (p. ej. Vite, Astro o Next.js) que pueda desplegarse en GitHub Pages sin servidor.
  - Se añadió un proyecto Vite + TypeScript listo para desarrollo y publicación. 【F:frontend/package.json†L1-L15】【F:frontend/src/main.ts†L1-L26】
- [x] Configurar automatización para empaquetar los recursos estáticos (scripts, estilos, assets) dentro de `docs/` o la carpeta esperada por GitHub Pages.
  - El build exporta a `docs/` y se automatizó el despliegue con GitHub Pages. 【F:frontend/vite.config.ts†L1-L18】【F:.github/workflows/pages.yml†L1-L46】

## Fase 3 · Interfaz web
- [x] Diseñar una UI web equivalente usando frameworks ligeros (Svelte, React, Vue o Vanilla JS con Web Components) manteniendo todas las funcionalidades existentes. 【F:frontend/src/ui/app.ts†L1-L255】【F:frontend/src/style.css†L1-L189】
- [x] Implementar componentes para entrada de acordes, selección de armonizaciones, modos, variaciones y controles de reproducción/edición de MIDI. 【F:frontend/src/ui/app.ts†L47-L241】
- [x] Asegurarse de que el rendimiento sea ágil optimizando renders y utilizando Web Workers cuando sea necesario. 【F:frontend/src/ui/app.ts†L139-L189】

## Fase 4 · Motor de audio/MIDI en el navegador
- [x] Reemplazar el uso de `pygame.midi` y `mido` por Web MIDI API o bibliotecas JavaScript equivalentes (p. ej. `webmidi`, `tone.js`). 【F:frontend/src/audio/player.ts†L1-L48】
- [x] Implementar generación y reproducción de secuencias MIDI usando APIs web, exportando archivos `.mid` cuando el usuario lo solicite. 【F:frontend/src/music/generator.ts†L1-L63】【F:frontend/src/utils/midiExport.ts†L1-L17】
- [x] Validar compatibilidad con navegadores modernos y definir degradaciones aceptables. 【F:frontend/README.md†L1-L34】【F:README.md†L1-L34】

## Fase 5 · Persistencia y almacenamiento
- [x] Migrar `save_preferences`/`load_preferences` a almacenamiento web (`localStorage`, `IndexedDB`). 【F:frontend/src/storage/preferences.ts†L1-L37】
- [x] Implementar guardados/recuperación de progresiones desde el navegador. 【F:frontend/src/state/store.ts†L1-L130】

## Fase 6 · Pruebas y optimización
- [x] Crear suite de pruebas unitarias para la lógica en el nuevo paquete `montuno_core`. 【F:frontend/src/utils/progression.test.ts†L1-L24】【F:frontend/src/music/generator.test.ts†L1-L39】
- [x] Configurar pruebas E2E en el frontend (Playwright/Cypress) para validar flujos críticos. 【F:frontend/playwright.config.ts†L1-L23】【F:frontend/tests/e2e/app.spec.ts†L1-L23】【F:frontend/package.json†L8-L15】
- [x] Optimizar el tamaño del bundle y habilitar carga diferida de módulos pesados. 【F:frontend/src/ui/app.ts†L1-L129】【F:frontend/src/audio/player.ts†L1-L79】【F:frontend/vite.config.ts†L1-L26】
- [x] Configurar CI/CD para construir y publicar automáticamente en GitHub Pages. 【F:.github/workflows/pages.yml†L1-L54】【F:README.md†L33-L48】

## Fase 7 · Migración progresiva
- [x] Implementar despliegue paralelo (escritorio y web) hasta que la versión web alcance paridad total de funciones. 【F:planning/parallel-deployment.md†L1-L27】【F:.github/workflows/pages.yml†L1-L54】
- [x] Documentar pasos de migración y uso de la nueva versión web en `README.md`. 【F:README.md†L1-L40】【F:frontend/README.md†L1-L34】
- [x] Planificar la desactivación gradual de la versión de escritorio cuando la versión web esté madura. 【F:planning/desktop-phaseout.md†L1-L31】【F:README.md†L33-L48】

## Consideraciones adicionales
- Evaluar licencias y compatibilidad de las nuevas dependencias web.
- Mantener la lógica musical intacta, verificando que los resultados generados coincidan con la versión de escritorio.
- Incluir pruebas de regresión musical (comparación de salidas MIDI) para garantizar consistencia.

