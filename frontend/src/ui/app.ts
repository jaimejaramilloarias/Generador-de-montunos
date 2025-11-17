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
  setDefaultOctavacion,
  setDefaultModo,
  shiftAllInversions,
  nudgeChordBass,
  setMidiOutputs,
  setMidiStatus,
  setSelectedMidiOutput,
  setErrors,
  setGenerated,
  setIsPlaying,
  setIsGenerating,
  setProgression,
  setSeed,
  subscribe,
} from '../state/store';
import { ARMONIZACIONES, CLAVES, MODOS, OCTAVACIONES } from '../types/constants';
import type { AppState, GenerationResult, MidiStatus } from '../types';
import { CHORD_SUFFIX_SUGGESTIONS, getChordSuffixSuggestions } from '../utils/chordAutocomplete';
import { isExtendedChordName } from '../utils/chords';
import { mountSignalViewer } from './signalViewer';

type GeneratorModule = typeof import('../music/generator');
type AudioModule = typeof import('../audio/player');
type MidiExportModule = typeof import('../utils/midiExport');
type MidiManagerModule = typeof import('../midi/manager');

let generatorModulePromise: Promise<GeneratorModule> | null = null;
let audioModulePromise: Promise<AudioModule> | null = null;
let midiExportModulePromise: Promise<MidiExportModule> | null = null;
let midiManagerModulePromise: Promise<MidiManagerModule> | null = null;
let midiOutputsUnsubscribe: (() => void) | null = null;
let previousState: AppState | null = null;
let autoGenerateHandle: number | null = null;
let hasRenderedOnce = false;
let signalViewer: ReturnType<typeof mountSignalViewer> | null = null;

interface UiRefs {
  progressionInput: HTMLTextAreaElement;
  claveSelect: HTMLSelectElement;
  modoSelect: HTMLSelectElement;
  armonizacionSelect: HTMLSelectElement;
  octavacionSelect: HTMLSelectElement;
  bpmInput: HTMLInputElement;
  seedInput: HTMLInputElement;
  inversionShiftUpBtn: HTMLButtonElement;
  inversionShiftDownBtn: HTMLButtonElement;
  generateBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  errorList: HTMLDivElement;
  summary: HTMLDivElement;
  signalViewer: HTMLDivElement;
  signalOpenLink: HTMLAnchorElement;
  saveNameInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  savedList: HTMLUListElement;
  chordHints: HTMLDivElement;
  midiEnableBtn: HTMLButtonElement;
  midiOutputSelect: HTMLSelectElement;
  midiStatusText: HTMLParagraphElement;
}

const MIDI_STATUS_MESSAGES: Record<MidiStatus, string> = {
  unavailable: 'Este navegador no soporta la API Web MIDI.',
  idle: 'Solicita acceso para listar los puertos MIDI disponibles.',
  pending: 'Solicitando permisos MIDI…',
  ready: 'Selecciona un puerto para enviar la reproducción en tiempo real.',
  denied: 'El acceso MIDI fue denegado. Intenta permitirlo nuevamente.',
};

const MIDI_BUTTON_LABELS: Record<MidiStatus, string> = {
  unavailable: 'MIDI no disponible',
  idle: 'Activar MIDI',
  pending: 'Activando…',
  ready: 'Actualizar puertos',
  denied: 'Reintentar acceso',
};

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

function getMidiExportModule(): Promise<MidiExportModule> {
  if (!midiExportModulePromise) {
    midiExportModulePromise = import('../utils/midiExport');
  }
  return midiExportModulePromise;
}

function getMidiManagerModule(): Promise<MidiManagerModule> {
  if (!midiManagerModulePromise) {
    midiManagerModulePromise = import('../midi/manager');
  }
  return midiManagerModulePromise;
}

function scheduleModulePrefetch(): void {
  window.setTimeout(() => {
    void getGeneratorModule();
    void getAudioModule();
    void getMidiExportModule();
  }, 250);
}

async function ensureWebAudioReady(audio: AudioModule): Promise<void> {
  try {
    await audio.prepareAudio();
  } catch (error) {
    console.warn('No se pudo inicializar el motor de audio.', error);
  }
}

async function getExistingAudioModule(): Promise<AudioModule | null> {
  if (!audioModulePromise) {
    return null;
  }
  try {
    return await audioModulePromise;
  } catch (error) {
    console.warn('No se pudo acceder al sintetizador web.', error);
    return null;
  }
}

async function stopExistingWebAudio(): Promise<void> {
  const audio = await getExistingAudioModule();
  if (!audio) {
    return;
  }
  try {
    audio.stop();
  } catch (error) {
    console.warn('No se pudo detener el sintetizador web.', error);
  }
}

async function stopAllPlayback(): Promise<void> {
  const midiPromise = getState().midiStatus === 'ready'
    ? getMidiManagerModule().catch((error) => {
        console.warn('No se pudo acceder al administrador MIDI.', error);
        return null;
      })
    : Promise.resolve(null);
  const [audio, midi] = await Promise.all([getExistingAudioModule(), midiPromise]);

  try {
    audio?.stop();
  } catch (error) {
    console.warn('No se pudo detener el sintetizador web.', error);
  }

  try {
    midi?.stopPlayback();
  } catch (error) {
    console.warn('No se pudo detener la reproducción MIDI.', error);
  }

  resetPlayback();
  setIsPlaying(false);
}

function shiftOctavacion(index: number, direction: 1 | -1): void {
  const chord = getState().chords[index];
  if (!chord) {
    return;
  }
  const currentIndex = OCTAVACIONES.indexOf(chord.octavacion);
  const baseIndex = currentIndex === -1 ? 0 : currentIndex;
  const targetIndex = Math.min(Math.max(baseIndex + direction, 0), OCTAVACIONES.length - 1);
  const next = OCTAVACIONES[targetIndex];
  if (next !== chord.octavacion) {
    setChord(index, { octavacion: next });
  }
}

async function applyMidiSelection(nextId: string | null, options?: { force?: boolean }): Promise<void> {
  const previous = getState().selectedMidiOutputId;
  const shouldUpdate = options?.force || previous !== nextId;
  if (!shouldUpdate) {
    return;
  }

  setSelectedMidiOutput(nextId);
  resetPlayback();

  const midiReady = getState().midiStatus === 'ready';
  let midi: MidiManagerModule | null = null;
  if (midiReady) {
    try {
      midi = await getMidiManagerModule();
    } catch (error) {
      console.warn('No se pudo acceder al administrador MIDI.', error);
    }
  }

  if (nextId) {
    await stopExistingWebAudio();
    if (midi) {
      try {
        midi.stopPlayback();
        midi.setSelectedOutput(nextId);
        const state = getState();
        if (state.generated) {
          midi.preparePlayback(state.generated.events, state.generated.bpm);
        }
      } catch (error) {
        console.warn('No se pudo actualizar el puerto MIDI seleccionado.', error);
      }
    }
    return;
  }

  if (midi) {
    try {
      midi.stopPlayback();
      midi.setSelectedOutput(null);
    } catch (error) {
      console.warn('No se pudo desactivar la salida MIDI.', error);
    }
  }

  await stopExistingWebAudio();
  const current = getState();
  if (current.generated) {
    try {
      const audio = await getAudioModule();
      await audio.loadSequence(current.generated.events, current.generated.bpm);
    } catch (error) {
      console.warn('No se pudo preparar el sintetizador web tras desactivar MIDI.', error);
    }
  }
}

function renderSuffixHints(container: HTMLDivElement, suggestions: string[]): void {
  container.innerHTML = '';
  if (!suggestions.length) {
    container.classList.add('suffix-hints--hidden');
    return;
  }
  container.classList.remove('suffix-hints--hidden');
  const fragment = document.createDocumentFragment();
  suggestions.forEach((item) => {
    const badge = document.createElement('span');
    badge.className = 'suffix-hints__item';
    badge.textContent = item;
    badge.setAttribute('role', 'listitem');
    fragment.appendChild(badge);
  });
  container.appendChild(fragment);
}

function refreshChordSuffixHints(refs: UiRefs): void {
  if (document.activeElement !== refs.progressionInput) {
    renderSuffixHints(refs.chordHints, []);
    return;
  }
  const cursor = refs.progressionInput.selectionStart ?? refs.progressionInput.value.length;
  const matches = getChordSuffixSuggestions(refs.progressionInput.value, cursor);
  const suggestions = matches.length ? matches : CHORD_SUFFIX_SUGGESTIONS;
  renderSuffixHints(refs.chordHints, suggestions);
}

function scheduleAutoGeneration(state: AppState, refs: UiRefs): void {
  if (!hasRenderedOnce) {
    return;
  }
  const hasBlockingState =
    state.isGenerating || state.generated || state.errors.length > 0 || !state.progressionInput.trim();

  if (hasBlockingState) {
    if (autoGenerateHandle !== null) {
      window.clearTimeout(autoGenerateHandle);
      autoGenerateHandle = null;
    }
    return;
  }

  if (autoGenerateHandle !== null) {
    window.clearTimeout(autoGenerateHandle);
  }
  autoGenerateHandle = window.setTimeout(() => {
    autoGenerateHandle = null;
    const latest = getState();
    if (latest.isGenerating || latest.generated || latest.errors.length > 0) {
      return;
    }
    if (!latest.progressionInput.trim()) {
      return;
    }
    void handleGenerate(refs);
  }, 250);
}

function shouldIgnorePlaybackHotkey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
}

async function togglePlayback(refs: UiRefs): Promise<void> {
  const initialState = getState();
  const useWebAudio = !initialState.selectedMidiOutputId;
  const audio = useWebAudio ? await getAudioModule() : null;
  if (audio) {
    await ensureWebAudioReady(audio);
  }
  let state = getState();
  let result = state.generated;
  if (!result) {
    result = await handleGenerate(refs);
    state = getState();
    if (!result) {
      return;
    }
  }

  const midi = state.midiStatus === 'ready'
    ? await getMidiManagerModule().catch((error) => {
        console.warn('No se pudo acceder al administrador MIDI.', error);
        return null;
      })
    : null;

  if (state.isPlaying || (audio?.isPlaying?.() ?? false)) {
    await stopAllPlayback();
    return;
  }

  if (useWebAudio) {
    await audio!.loadSequence(result.events, result.bpm);
  }
  if (midi) {
    try {
      midi.preparePlayback(result.events, result.bpm);
      midi.startPlayback();
    } catch (error) {
      console.warn('No se pudo iniciar la reproducción MIDI.', error);
    }
  }
  if (useWebAudio) {
    audio!.play();
  }
  setIsPlaying(true);
  window.setTimeout(() => {
    if (audio?.isPlaying?.()) {
      audio.stop();
    }
    midi?.stopPlayback();
    setIsPlaying(false);
  }, result.durationSeconds * 1000 + 100);
}

let lastActiveProgressionId: string | null = null;

export function setupApp(root: HTMLElement): void {
  root.innerHTML = buildLayout();
  const refs = grabRefs(root);
  signalViewer = mountSignalViewer(refs.signalViewer, {
    onBassNudge: nudgeChordBass,
    onOctaveShift: shiftOctavacion,
    onModeChange: (index, modo) => {
      setChord(index, { modo });
    },
    onArmonizacionChange: (index, armonizacion) => {
      setChord(index, { armonizacion });
    },
    onOctavacionChange: (index, octavacion) => {
      setChord(index, { octavacion });
    },
    onInversionChange: (index, inversion) => {
      setChord(index, { inversion });
    },
  });
  bindStaticEvents(refs, root);
  subscribe((state) => {
    updateUi(state, refs);
    if (previousState?.generated && !state.generated) {
      void stopAllPlayback();
    }
    scheduleAutoGeneration(state, refs);
    hasRenderedOnce = true;
    previousState = state;
  });
  scheduleModulePrefetch();
}

function buildLayout(): string {
  return `
    <main class="app">
      <header class="app__header">
        <h1>Generador de Montunos</h1>
        <p>Desarrollado por Jaime Jaramillo Arias.</p>
      </header>
      <section class="app__signal" aria-label="Editor MIDI Signal">
        <section class="signal-embed">
          <div class="signal-embed__header">
            <div>
              <h3>Editor MIDI Signal integrado</h3>
              <p>Visualiza al instante el montuno generado, ajusta cada acorde y mándalo a Signal con un solo clic.</p>
            </div>
            <div class="signal-embed__toolbar" aria-label="Reproducción y controles avanzados">
              <button
                type="button"
                id="generate"
                class="icon-btn"
                title="Generar montuno"
                aria-label="Generar montuno"
              >
                ⟳
              </button>
              <button
                type="button"
                id="play"
                class="icon-btn"
                title="Reproducir o detener"
                aria-label="Reproducir o detener"
              >
                ⏯
              </button>
              <button
                type="button"
                id="download"
                class="icon-btn"
                title="Descargar MIDI"
                aria-label="Descargar MIDI"
                disabled
              >
                ⬇
              </button>
              <div class="icon-btn__group" role="group" aria-label="Desplazar inversiones">
                <button type="button" id="shift-inv-up" class="icon-btn" title="Subir inversiones">⤴</button>
                <button type="button" id="shift-inv-down" class="icon-btn" title="Bajar inversiones">⤵</button>
              </div>
            </div>
            <div class="signal-embed__cta-group">
              <a
                id="signal-open"
                class="btn signal-embed__cta"
                href="https://signalmidi.app/edit"
                target="_blank"
                rel="noreferrer"
              >
                Abrir Signal
              </a>
            </div>
          </div>
            <div class="signal-embed__preview signal-embed__preview--full">
              <div id="signal-viewer" class="signal-viewer"></div>
              <p class="signal-embed__hint">
              Se actualiza automáticamente al regenerar o cambiar parámetros. Ajusta modo, armonización, octavación, inversión y nota grave por acorde justo debajo del gráfico.
            </p>
          </div>
        </section>
      </section>
      <section class="app__body">
        <form class="panel" id="montuno-form">
          <fieldset class="panel__section">
            <legend>Progresión de acordes</legend>
            <textarea id="progression" rows="4" spellcheck="false" placeholder="Cmaj7 F7 | G7 Cmaj7"></textarea>
            <p class="panel__hint">Separa acordes con espacios o barras verticales. Puedes incluir tensiones como Cm7(b5).</p>
            <div
              id="chord-suffix-hints"
              class="suffix-hints suffix-hints--hidden"
              role="list"
              aria-live="polite"
            ></div>
            <div id="errors" class="errors" aria-live="assertive"></div>
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
                <span>Octavación por defecto</span>
                <select id="octavacion"></select>
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
              <h2>Conexión MIDI</h2>
              <p>Envía el montuno a un dispositivo local mediante Web MIDI.</p>
            </header>
            <div class="midi-controls">
              <button type="button" id="midi-enable" class="btn">Activar MIDI</button>
              <select id="midi-output" disabled>
                <option value="">Selecciona un puerto</option>
              </select>
            </div>
            <p id="midi-status" class="midi-status">El navegador no ha solicitado acceso MIDI.</p>
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
    octavacionSelect: root.querySelector<HTMLSelectElement>('#octavacion')!,
    bpmInput: root.querySelector<HTMLInputElement>('#bpm')!,
    seedInput: root.querySelector<HTMLInputElement>('#seed')!,
    inversionShiftUpBtn: root.querySelector<HTMLButtonElement>('#shift-inv-up')!,
    inversionShiftDownBtn: root.querySelector<HTMLButtonElement>('#shift-inv-down')!,
    generateBtn: root.querySelector<HTMLButtonElement>('#generate')!,
    playBtn: root.querySelector<HTMLButtonElement>('#play')!,
    downloadBtn: root.querySelector<HTMLButtonElement>('#download')!,
    errorList: root.querySelector<HTMLDivElement>('#errors')!,
    summary: root.querySelector<HTMLDivElement>('#summary-content')!,
    signalViewer: root.querySelector<HTMLDivElement>('#signal-viewer')!,
    signalOpenLink: root.querySelector<HTMLAnchorElement>('#signal-open')!,
    saveNameInput: root.querySelector<HTMLInputElement>('#saved-name')!,
    saveButton: root.querySelector<HTMLButtonElement>('#save-progression')!,
    savedList: root.querySelector<HTMLUListElement>('#saved-progressions')!,
    chordHints: root.querySelector<HTMLDivElement>('#chord-suffix-hints')!,
    midiEnableBtn: root.querySelector<HTMLButtonElement>('#midi-enable')!,
    midiOutputSelect: root.querySelector<HTMLSelectElement>('#midi-output')!,
    midiStatusText: root.querySelector<HTMLParagraphElement>('#midi-status')!,
  };
}

function bindStaticEvents(refs: UiRefs, root: HTMLElement): void {
  refs.progressionInput.addEventListener('input', (event) => {
    const input = event.target as HTMLTextAreaElement;
    setProgression(input.value);
    refreshChordSuffixHints(refs);
  });

  refs.progressionInput.addEventListener('focus', () => {
    refreshChordSuffixHints(refs);
  });

  refs.progressionInput.addEventListener('blur', () => {
    renderSuffixHints(refs.chordHints, []);
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

  populateSelect(refs.octavacionSelect, OCTAVACIONES.map((item) => ({ value: item, label: item })));
  refs.octavacionSelect.addEventListener('change', (event) => {
    setDefaultOctavacion((event.target as HTMLSelectElement).value as AppState['octavacionDefault']);
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

  refs.inversionShiftUpBtn.addEventListener('click', () => {
    shiftAllInversions(1);
  });

  refs.inversionShiftDownBtn.addEventListener('click', () => {
    shiftAllInversions(-1);
  });

  refs.midiEnableBtn.addEventListener('click', async () => {
    const status = getState().midiStatus;
    if (status === 'pending' || status === 'unavailable') {
      return;
    }
    setMidiStatus('pending');
    try {
      const midi = await getMidiManagerModule();
      const result = await midi.requestMidiAccess();
      setMidiStatus(result.status);
      setMidiOutputs(result.outputs ?? []);
      if (midiOutputsUnsubscribe) {
        midiOutputsUnsubscribe();
        midiOutputsUnsubscribe = null;
      }
      if (result.status === 'ready') {
        midiOutputsUnsubscribe = midi.onOutputsChanged((outputs) => {
          setMidiOutputs(outputs);
          const current = getState();
          const selectedId = current.selectedMidiOutputId;
          if (selectedId && !outputs.some((output) => output.id === selectedId)) {
            void applyMidiSelection(null);
          } else if (selectedId) {
            midi.setSelectedOutput(selectedId);
          }
        });
        const desired = getState().selectedMidiOutputId;
        if (desired) {
          void applyMidiSelection(desired, { force: true });
        } else {
          void applyMidiSelection(null, { force: true });
        }
      }
    } catch (error) {
      console.warn('No se pudo inicializar Web MIDI.', error);
      setMidiStatus('denied');
      setMidiOutputs([]);
    }
  });

  refs.midiOutputSelect.addEventListener('change', (event) => {
    const state = getState();
    if (state.midiStatus !== 'ready') {
      return;
    }
    const value = (event.target as HTMLSelectElement).value;
    const nextId = value === '' ? null : value;
    void applyMidiSelection(nextId);
  });

  const form = root.querySelector<HTMLFormElement>('#montuno-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleGenerate(refs);
  });

  refs.generateBtn.addEventListener('click', async () => {
    await handleGenerate(refs);
  });

  refs.playBtn.addEventListener('click', () => {
    void togglePlayback(refs);
  });

  const handleSpaceToggle = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' && event.key !== ' ') {
      return;
    }
    if (shouldIgnorePlaybackHotkey(event.target)) {
      return;
    }
    event.preventDefault();
    void togglePlayback(refs);
  };

  window.addEventListener('keydown', handleSpaceToggle);

  refs.downloadBtn.addEventListener('click', async () => {
    const state = getState();
    if (!state.generated) {
      return;
    }
    const { generateMidiBlob } = await getMidiExportModule();
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

  refs.signalOpenLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const state = getState();
    if (!state.generated) {
      return;
    }

    const openSignal = (): void => {
      window.open(refs.signalOpenLink.href, '_blank', 'noopener,noreferrer');
    };

    try {
      const { generateMidiBlob } = await getMidiExportModule();
      const blob = generateMidiBlob(state.generated);
      if ('clipboard' in navigator && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ 'audio/midi': blob })]);
        refs.signalOpenLink.dataset.tooltip = 'MIDI actualizado listo en Signal';
        window.setTimeout(() => {
          delete refs.signalOpenLink.dataset.tooltip;
        }, 2500);
      }
    } catch (error) {
      console.warn('No se pudo preparar el envío a Signal.', error);
    }

    openSignal();
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
  const initialState = getState();
  if (initialState.errors.length) {
    return undefined;
  }
  setIsGenerating(true);
  try {
    const generatorPromise = getGeneratorModule();
    const state = getState();
    const shouldPrepareAudio = !state.selectedMidiOutputId;
    const audioPromise: Promise<AudioModule | null> = shouldPrepareAudio
      ? getAudioModule()
      : Promise.resolve<AudioModule | null>(null);
    const [generator, audio] = await Promise.all([generatorPromise, audioPromise]);
    const result = await generator.generateMontuno(state);
    setGenerated(result);
    setErrors([]);
    resetPlayback();

    if (audio) {
      void ensureWebAudioReady(audio).then(() =>
        audio
          .loadSequence(result.events, result.bpm)
          .catch((error: unknown) => {
            console.warn('No se pudo preparar la reproducción del montuno.', error);
          })
      );
    }

    if (getState().midiStatus === 'ready') {
      void getMidiManagerModule()
        .then((midi) => {
          midi.preparePlayback(result.events, result.bpm);
        })
        .catch((error: unknown) => {
          console.warn('No se pudo preparar la salida MIDI.', error);
        });
    }

    return result;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'No se pudo generar el montuno.';
    setErrors([message]);
    setGenerated(undefined);
    return undefined;
  } finally {
    setIsGenerating(false);
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
  if (refs.octavacionSelect.value !== state.octavacionDefault) {
    refs.octavacionSelect.value = state.octavacionDefault;
  }
  if (Number.parseFloat(refs.bpmInput.value) !== state.bpm) {
    refs.bpmInput.value = String(state.bpm);
  }
  refs.seedInput.value = state.seed === null || Number.isNaN(state.seed) ? '' : String(state.seed);

  const armonizacionEnabled = state.modoDefault === 'Tradicional';
  refs.armonizacionSelect.disabled = !armonizacionEnabled;
  refs.armonizacionSelect.title = armonizacionEnabled
    ? 'Armonización por defecto para modo Tradicional'
    : 'La armonización solo se habilita cuando el modo por defecto es Tradicional';

  renderErrors(state.errors, refs);
  renderSummary(state, refs.summary);
  renderSignalArea(state, refs);
  renderSavedProgressions(state, refs);
  renderMidi(state, refs);

  const progressionEmpty = state.progressionInput.trim().length === 0;
  const hasBlockingErrors = state.errors.length > 0;
  refs.generateBtn.disabled = state.isGenerating || progressionEmpty || hasBlockingErrors;
  refs.playBtn.disabled =
    state.isGenerating || (!state.generated && (progressionEmpty || hasBlockingErrors));
  refs.playBtn.textContent = state.isPlaying ? 'Detener' : 'Reproducir';
  refs.downloadBtn.disabled = state.isGenerating || !state.generated;
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
  refreshChordSuffixHints(refs);
  lastActiveProgressionId = state.activeProgressionId;
}

function populateSelect(select: HTMLSelectElement, options: { value: string; label: string }[]): void {
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join('');
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
  if (state.isGenerating) {
    container.innerHTML = `
      <p><strong>Compases:</strong> Calculando…</p>
      <p>Generando montuno, esto puede tardar unos segundos.</p>
    `;
    return;
  }
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
    <p><strong>Clave seleccionada:</strong> ${state.clave}</p>
    ${referencesHtml}
  `;
}

function renderSignalArea(state: AppState, refs: UiRefs): void {
  signalViewer?.setBusy(state.isGenerating);
  signalViewer?.render(state.generated, state.chords);

  const hasMidi = Boolean(state.generated);
  refs.signalOpenLink.classList.toggle('signal-embed__cta--disabled', !hasMidi);
  if (hasMidi) {
    refs.signalOpenLink.removeAttribute('aria-disabled');
    refs.signalOpenLink.title = 'Abrir Signal y pegar el MIDI generado';
  } else {
    refs.signalOpenLink.setAttribute('aria-disabled', 'true');
    refs.signalOpenLink.title = 'Genera un montuno para habilitar Signal';
  }
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

function renderMidi(state: AppState, refs: UiRefs): void {
  const { midiStatus, midiOutputs, selectedMidiOutputId } = state;
  const baseMessage = MIDI_STATUS_MESSAGES[midiStatus];
  if (midiStatus === 'ready' && midiOutputs.length === 0) {
    refs.midiStatusText.textContent = 'No se detectaron puertos MIDI. Conecta un dispositivo y pulsa “Actualizar puertos”.';
  } else {
    refs.midiStatusText.textContent = baseMessage;
  }

  refs.midiEnableBtn.textContent = MIDI_BUTTON_LABELS[midiStatus];
  refs.midiEnableBtn.disabled = midiStatus === 'pending' || midiStatus === 'unavailable';

  const select = refs.midiOutputSelect;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = midiOutputs.length ? 'Selecciona un puerto' : 'Sin puertos disponibles';
  select.appendChild(placeholder);

  midiOutputs.forEach((output) => {
    const option = document.createElement('option');
    option.value = output.id;
    option.textContent = output.manufacturer ? `${output.name} (${output.manufacturer})` : output.name;
    select.appendChild(option);
  });

  const desired = selectedMidiOutputId ?? '';
  select.value = midiOutputs.some((output) => output.id === desired) ? desired : '';
  select.disabled = midiStatus !== 'ready' || midiOutputs.length === 0;
}
