import {
  getState,
  deleteSavedProgression,
  loadSavedProgression,
  resetPlayback,
  saveCurrentProgression,
  setBpm,
  setChord,
  setClave,
  setDefaultArmonizacion,
  setDefaultInversion,
  setDefaultModo,
  setErrors,
  setGenerated,
  setIsPlaying,
  setProgression,
  setSeed,
  setVariation,
  subscribe,
} from '../state/store';
import { ARMONIZACIONES, CLAVES, INVERSIONES, MODOS, VARIACIONES } from '../types/constants';
import type { AppState, ChordConfig, GenerationResult } from '../types';

type GeneratorModule = typeof import('../music/generator');
type AudioModule = typeof import('../audio/player');
type MidiExportModule = typeof import('../utils/midiExport');

let generatorModulePromise: Promise<GeneratorModule> | null = null;
let audioModulePromise: Promise<AudioModule> | null = null;
let midiModulePromise: Promise<MidiExportModule> | null = null;

interface UiRefs {
  progressionInput: HTMLTextAreaElement;
  claveSelect: HTMLSelectElement;
  modoSelect: HTMLSelectElement;
  armonizacionSelect: HTMLSelectElement;
  inversionSelect: HTMLSelectElement;
  variationSelect: HTMLSelectElement;
  bpmInput: HTMLInputElement;
  seedInput: HTMLInputElement;
  generateBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  errorList: HTMLDivElement;
  chordsTable: HTMLTableSectionElement;
  summary: HTMLDivElement;
  saveNameInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  savedList: HTMLUListElement;
}

function getGeneratorModule(): Promise<GeneratorModule> {
  if (!generatorModulePromise) {
    generatorModulePromise = import('../music/generator');
  }
  return generatorModulePromise;
}

function getAudioModule(): Promise<AudioModule> {
  if (!audioModulePromise) {
    audioModulePromise = import('../audio/player');
  }
  return audioModulePromise;
}

function getMidiModule(): Promise<MidiExportModule> {
  if (!midiModulePromise) {
    midiModulePromise = import('../utils/midiExport');
  }
  return midiModulePromise;
}

function scheduleModulePrefetch(): void {
  window.setTimeout(() => {
    void getGeneratorModule();
    void getAudioModule();
    void getMidiModule();
  }, 250);
}

let lastActiveProgressionId: string | null = null;

export function setupApp(root: HTMLElement): void {
  root.innerHTML = buildLayout();
  const refs = grabRefs(root);
  bindStaticEvents(refs, root);
  subscribe((state) => updateUi(state, refs));
  scheduleModulePrefetch();
}

function buildLayout(): string {
  return `
    <main class="app">
      <header class="app__header">
        <h1>Generador de Montunos</h1>
        <p>Versión web experimental con reproducción directa en el navegador.</p>
      </header>
      <section class="app__body">
        <form class="panel" id="montuno-form">
          <fieldset class="panel__section">
            <legend>Progresión de acordes</legend>
            <textarea id="progression" rows="4" spellcheck="false" placeholder="Cmaj7 F7 | G7 Cmaj7"></textarea>
            <p class="panel__hint">Separa acordes con espacios o barras verticales. Puedes incluir tensiones como Cm7(b5).</p>
          </fieldset>
          <fieldset class="panel__section grid">
            <div>
              <label class="input-group">
                <span>Clave</span>
                <select id="clave"></select>
              </label>
            </div>
            <div>
              <label class="input-group">
                <span>Modo por defecto</span>
                <select id="modo"></select>
              </label>
            </div>
            <div>
              <label class="input-group">
                <span>Armonización por defecto</span>
                <select id="armonizacion"></select>
              </label>
            </div>
            <div>
              <label class="input-group">
                <span>Inversión por defecto</span>
                <select id="inversion"></select>
              </label>
            </div>
            <div>
              <label class="input-group">
                <span>Variación</span>
                <select id="variacion"></select>
              </label>
            </div>
            <div class="input-group">
              <label for="bpm">Tempo</label>
              <input id="bpm" type="number" min="60" max="220" step="1" />
            </div>
            <div class="input-group">
              <label for="seed">Semilla</label>
              <input id="seed" type="number" min="0" placeholder="Aleatorio" />
            </div>
          </fieldset>
          <section class="panel__section">
            <header class="panel__section-header">
              <h2>Overrides por acorde</h2>
              <p>Personaliza modo, armonización e inversión por acorde.</p>
            </header>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Acorde</th>
                    <th>Modo</th>
                    <th>Armonización</th>
                    <th>Inversión</th>
                  </tr>
                </thead>
                <tbody id="chords"></tbody>
              </table>
            </div>
          </section>
          <section class="panel__section">
            <header class="panel__section-header">
              <h2>Progresiones guardadas</h2>
              <p>Conserva tus progresiones favoritas para reutilizarlas en el futuro.</p>
            </header>
            <div class="saved-controls">
              <label class="input-group saved-controls__input">
                <span>Nombre</span>
                <input id="saved-name" type="text" placeholder="Intro en C mayor" autocomplete="off" />
              </label>
              <button type="button" id="save-progression" class="btn">Guardar progresión</button>
            </div>
            <ul id="saved-progressions" class="saved-list" aria-live="polite"></ul>
          </section>
          <section class="panel__section panel__section--actions">
            <div class="actions">
              <button type="submit" id="generate" class="btn btn--primary">Generar montuno</button>
              <button type="button" id="play" class="btn">Reproducir</button>
              <button type="button" id="download" class="btn" disabled>Descargar MIDI</button>
            </div>
            <div id="errors" class="errors" aria-live="assertive"></div>
          </section>
        </form>
        <aside class="summary" aria-live="polite">
          <h2>Resultado</h2>
          <div id="summary-content" class="summary__content">
            <p>Genera un montuno para ver los detalles de duración, compases y variaciones.</p>
          </div>
        </aside>
      </section>
    </main>
  `;
}

function grabRefs(root: HTMLElement): UiRefs {
  return {
    progressionInput: root.querySelector<HTMLTextAreaElement>('#progression')!,
    claveSelect: root.querySelector<HTMLSelectElement>('#clave')!,
    modoSelect: root.querySelector<HTMLSelectElement>('#modo')!,
    armonizacionSelect: root.querySelector<HTMLSelectElement>('#armonizacion')!,
    inversionSelect: root.querySelector<HTMLSelectElement>('#inversion')!,
    variationSelect: root.querySelector<HTMLSelectElement>('#variacion')!,
    bpmInput: root.querySelector<HTMLInputElement>('#bpm')!,
    seedInput: root.querySelector<HTMLInputElement>('#seed')!,
    generateBtn: root.querySelector<HTMLButtonElement>('#generate')!,
    playBtn: root.querySelector<HTMLButtonElement>('#play')!,
    downloadBtn: root.querySelector<HTMLButtonElement>('#download')!,
    errorList: root.querySelector<HTMLDivElement>('#errors')!,
    chordsTable: root.querySelector<HTMLTableSectionElement>('#chords')!,
    summary: root.querySelector<HTMLDivElement>('#summary-content')!,
    saveNameInput: root.querySelector<HTMLInputElement>('#saved-name')!,
    saveButton: root.querySelector<HTMLButtonElement>('#save-progression')!,
    savedList: root.querySelector<HTMLUListElement>('#saved-progressions')!,
  };
}

function bindStaticEvents(refs: UiRefs, root: HTMLElement): void {
  refs.progressionInput.addEventListener('input', (event) => {
    const value = (event.target as HTMLTextAreaElement).value;
    setProgression(value);
  });

  populateSelect(
    refs.claveSelect,
    Object.entries(CLAVES).map(([value, data]) => ({ value, label: data.label }))
  );
  refs.claveSelect.addEventListener('change', (event) => {
    setClave((event.target as HTMLSelectElement).value);
  });

  populateSelect(refs.modoSelect, MODOS.map((modo) => ({ value: modo, label: modo })));
  refs.modoSelect.addEventListener('change', (event) => {
    setDefaultModo((event.target as HTMLSelectElement).value as AppState['modoDefault']);
  });

  populateSelect(refs.armonizacionSelect, ARMONIZACIONES.map((item) => ({ value: item, label: item })));
  refs.armonizacionSelect.addEventListener('change', (event) => {
    setDefaultArmonizacion((event.target as HTMLSelectElement).value as AppState['armonizacionDefault']);
  });

  populateSelect(refs.inversionSelect, Object.entries(INVERSIONES).map(([value, label]) => ({ value, label })));
  refs.inversionSelect.addEventListener('change', (event) => {
    setDefaultInversion((event.target as HTMLSelectElement).value as AppState['inversionDefault']);
  });

  populateSelect(refs.variationSelect, VARIACIONES.map((value) => ({ value, label: value })));
  refs.variationSelect.addEventListener('change', (event) => {
    setVariation((event.target as HTMLSelectElement).value as AppState['variation']);
  });

  refs.bpmInput.addEventListener('change', (event) => {
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    const bpm = Number.isFinite(value) ? Math.min(220, Math.max(60, value)) : 120;
    (event.target as HTMLInputElement).value = String(bpm);
    setBpm(bpm);
  });

  refs.seedInput.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (value === '') {
      setSeed(null);
      return;
    }
    const seed = Number.parseInt(value, 10);
    if (Number.isNaN(seed)) {
      (event.target as HTMLInputElement).value = '';
      setSeed(null);
    } else {
      setSeed(seed);
    }
  });

  const form = root.querySelector<HTMLFormElement>('#montuno-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleGenerate(refs);
  });

  refs.playBtn.addEventListener('click', async () => {
    const audio = await getAudioModule();
    let state = getState();
    let result = state.generated;
    if (!result) {
      result = await handleGenerate(refs);
      state = getState();
      if (!result) {
        return;
      }
    }
    if (state.isPlaying || audio.isPlaying()) {
      audio.stop();
      resetPlayback();
      setIsPlaying(false);
      return;
    }
    await audio.loadSequence(result.events, result.bpm);
    audio.play();
    setIsPlaying(true);
    window.setTimeout(() => {
      if (audio.isPlaying()) {
        audio.stop();
      }
      setIsPlaying(false);
    }, result.durationSeconds * 1000 + 100);
  });

  refs.downloadBtn.addEventListener('click', async () => {
    const state = getState();
    if (!state.generated) {
      return;
    }
    const { generateMidiBlob } = await getMidiModule();
    const blob = generateMidiBlob(state.generated);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `montuno-${state.clave}-${state.variation}.mid`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  refs.saveButton.addEventListener('click', () => {
    saveCurrentProgression(refs.saveNameInput.value);
  });

  refs.saveNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      refs.saveButton.click();
    }
  });
}

async function handleGenerate(refs: UiRefs): Promise<GenerationResult | undefined> {
  const state = getState();
  if (state.errors.length) {
    return undefined;
  }
  try {
    const [generator, audio] = await Promise.all([getGeneratorModule(), getAudioModule()]);
    const result = await generator.generateMontuno(state);
    await audio.loadSequence(result.events, result.bpm);
    resetPlayback();
    setGenerated(result);
    setErrors([]);
    return result;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'No se pudo generar el montuno.';
    setErrors([message]);
    setGenerated(undefined);
    return undefined;
  }
}

function updateUi(state: AppState, refs: UiRefs): void {
  if (refs.progressionInput.value !== state.progressionInput) {
    refs.progressionInput.value = state.progressionInput;
  }
  if (refs.claveSelect.value !== state.clave) {
    refs.claveSelect.value = state.clave;
  }
  if (refs.modoSelect.value !== state.modoDefault) {
    refs.modoSelect.value = state.modoDefault;
  }
  if (refs.armonizacionSelect.value !== state.armonizacionDefault) {
    refs.armonizacionSelect.value = state.armonizacionDefault;
  }
  if (refs.inversionSelect.value !== state.inversionDefault) {
    refs.inversionSelect.value = state.inversionDefault;
  }
  if (refs.variationSelect.value !== state.variation) {
    refs.variationSelect.value = state.variation;
  }
  if (Number.parseFloat(refs.bpmInput.value) !== state.bpm) {
    refs.bpmInput.value = String(state.bpm);
  }
  refs.seedInput.value = state.seed === null || Number.isNaN(state.seed) ? '' : String(state.seed);

  renderChordRows(state, refs.chordsTable);
  renderErrors(state.errors, refs);
  renderSummary(state, refs.summary);
  renderSavedProgressions(state, refs);

  refs.generateBtn.disabled = state.progressionInput.trim().length === 0 || state.errors.length > 0;
  refs.playBtn.disabled = !state.generated && (state.progressionInput.trim().length === 0 || state.errors.length > 0);
  refs.playBtn.textContent = state.isPlaying ? 'Detener' : 'Reproducir';
  refs.downloadBtn.disabled = !state.generated;
  refs.saveButton.disabled = state.progressionInput.trim().length === 0 || state.errors.length > 0;
  refs.saveButton.textContent = state.activeProgressionId ? 'Actualizar progresión' : 'Guardar progresión';

  if (state.activeProgressionId !== lastActiveProgressionId && document.activeElement !== refs.saveNameInput) {
    const active = state.savedProgressions.find((item) => item.id === state.activeProgressionId);
    refs.saveNameInput.value = active ? active.name : '';
  }
  if (document.activeElement !== refs.saveNameInput) {
    refs.saveNameInput.placeholder = state.activeProgressionId
      ? 'Actualizar nombre de la progresión'
      : 'Intro en C mayor';
  }
  lastActiveProgressionId = state.activeProgressionId;
}

function populateSelect(select: HTMLSelectElement, options: { value: string; label: string }[]): void {
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join('');
}

function renderChordRows(state: AppState, tbody: HTMLTableSectionElement): void {
  tbody.innerHTML = '';
  state.chords.forEach((chord) => {
    tbody.appendChild(buildChordRow(chord));
  });
}

function buildChordRow(chord: ChordConfig): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${chord.index + 1}</td>
    <td>${chord.name}</td>
    <td></td>
    <td></td>
    <td></td>
  `;

  const modoSelect = createSelect(MODOS, chord.modo, (value) => {
    setChord(chord.index, { modo: value as AppState['modoDefault'] });
  });
  const armonizacionSelect = createSelect(ARMONIZACIONES, chord.armonizacion, (value) => {
    setChord(chord.index, { armonizacion: value as AppState['armonizacionDefault'] });
  });
  const inversionSelect = createSelect(Object.entries(INVERSIONES).map(([value, label]) => ({ value, label })), chord.inversion, (value) => {
    setChord(chord.index, { inversion: value as AppState['inversionDefault'] });
  });

  row.children[2].appendChild(modoSelect);
  row.children[3].appendChild(armonizacionSelect);
  row.children[4].appendChild(inversionSelect);

  return row;
}

function createSelect(
  options: string[] | { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void
): HTMLSelectElement {
  const select = document.createElement('select');
  const entries =
    Array.isArray(options) && options.length > 0 && typeof options[0] === 'string'
      ? (options as string[]).map((option) => ({ value: option, label: option }))
      : (options as { value: string; label: string }[]);
  entries.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });
  select.value = value;
  select.addEventListener('change', (event) => {
    onChange((event.target as HTMLSelectElement).value);
  });
  return select;
}

function renderErrors(errors: string[], refs: UiRefs): void {
  if (!errors.length) {
    refs.errorList.innerHTML = '';
    refs.errorList.classList.remove('errors--visible');
    return;
  }
  refs.errorList.classList.add('errors--visible');
  refs.errorList.innerHTML = `
    <ul>
      ${errors.map((error) => `<li>${error}</li>`).join('')}
    </ul>
  `;
}

function renderSummary(state: AppState, container: HTMLDivElement): void {
  if (!state.generated) {
    container.innerHTML = '<p>Genera un montuno para ver los detalles de duración, compases y variaciones.</p>';
    return;
  }
  const { generated } = state;
  const references = generated.referenceFiles.map((file) => file.split('/').pop() ?? file);
  const referencesHtml = references.length
    ? `<p><strong>Plantillas base:</strong> ${references.join(', ')}</p>`
    : '';
  container.innerHTML = `
    <p><strong>Compases:</strong> ${generated.lengthBars}</p>
    <p><strong>Tempo:</strong> ${generated.bpm} bpm</p>
    <p><strong>Duración estimada:</strong> ${generated.durationSeconds.toFixed(2)} s</p>
    <p><strong>Modo resultante:</strong> ${generated.modoTag}</p>
    <p><strong>Clave resultante:</strong> ${generated.claveTag}</p>
    <p><strong>Variación seleccionada:</strong> ${state.variation}</p>
    <p><strong>Clave seleccionada:</strong> ${state.clave}</p>
    ${referencesHtml}
  `;
}

const savedDateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function renderSavedProgressions(state: AppState, refs: UiRefs): void {
  const list = refs.savedList;
  list.innerHTML = '';

  if (!state.savedProgressions.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'saved-list__empty';
    emptyItem.textContent = 'Aún no hay progresiones guardadas.';
    list.appendChild(emptyItem);
    return;
  }

  state.savedProgressions.forEach((item) => {
    const entry = document.createElement('li');
    entry.className = 'saved-list__item';
    if (state.activeProgressionId === item.id) {
      entry.classList.add('saved-list__item--active');
    }

    const info = document.createElement('div');
    info.className = 'saved-list__info';

    const name = document.createElement('span');
    name.className = 'saved-list__name';
    name.textContent = item.name;

    const preview = document.createElement('span');
    preview.className = 'saved-list__preview';
    preview.textContent = item.progression;

    const timestamp = document.createElement('span');
    timestamp.className = 'saved-list__timestamp';
    const updatedAt = new Date(item.updatedAt);
    if (!Number.isNaN(updatedAt.getTime())) {
      timestamp.textContent = `Actualizado ${savedDateFormatter.format(updatedAt)}`;
    } else {
      timestamp.textContent = '';
    }

    info.append(name, preview, timestamp);

    const actions = document.createElement('div');
    actions.className = 'saved-list__actions';

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'saved-list__action';
    loadButton.textContent = 'Cargar';
    loadButton.addEventListener('click', () => {
      loadSavedProgression(item.id);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'saved-list__action saved-list__action--danger';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', () => {
      deleteSavedProgression(item.id);
    });

    actions.append(loadButton, deleteButton);
    entry.append(info, actions);
    list.appendChild(entry);
  });
}
