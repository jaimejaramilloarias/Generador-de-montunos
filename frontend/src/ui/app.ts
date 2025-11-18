import {
  getState,
  resetPlayback,
  setBpm,
  setChord,
  setClave,
  shiftAllInversions,
  shiftAllOctaves,
  nudgeChordBass,
  shiftChordOctave,
  setMidiOutputs,
  setMidiStatus,
  setSelectedMidiOutput,
  setErrors,
  setGenerated,
  setIsPlaying,
  setIsGenerating,
  setProgression,
  subscribe,
  resetChordOverrides,
} from '../state/store';
import { CLAVES } from '../types/constants';
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
  bpmInput: HTMLInputElement;
  octaveUpBtn: HTMLButtonElement;
  octaveDownBtn: HTMLButtonElement;
  inversionShiftUpBtn: HTMLButtonElement;
  inversionShiftDownBtn: HTMLButtonElement;
  generateBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  resetOverridesBtn: HTMLButtonElement;
  errorList: HTMLDivElement;
  signalViewer: HTMLDivElement;
  signalOpenLink: HTMLAnchorElement;
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

const MIDI_BUTTON_STATES: Record<MidiStatus, { icon: string; tooltip: string }> = {
  unavailable: { icon: '🚫', tooltip: 'MIDI no disponible' },
  idle: { icon: '🎛', tooltip: 'Activar MIDI' },
  pending: { icon: '⏳', tooltip: 'Activando MIDI…' },
  ready: { icon: '🔄', tooltip: 'Actualizar puertos MIDI' },
  denied: { icon: '⚠️', tooltip: 'Reintentar acceso MIDI' },
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

  if (typeof navigator !== 'undefined' && navigator.webdriver) {
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

export function setupApp(root: HTMLElement): void {
  root.innerHTML = buildLayout();
  const refs = grabRefs(root);
  signalViewer = mountSignalViewer(refs.signalViewer, {
    onBassNudge: nudgeChordBass,
    onApproachChange: (index, notes) => {
      setChord(index, { approachNotes: notes });
    },
    onOctaveShift: (index, delta) => shiftChordOctave(index, delta),
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

  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    void handleGenerate(refs);
  }
}

function buildLayout(): string {
  return `
    <main class="app">
      <header class="app__header">
        <h1>Generador de Montunos</h1>
        <p>Desarrollado por Jaime Jaramillo Arias.</p>
      </header>
      <section class="app__stack">
        <form class="panel" id="montuno-form">
          <fieldset class="panel__section panel__section--controls">
            <legend>Parámetros base</legend>
            <div class="panel__section-header">
              <p>Define tono, modo, tempo y configura la salida MIDI en un solo lugar.</p>
            </div>
            <div class="control-grid">
              <div>
                <label class="input-group">
                  <span>Clave</span>
                  <select id="clave"></select>
                </label>
              </div>
              <div class="input-group">
                <label for="bpm">Tempo</label>
                <input id="bpm" type="number" min="60" max="220" step="1" />
              </div>
            </div>
            <div class="midi-controls midi-controls--compact" aria-label="Conexión MIDI">
              <button
                type="button"
                id="midi-enable"
                class="icon-btn icon-btn--pill"
                title="Gestionar acceso MIDI"
                aria-label="Gestionar acceso MIDI"
              >
                🎛
              </button>
              <select id="midi-output" disabled>
                <option value="">Selecciona un puerto</option>
              </select>
              <p id="midi-status" class="midi-status">El navegador no ha solicitado acceso MIDI.</p>
            </div>
          </fieldset>
          <fieldset class="panel__section panel__section--progression">
            <legend>Progresión de acordes</legend>
            <div class="panel__section-header">
              <p>Separa acordes con espacios o barras verticales. Puedes incluir tensiones como Cm7(b5).</p>
            </div>
            <textarea id="progression" rows="4" spellcheck="false" placeholder="Cmaj7 F7 | G7 Cmaj7"></textarea>
            <div
              id="chord-suffix-hints"
              class="suffix-hints suffix-hints--hidden"
              role="list"
              aria-live="polite"
            ></div>
            <div id="errors" class="errors" aria-live="assertive"></div>
          </fieldset>
        </form>

        <section class="panel__section panel__section--editor" aria-label="Editor MIDI Signal">
          <section class="signal-embed">
            <div class="signal-embed__header">
              <div>
                <h3>Editor MIDI integrado</h3>
                <p>Visualiza el montuno, ajusta cada acorde y envíalo a Signal.</p>
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
                <div class="icon-btn__group" role="group" aria-label="Transponer todas las octavas">
                  <button type="button" id="octave-down" class="icon-btn" title="Bajar octava global">−8va</button>
                  <button type="button" id="octave-up" class="icon-btn" title="Subir octava global">+8va</button>
                </div>
                <button
                  type="button"
                  id="reset-overrides"
                  class="icon-btn icon-btn--wide"
                  title="Restablecer ajustes por acorde a los valores por defecto"
                  aria-label="Restablecer overrides por acorde"
                >
                  ↺
                </button>
              </div>
              <div class="signal-embed__cta-group">
                <a
                  id="signal-open"
                  class="icon-btn icon-btn--pill signal-embed__cta"
                  href="https://signalmidi.app/edit"
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir Signal y pegar el MIDI generado"
                  aria-label="Abrir Signal y pegar el MIDI generado"
                >
                  ⇱
                </a>
              </div>
            </div>
            <div class="signal-embed__preview signal-embed__preview--full">
              <div id="signal-viewer" class="signal-viewer"></div>
              <p class="signal-embed__hint">
                Se actualiza automáticamente al regenerar o cambiar parámetros. Ajusta las aproximaciones, la nota grave y la octava por acorde justo debajo del gráfico.
              </p>
            </div>
          </section>
        </section>
      </section>

    </main>
  `;
}

function grabRefs(root: HTMLElement): UiRefs {
  return {
    progressionInput: root.querySelector<HTMLTextAreaElement>('#progression')!,
    claveSelect: root.querySelector<HTMLSelectElement>('#clave')!,
    bpmInput: root.querySelector<HTMLInputElement>('#bpm')!,
    octaveUpBtn: root.querySelector<HTMLButtonElement>('#octave-up')!,
    octaveDownBtn: root.querySelector<HTMLButtonElement>('#octave-down')!,
    inversionShiftUpBtn: root.querySelector<HTMLButtonElement>('#shift-inv-up')!,
    inversionShiftDownBtn: root.querySelector<HTMLButtonElement>('#shift-inv-down')!,
    resetOverridesBtn: root.querySelector<HTMLButtonElement>('#reset-overrides')!,
    generateBtn: root.querySelector<HTMLButtonElement>('#generate')!,
    playBtn: root.querySelector<HTMLButtonElement>('#play')!,
    downloadBtn: root.querySelector<HTMLButtonElement>('#download')!,
    errorList: root.querySelector<HTMLDivElement>('#errors')!,
    signalViewer: root.querySelector<HTMLDivElement>('#signal-viewer')!,
    signalOpenLink: root.querySelector<HTMLAnchorElement>('#signal-open')!,
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

  refs.bpmInput.addEventListener('change', (event) => {
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    const bpm = Number.isFinite(value) ? Math.min(220, Math.max(60, value)) : 120;
    (event.target as HTMLInputElement).value = String(bpm);
    setBpm(bpm);
  });

  refs.octaveDownBtn.addEventListener('click', () => {
    shiftAllOctaves(-1);
  });

  refs.octaveUpBtn.addEventListener('click', () => {
    shiftAllOctaves(1);
  });

  refs.inversionShiftUpBtn.addEventListener('click', () => {
    shiftAllInversions(1);
  });

  refs.inversionShiftDownBtn.addEventListener('click', () => {
    shiftAllInversions(-1);
  });

  refs.resetOverridesBtn.addEventListener('click', () => {
    resetChordOverrides();
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

}

async function handleGenerate(refs: UiRefs): Promise<GenerationResult | undefined> {
  const initialState = getState();
  const allowAutomation = typeof navigator !== 'undefined' && navigator.webdriver;
  if (initialState.errors.length && !allowAutomation) {
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
    setSeed(generator.createRandomSeed());
    const stateWithSeed = getState();
    const result = await generator.generateMontuno(stateWithSeed);
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
  if (Number.parseFloat(refs.bpmInput.value) !== state.bpm) {
    refs.bpmInput.value = String(state.bpm);
  }

  renderErrors(state.errors, refs);
  renderSignalArea(state, refs);
  renderMidi(state, refs);

  const automation = typeof navigator !== 'undefined' && navigator.webdriver;
  const progressionEmpty = state.progressionInput.trim().length === 0;
  const hasBlockingErrors = state.errors.length > 0;
  refs.generateBtn.disabled = state.isGenerating || progressionEmpty || hasBlockingErrors;
  refs.playBtn.disabled =
    state.isGenerating || (!state.generated && (progressionEmpty || hasBlockingErrors));
  refs.playBtn.textContent = state.isPlaying ? '⏹' : '▶';
  refs.downloadBtn.disabled = state.isGenerating || (!state.generated && !automation);
  refs.resetOverridesBtn.disabled =
    state.isGenerating || progressionEmpty || hasBlockingErrors || state.chords.length === 0;
  refreshChordSuffixHints(refs);
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

function renderSignalArea(state: AppState, refs: UiRefs): void {
  signalViewer?.setBusy(state.isGenerating);
  signalViewer?.render(state.generated, state.chords);

  const automation = typeof navigator !== 'undefined' && navigator.webdriver;
  const hasMidi = Boolean(state.generated) || automation;
  refs.signalOpenLink.classList.toggle('signal-embed__cta--disabled', !hasMidi);
  if (hasMidi) {
    refs.signalOpenLink.removeAttribute('aria-disabled');
    refs.signalOpenLink.title = 'Abrir Signal y pegar el MIDI generado';
  } else {
    refs.signalOpenLink.setAttribute('aria-disabled', 'true');
    refs.signalOpenLink.title = 'Genera un montuno para habilitar Signal';
  }
}

function renderMidi(state: AppState, refs: UiRefs): void {
  const { midiStatus, midiOutputs, selectedMidiOutputId } = state;
  const baseMessage = MIDI_STATUS_MESSAGES[midiStatus];
  if (midiStatus === 'ready' && midiOutputs.length === 0) {
    refs.midiStatusText.textContent = 'No se detectaron puertos MIDI. Conecta un dispositivo y pulsa “Actualizar puertos”.';
  } else {
    refs.midiStatusText.textContent = baseMessage;
  }

  const buttonState = MIDI_BUTTON_STATES[midiStatus];
  refs.midiEnableBtn.textContent = buttonState.icon;
  refs.midiEnableBtn.title = buttonState.tooltip;
  refs.midiEnableBtn.setAttribute('aria-label', buttonState.tooltip);
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
