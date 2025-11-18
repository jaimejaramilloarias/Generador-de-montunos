export const DEFAULT_APPROACH_NOTES = ['D', 'F', 'A', 'B'] as const;

export function deriveApproachNotes(): string[] {
  return [...DEFAULT_APPROACH_NOTES];
}
