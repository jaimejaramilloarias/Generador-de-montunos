# Frontend web

Esta carpeta contiene la base del nuevo frontend web para el generador de montunos. Está construido con [Vite](https://vitejs.dev/) y TypeScript, listo para desplegarse en GitHub Pages.

## Scripts disponibles

```bash
npm install       # instala dependencias
npm run dev       # inicia el servidor de desarrollo en http://localhost:5173
npm run build     # genera la versión de producción
npm run build:pages  # genera la versión de producción en ../docs para GitHub Pages
npm run preview   # previsualiza la build de producción en http://localhost:4173
```

## Despliegue en GitHub Pages

El archivo `vite.config.ts` está configurado para exportar los artefactos dentro de la carpeta `docs/`. GitHub Pages puede apuntar directamente a esa carpeta para servir la aplicación.

Además, el workflow de GitHub Actions (`.github/workflows/pages.yml`) automatiza la construcción y publicación en GitHub Pages cuando se realizan cambios en la rama principal.
