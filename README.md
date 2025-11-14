# Generador de Montunos

Este repositorio contiene las dos variantes del generador de montunos:

- **Aplicación de escritorio** construida con Tk/CustomTk.
- **Aplicación web** basada en Vite + TypeScript que puede desplegarse en GitHub Pages sin dependencias adicionales.

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
5. Genera el montuno para escucharlo en el navegador (Tone.js) o descargarlo como `.mid`.

Las preferencias (última progresión, clave, tempo, etc.) se guardan automáticamente en `localStorage`, por lo que al recargar se restaura el estado anterior.

## Despliegue en GitHub Pages

Ejecuta `npm run build:pages` dentro de `frontend/` para compilar la aplicación en `docs/`. El workflow `.github/workflows/pages.yml` automatiza la publicación cuando los cambios se fusionan en la rama principal.

## Pruebas

La lógica de parsing y la generación musical cuentan con pruebas unitarias en `frontend/src/utils` y `frontend/src/music`. Puedes ejecutarlas con:

```bash
cd frontend
npm run test
```
