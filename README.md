# Generador de Montunos

Este repositorio contiene las dos variantes del generador de montunos:

- **Aplicación de escritorio** construida con Tk/CustomTk.
- **Aplicación web** basada en Vite + TypeScript que puede desplegarse en GitHub Pages sin dependencias adicionales.

Puedes abrir la interfaz web directamente en GitHub Pages sin instalar nada: https://jaimejaramilloarias.github.io/Generador-de-montunos/

## Estructura del repositorio

| Carpeta        | Contenido principal |
| -------------- | ------------------- |
| `backend/`     | Núcleo musical reutilizable (`montuno_core`). |
| `desktop_app/` | Interfaz de escritorio tradicional. |
| `frontend/`    | Nueva interfaz web con reproductor y exportador MIDI. |
| `docs/`        | Salida estática para GitHub Pages. |

## Uso de la versión web

1. Instala dependencias en la carpeta `frontend/`:
   ```bash
   cd frontend
   npm install
   ```
2. Inicia el entorno de desarrollo:
   ```bash
   npm run dev
   ```
   El servidor queda disponible en `http://localhost:5173`.
3. Define la progresión de acordes, selecciona clave, variación y tempo.
4. Personaliza modo, armonización e inversión por acorde desde la tabla dinámica.
5. Opcional: usa los controles avanzados para rotar todas las inversiones o fijar una nueva semilla de variación.
6. Añade ediciones manuales (modificar/añadir/eliminar notas) antes de exportar o reproducir.
7. Genera el montuno para escucharlo en el navegador (Tone.js) o descargarlo como `.mid`.

Las preferencias (última progresión, clave, tempo, etc.) se guardan automáticamente en `localStorage`, por lo que al recargar se restaura el estado anterior.

## Despliegue en GitHub Pages

Ejecuta `npm run build:pages` dentro de `frontend/` para compilar la aplicación en `docs/`. El workflow `.github/workflows/pages.yml` automatiza la publicación cuando los cambios se fusionan en la rama principal.

## Pruebas

La lógica de parsing y la generación musical cuentan con pruebas unitarias en `frontend/src/utils` y `frontend/src/music`.

- `npm run test` ejecuta las pruebas unitarias en modo de una sola pasada (`vitest --run`).
- `npm run test:watch` deja Vitest en modo interactivo durante el desarrollo.
- `npm run test:e2e` levanta la build de producción y lanza las pruebas end-to-end con Playwright (requiere ejecutar una vez `npx playwright install --with-deps chromium`).

```bash
cd frontend
npm run test:ci
```

El comando anterior ejecuta de forma secuencial las pruebas unitarias y las end-to-end.

## Estrategia de despliegue paralelo

- La aplicación web se publica automáticamente en GitHub Pages mediante el workflow `.github/workflows/pages.yml` después de ejecutar las pruebas unitarias y E2E.
- La aplicación de escritorio se mantiene disponible en paralelo mediante paquetes comprimidos generados desde la carpeta `desktop_app/`. El proceso manual/automatizado se documenta en `planning/parallel-deployment.md` y permite publicar ambas variantes en cada lanzamiento.

Consulta también `planning/desktop-phaseout.md` para la hoja de ruta de retirada gradual de la versión de escritorio cuando la web alcance paridad funcional.
