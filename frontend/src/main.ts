import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <main class="layout">
      <header class="layout__header">
        <h1>Generador de Montunos</h1>
        <p>Versión web en construcción. Pronto podrás generar montunos sin instalar nada.</p>
      </header>
      <section class="layout__content">
        <ol>
          <li>Define la progresión de acordes y el modo deseado.</li>
          <li>Configura las variaciones e inversiones.</li>
          <li>Escucha y exporta el resultado en formato MIDI directamente desde el navegador.</li>
        </ol>
        <p class="layout__note">
          Esta vista preliminar sirve como base para los componentes web que replicarán la interfaz de escritorio.
        </p>
      </section>
      <footer class="layout__footer">
        <p>
          Revisa la carpeta <code>frontend/</code> para contribuir al desarrollo y ejecuta
          <code>npm install</code> seguido de <code>npm run dev</code> para iniciar el entorno local.
        </p>
      </footer>
    </main>
  `;
}
