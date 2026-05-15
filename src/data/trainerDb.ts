import type { SQLiteDatabase } from 'expo-sqlite';

export type SpotTypeFilter = 'ANY' | 'RFI' | 'VO' | 'V3B' | 'V4B';
export type TrainerAction = 'Fold' | 'Call' | 'Raise' | 'All-in';

export type TrainerHandFrequencies = {
  fold_freq: number;
  call_freq: number;
  raise_freq: number;
  all_in_freq: number;
  hand_probability: number;
  possible: boolean;
  reach: number;
};

export type TrainerSpot = {
  layer: number;
  type: Exclude<SpotTypeFilter, 'ANY'>;
  hero: string;
  nodeId: number;
  raiseBB: number;
  facingBB: number;
  openerRaiseBB: number | null;
  threebetBB?: number;
  opener: string | null;
  threebetter: string | null;
  fourbetter: string | null;
};

export type TrainerDeal = {
  spot: TrainerSpot;
  hand: string;
  handFreq: TrainerHandFrequencies;
  hands: Record<string, TrainerHandFrequencies>;
};

type NodeRow = Record<string, string | number | null> & {
  id: number;
  layer: number;
  opener_sequence: string | null;
  hero_position: string;
  proposed_raise_bb: number;
};

type HandRow = {
  hand: string;
  freq_fold: number | null;
  freq_call: number | null;
  freq_raise: number | null;
  freq_all_in: number | null;
  hand_probability: number | null;
};

const layerByFilter: Record<Exclude<SpotTypeFilter, 'ANY'>, number> = {
  RFI: 0,
  VO: 1,
  V3B: 2,
  V4B: 3,
};

export function layersForFilter(filter: SpotTypeFilter) {
  if (filter === 'ANY') return [0, 1, 2, 3];
  return [layerByFilter[filter]];
}

export async function dealRandomTrainerHand(
  db: SQLiteDatabase,
  spotTypeFilter: SpotTypeFilter,
  heroPositions: string[] = [],
): Promise<TrainerDeal | null> {
  const nodeId = await getRandomNodeId(db, layersForFilter(spotTypeFilter), heroPositions);
  if (nodeId == null) return null;

  const loaded = await loadNodeById(db, nodeId);
  if (!loaded) return null;

  const hand = pickWeightedHand(loaded.hands);
  if (!hand) return null;

  return {
    spot: spotFromNode(loaded.node),
    hand,
    handFreq: loaded.hands[hand],
    hands: loaded.hands,
  };
}

export async function loadTrainerHand(
  db: SQLiteDatabase,
  nodeId: number,
  hand: string,
): Promise<TrainerDeal | null> {
  const loaded = await loadNodeById(db, nodeId);
  const handFreq = loaded?.hands[hand];
  if (!loaded || !handFreq) return null;

  return {
    spot: spotFromNode(loaded.node),
    hand,
    handFreq,
    hands: loaded.hands,
  };
}

async function getRandomNodeId(
  db: SQLiteDatabase,
  layers: number[],
  heroPositions: string[],
) {
  const layerPlaceholders = layers.map(() => '?').join(',');
  const params: Array<number | string> = [...layers];
  let sql = `SELECT id FROM nodes WHERE layer IN (${layerPlaceholders})`;

  if (heroPositions.length > 0) {
    const positionPlaceholders = heroPositions.map(() => '?').join(',');
    sql += ` AND hero_position IN (${positionPlaceholders})`;
    params.push(...heroPositions);
  }

  sql += ' ORDER BY RANDOM() LIMIT 1';

  const row = await db.getFirstAsync<{ id: number }>(sql, params);
  return row?.id ?? null;
}

async function loadNodeById(db: SQLiteDatabase, nodeId: number) {
  const node = await db.getFirstAsync<NodeRow>('SELECT * FROM nodes WHERE id = ?', [
    nodeId,
  ]);
  if (!node) return null;

  const rows = await db.getAllAsync<HandRow>(
    `SELECT hand, freq_fold, freq_call, freq_raise, freq_all_in, hand_probability
     FROM hands
     WHERE node_id = ?
     ORDER BY id`,
    [nodeId],
  );

  const hands: Record<string, TrainerHandFrequencies> = {};
  for (const row of rows) {
    const probability = row.hand_probability ?? 100;
    hands[row.hand] = {
      fold_freq: row.freq_fold ?? 0,
      call_freq: row.freq_call ?? 0,
      raise_freq: row.freq_raise ?? 0,
      all_in_freq: row.freq_all_in ?? 0,
      hand_probability: probability,
      possible: probability > 0,
      reach: probability,
    };
  }

  return { node, hands };
}

function pickWeightedHand(hands: Record<string, TrainerHandFrequencies>) {
  const entries = Object.entries(hands).filter(([, value]) => {
    return (value.hand_probability || 0) > 0;
  });
  const total = entries.reduce((sum, [, value]) => sum + value.hand_probability, 0);
  if (total <= 0) return null;

  let threshold = Math.random() * total;
  for (const [label, value] of entries) {
    threshold -= value.hand_probability;
    if (threshold <= 0) return label;
  }

  return entries[entries.length - 1]?.[0] ?? null;
}

function spotFromNode(node: NodeRow): TrainerSpot {
  const layer = Number(node.layer);
  const hero = String(node.hero_position);
  const sequence = typeof node.opener_sequence === 'string' ? node.opener_sequence : '';
  const spot: TrainerSpot = {
    layer,
    type: 'RFI',
    hero,
    nodeId: Number(node.id),
    raiseBB: Number(node.proposed_raise_bb || 0),
    facingBB: 0,
    openerRaiseBB: null,
    opener: null,
    threebetter: null,
    fourbetter: null,
  };

  if (layer === 0) return spot;

  const parts = sequence.split(', ');
  if (layer === 1) {
    const opener = parts[0];
    return {
      ...spot,
      type: 'VO',
      opener,
      facingBB: investedByPosition(node, opener),
    };
  }

  if (layer === 2) {
    const [opener, threebetter] = parts;
    return {
      ...spot,
      type: 'V3B',
      opener,
      threebetter,
      openerRaiseBB: investedByPosition(node, opener),
      facingBB: investedByPosition(node, threebetter),
    };
  }

  const [opener, threebetter, fourbetter] = parts;
  return {
    ...spot,
    type: 'V4B',
    opener,
    threebetter,
    fourbetter,
    openerRaiseBB: investedByPosition(node, opener),
    threebetBB: investedByPosition(node, threebetter),
    facingBB: investedByPosition(node, fourbetter),
  };
}

function investedByPosition(node: NodeRow, position?: string | null) {
  if (!position) return 0;
  const key = `${position.toLowerCase()}_invested_bb`;
  return Number(node[key] || 0);
}

export function getActionFrequency(
  action: TrainerAction,
  handFreq: TrainerHandFrequencies,
) {
  if (action === 'Fold') return handFreq.fold_freq;
  if (action === 'Call') return handFreq.call_freq;
  if (action === 'Raise') return handFreq.raise_freq;
  return handFreq.all_in_freq;
}

export function availableActionsForSpot(
  hands: Record<string, TrainerHandFrequencies>,
): TrainerAction[] {
  const handValues = Object.values(hands);
  const hasCallOption = handValues.some((hand) => (hand.call_freq || 0) > 0);
  const hasAllInOption = handValues.some((hand) => (hand.all_in_freq || 0) > 0);

  return [
    'Fold',
    ...(hasCallOption ? (['Call'] as TrainerAction[]) : []),
    'Raise',
    ...(hasAllInOption ? (['All-in'] as TrainerAction[]) : []),
  ];
}

export function bestAction(handFreq: TrainerHandFrequencies): TrainerAction {
  const actions: TrainerAction[] = ['Fold', 'Call', 'Raise', 'All-in'];
  return actions.reduce((best, action) => {
    return getActionFrequency(action, handFreq) > getActionFrequency(best, handFreq)
      ? action
      : best;
  }, 'Fold');
}

export function computeSolvrScore(
  action: TrainerAction,
  handFreq: TrainerHandFrequencies,
) {
  const strategy = {
    fold: handFreq.fold_freq,
    call: handFreq.call_freq,
    raise: handFreq.raise_freq,
    all_in: handFreq.all_in_freq,
  };
  const actionKey = action === 'All-in' ? 'all_in' : (action.toLowerCase() as keyof typeof strategy);
  const chosenFreq = strategy[actionKey] ?? 0;
  if (chosenFreq === 0) return 0;
  const dominantFreq = Math.max(...Object.values(strategy));
  const deviation = Math.max(0, dominantFreq - chosenFreq);
  return Math.max(0, Math.min(1, 1 - Math.pow(deviation / 100, 4)));
}

export function scenarioLabel(spot: TrainerSpot) {
  if (spot.type === 'RFI') return `${spot.hero} RFI - ${formatBB(spot.raiseBB)}`;
  if (spot.type === 'VO') {
    return `${spot.hero} vs ${spot.opener} ${formatBB(spot.facingBB)} open`;
  }
  if (spot.type === 'V3B') {
    return `${spot.hero} vs ${spot.opener} ${formatBB(spot.openerRaiseBB)} open - ${spot.threebetter} ${formatBB(spot.facingBB)} 3-bet`;
  }
  return `${spot.hero} vs ${spot.opener} ${formatBB(spot.openerRaiseBB)} open - ${spot.threebetter} ${formatBB(spot.threebetBB)} 3-bet - ${spot.fourbetter} ${formatBB(spot.facingBB)} 4-bet`;
}

export function formatBB(value?: number | null) {
  const number = Number(value || 0);
  return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}bb`;
}
