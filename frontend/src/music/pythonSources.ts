import backendInit from '../../../backend/__init__.py?raw';
import backendUtils from '../../../backend/utils.py?raw';
import backendStyleUtils from '../../../backend/style_utils.py?raw';
import backendMidiCommon from '../../../backend/midi_common.py?raw';
import backendMidiUtils from '../../../backend/midi_utils.py?raw';
import backendSalsa from '../../../backend/salsa.py?raw';
import backendVoicings from '../../../backend/voicings.py?raw';
import montunoInit from '../../../backend/montuno_core/__init__.py?raw';
import montunoConfig from '../../../backend/montuno_core/config.py?raw';
import montunoGeneration from '../../../backend/montuno_core/generation.py?raw';
import prettyMidiStub from './pyodide_pretty_midi.py?raw';
import chordReplacements from '@shared/chord_replacements.json?raw';

export const PYTHON_SOURCES: Record<string, string> = {
  'backend/__init__.py': backendInit,
  'backend/utils.py': backendUtils,
  'backend/style_utils.py': backendStyleUtils,
  'backend/midi_common.py': backendMidiCommon,
  'backend/midi_utils.py': backendMidiUtils,
  'backend/salsa.py': backendSalsa,
  'backend/voicings.py': backendVoicings,
  'backend/montuno_core/__init__.py': montunoInit,
  'backend/montuno_core/config.py': montunoConfig,
  'backend/montuno_core/generation.py': montunoGeneration,
  'pretty_midi/__init__.py': prettyMidiStub,
};

export const PYTHON_DATA_FILES: Record<string, string> = {
  'shared/chord_replacements.json': chordReplacements,
};
