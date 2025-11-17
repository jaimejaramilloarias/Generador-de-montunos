import type { ChordConfig, GenerationResult, NoteEvent } from '../types';

interface ViewerActions {
  onBassNudge?: (index: number, direction: 1 | -1) => void;
  onOctaveShift?: (index: number, direction: 1 | -1) => void;
}

interface ViewerState {
  zoom: number;
  lastKey: string | null;
  isBusy: boolean;
}

interface RenderResult {
  render: (result?: GenerationResult, chords?: ChordConfig[]) => void;
  setBusy: (busy: boolean) => void;
}

function computeMidiHash(data: Uint8Array): number {
  let hash = 0;
  for (let index = 0; index < data.length; index += 1) {
    hash = (hash + (data[index] + 31) * (index + 1)) % 1000000007;
  }
  return hash;
}

function buildSignature(result?: GenerationResult): string | null {
  if (!result) {
    return null;
  }
  const { midiData, maxEighths, bpm } = result;
  const hash = computeMidiHash(midiData);
  return `${midiData.length}-${maxEighths}-${bpm}-${hash}`;
}

function getNoteBounds(events: NoteEvent[]): { min: number; max: number } {
  if (events.length === 0) {
    return { min: 60, max: 72 };
  }
  let min = events[0].midi;
  let max = events[0].midi;
  events.forEach((event) => {
    min = Math.min(min, event.midi);
    max = Math.max(max, event.midi);
  });
  return { min, max };
}

function formatBeat(value: number): string {
  return `${Number.parseFloat(value.toFixed(2))}`;
}

export function mountSignalViewer(container: HTMLElement, actions: ViewerActions = {}): RenderResult {
  const header = document.createElement('div');
  header.className = 'signal-viewer__toolbar';

  const title = document.createElement('div');
  title.className = 'signal-viewer__title';
  title.innerHTML = '<strong>Signal</strong> · Vista previa MIDI';
  header.appendChild(title);

  const zoomControls = document.createElement('div');
  zoomControls.className = 'signal-viewer__controls';
  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.className = 'btn btn--ghost signal-viewer__control';
  zoomOut.textContent = '−';
  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.className = 'btn btn--ghost signal-viewer__control';
  zoomIn.textContent = '+';
  zoomControls.append(zoomOut, zoomIn);
  header.appendChild(zoomControls);

  const meta = document.createElement('p');
  meta.className = 'signal-viewer__meta';
  meta.textContent = 'Genera un montuno para ver su forma MIDI al estilo Signal.';

  const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  surface.classList.add('signal-viewer__surface');
  surface.setAttribute('role', 'img');
  surface.setAttribute('aria-label', 'Vista previa del MIDI generado');

  const empty = document.createElement('div');
  empty.className = 'signal-viewer__empty';
  empty.innerHTML = '<p>Sin datos MIDI. Genera o reproduce un montuno para activar la vista.</p>';

  const wrapper = document.createElement('div');
  wrapper.className = 'signal-viewer__canvas';
  wrapper.append(surface, empty);

  const chordsPanel = document.createElement('div');
  chordsPanel.className = 'signal-viewer__chords';

  container.append(header, meta, wrapper, chordsPanel);

  const state: ViewerState = {
    zoom: 1,
    lastKey: null,
    isBusy: false,
  };
  let lastResult: GenerationResult | undefined;
  let lastChords: ChordConfig[] = [];

  function render(result?: GenerationResult, chords?: ChordConfig[]): void {
    const key = buildSignature(result);
    lastChords = chords ?? [];
    if (!result) {
      state.lastKey = null;
      lastResult = undefined;
      surface.replaceChildren();
      surface.setAttribute('width', '100%');
      surface.setAttribute('height', '120');
      empty.hidden = false;
      meta.textContent = 'Genera un montuno para visualizarlo al instante en el editor embebido.';
      chordsPanel.innerHTML = '';
      return;
    }

    if (state.lastKey === key && surface.childElementCount > 0) {
      meta.textContent = `BPM ${result.bpm} · ${result.lengthBars} compases · ${result.modoTag}`;
      empty.hidden = true;
      renderChordControls();
      return;
    }

    empty.hidden = true;
    state.lastKey = key;
    lastResult = result;

    const events = result.events;
    const { min, max } = getNoteBounds(events);
    const range = Math.max(1, max - min + 1);
    const beatsTotal = events.length ? Math.max(...events.map((event) => event.time + event.duration), 0) : 0;
    const pxPerBeat = 52 * state.zoom;
    const rowHeight = 12;
    const padding = 36;
    const height = range * rowHeight + padding;
    const width = beatsTotal * pxPerBeat + padding * 2;

    surface.setAttribute('viewBox', `0 0 ${width} ${height}`);
    surface.setAttribute('width', '100%');
    surface.setAttribute('height', String(Math.max(180, height)));
    surface.replaceChildren();

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('class', 'signal-viewer__background');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    surface.appendChild(background);

    for (let beat = 0; beat <= beatsTotal + 1; beat += 1) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(padding + beat * pxPerBeat));
      line.setAttribute('x2', String(padding + beat * pxPerBeat));
      line.setAttribute('y1', '12');
      line.setAttribute('y2', String(height - 12));
      line.setAttribute('class', beat % 4 === 0 ? 'signal-viewer__bar' : 'signal-viewer__beat');
      surface.appendChild(line);
    }

    const noteLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    noteLayer.setAttribute('class', 'signal-viewer__notes');
    events.forEach((event) => {
      const x = padding + event.time * pxPerBeat;
      const y = padding / 2 + (max - event.midi) * rowHeight;
      const widthPx = Math.max(event.duration * pxPerBeat, 4);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(widthPx));
      rect.setAttribute('height', String(rowHeight - 2));
      rect.setAttribute('rx', '3');
      rect.setAttribute('class', 'signal-viewer__note');
      rect.setAttribute('data-midi', String(event.midi));
      noteLayer.appendChild(rect);
    });
    surface.appendChild(noteLayer);

    const footer = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    footer.setAttribute('x', String(padding));
    footer.setAttribute('y', String(height - 10));
    footer.setAttribute('class', 'signal-viewer__footer');
    footer.textContent = `${result.lengthBars} compases · ${formatBeat(beatsTotal)} tiempos · ${result.claveTag}`;
    surface.appendChild(footer);

    meta.textContent = `BPM ${result.bpm} · ${result.lengthBars} compases · ${result.modoTag}`;

    renderChordControls();
  }

  function setBusy(busy: boolean): void {
    state.isBusy = busy;
    container.classList.toggle('signal-viewer--busy', busy);
    if (busy) {
      meta.textContent = 'Actualizando vista Signal…';
    }
  }

  zoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.5, state.zoom - 0.2);
    state.lastKey = null;
    render(lastResult, lastChords);
  });

  zoomIn.addEventListener('click', () => {
    state.zoom = Math.min(2.4, state.zoom + 0.2);
    state.lastKey = null;
    render(lastResult, lastChords);
  });

  return { render, setBusy };

  function renderChordControls(): void {
    chordsPanel.innerHTML = '';
    if (!lastChords.length) {
      const emptyState = document.createElement('p');
      emptyState.className = 'signal-viewer__chords-empty';
      emptyState.textContent = 'Agrega una progresión para ajustar la nota grave y la octavación por acorde.';
      chordsPanel.appendChild(emptyState);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'signal-viewer__chord-grid';
    grid.style.setProperty('--chord-count', String(lastChords.length));

    lastChords.forEach((chord) => {
      const card = document.createElement('div');
      card.className = 'signal-viewer__chord';

      const name = document.createElement('div');
      name.className = 'signal-viewer__chord-name';
      name.textContent = chord.name;

      const metaRow = document.createElement('div');
      metaRow.className = 'signal-viewer__chord-meta';
      metaRow.textContent = chord.octavacion;

      const actionsRow = document.createElement('div');
      actionsRow.className = 'signal-viewer__chord-actions';

      const bassGroup = document.createElement('div');
      bassGroup.className = 'signal-viewer__control-group';
      const bassLabel = document.createElement('span');
      bassLabel.className = 'signal-viewer__tag';
      bassLabel.textContent = 'Nota grave';
      const bassUp = createActionButton('↑', 'Subir nota grave', () => actions.onBassNudge?.(chord.index, 1));
      const bassDown = createActionButton('↓', 'Bajar nota grave', () => actions.onBassNudge?.(chord.index, -1));
      bassGroup.append(bassLabel, bassDown, bassUp);

      const octaveGroup = document.createElement('div');
      octaveGroup.className = 'signal-viewer__control-group';
      const octaveLabel = document.createElement('span');
      octaveLabel.className = 'signal-viewer__tag';
      octaveLabel.textContent = 'Octavación';
      const octaveDown = createActionButton('−', 'Octava abajo', () => actions.onOctaveShift?.(chord.index, -1));
      const octaveUp = createActionButton('+', 'Octava arriba', () => actions.onOctaveShift?.(chord.index, 1));
      octaveGroup.append(octaveLabel, octaveDown, octaveUp);

      actionsRow.append(bassGroup, octaveGroup);
      card.append(name, metaRow, actionsRow);
      grid.appendChild(card);
    });

    chordsPanel.appendChild(grid);
  }

  function createActionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'signal-viewer__mini-btn';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }
}
