# Frontend web

Esta carpeta contiene la nueva interfaz web del generador de montunos. Está construida con [Vite](https://vitejs.dev/) y TypeScript, incluye reproducción con Tone.js, exportación `.mid` mediante `@tonejs/midi` y persiste las preferencias del usuario en `localStorage`.

## Scripts disponibles

```bash
npm install       # instala dependencias
npm run dev       # inicia el servidor de desarrollo en http://localhost:5173
npm run build     # genera la versión de producción
npm run build:pages  # genera la versión de producción en ../docs para GitHub Pages
npm run preview   # previsualiza la build de producción en http://localhost:4173
npm run test      # ejecuta las pruebas unitarias con Vitest
```

## Despliegue en GitHub Pages

El archivo `vite.config.ts` está configurado para exportar los artefactos dentro de la carpeta `docs/`. GitHub Pages puede apuntar directamente a esa carpeta para servir la aplicación.

Además, el workflow de GitHub Actions (`.github/workflows/pages.yml`) automatiza la construcción y publicación en GitHub Pages cuando se realizan cambios en la rama principal.

## Características principales

- Formulario completo para definir progresiones, variaciones, tempo y overrides por acorde.
- Reproducción en el navegador con Tone.js y secuenciador optimizado por Web Audio.
- Generación y descarga de archivos `.mid` usando `@tonejs/midi`.
- Persistencia automática de preferencias y última progresión mediante `localStorage`.
- Pruebas unitarias para el parser de acordes y el generador de patrones.
