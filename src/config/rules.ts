/**
 * Alle Regel- und Balancing-Werte an einer Stelle.
 * Änderungen hier wirken auf Host-Logik, Bots, Vorschau und Tests.
 */
export const RULES = {
  DICE: 5,
  MAX_ROLLS: 3,

  /**
   * Zählweise für 1 Paar, 2 Paar, Drei Gleiche, Vier Gleiche:
   * 'all'   = Summe aller 5 Würfel (wie auf dem Beispielblock)
   * 'combo' = nur die Würfel der Kombination (z. B. Paar aus Fünfen = 10)
   */
  PAIR_SCORING: 'all' as 'all' | 'combo',

  UPPER_BONUS_THRESHOLD: 63,
  UPPER_BONUS: 35,

  FULL_HOUSE: 25,
  SMALL_STRAIGHT: 30,
  LARGE_STRAIGHT: 40,
  FIVE_KIND: 50,

  /** 5 Gleiche darf auch als Volles Haus eingetragen werden. */
  FIVE_KIND_AS_FULL_HOUSE: true,
  /** Vier (oder fünf) Gleiche zählen auch als 2 Paar. */
  FOUR_KIND_AS_TWO_PAIRS: true,

  /** Spaltenanzahl je Modus. */
  COLUMNS: { classic: 1, marathon: 7 } as const,

  MAX_PLAYERS: 4,
  TURN_TIMERS: [0, 30, 45, 60] as const,
} as const;

export type ModuleId = 'reroll' | 'nudge' | 'freeze' | 'joker';

/** Energie-Kern und Module. */
export const ENERGY = {
  MAX: 100,
  /** Energie für gute Züge. */
  GAIN: {
    fiveKind: 40,
    largeStraight: 25,
    smallStraight: 10,
    fullHouse: 10,
    four: 10,
    upperStrong: 8, // Oberer Teil mit 4+ passenden Würfeln
    bonus: 30,
    columnDone: 15, // nur Marathon
    streak: 5, // je Zug ab Streak 3
  },
  MODULES: {
    reroll: { cost: 35, name: 'Re-Roll-Chip', icon: '⟳', desc: 'Ein zusätzlicher Wurf in diesem Zug.' },
    nudge: { cost: 30, name: 'Nudge', icon: '±', desc: 'Einen Würfel um +1 oder −1 verschieben.' },
    freeze: { cost: 20, name: 'Freeze', icon: '❄', desc: 'Einen Würfel sperren: Er bleibt den ganzen Zug liegen und startet auch deinen nächsten Zug mit diesem Wert.' },
    joker: { cost: 60, name: 'Joker', icon: '★', desc: 'Einen Würfel auf eine beliebige Augenzahl setzen.' },
  } satisfies Record<ModuleId, { cost: number; name: string; icon: string; desc: string }>,
  /** Maximale Einsätze je Modul und Spiel. */
  USES: {
    classic: { reroll: 2, nudge: 2, freeze: 2, joker: 1 },
    marathon: { reroll: 6, nudge: 6, freeze: 6, joker: 3 },
  } satisfies Record<'classic' | 'marathon', Record<ModuleId, number>>,
} as const;

/** XP und Level. */
export const PROGRESSION = {
  BASE_XP: 40,
  /** XP pro Punkt (Klassik). Marathon zählt pro Spalte gleich. */
  XP_PER_POINT: 0.25,
  WIN_XP_PER_OPPONENT: 40,
  ACHIEVEMENT_XP: 60,
  DAILY_XP: 150,
  xpForLevel: (level: number) => 120 + 70 * (level - 1),
};

export const MODULE_IDS: ModuleId[] = ['reroll', 'nudge', 'freeze', 'joker'];
