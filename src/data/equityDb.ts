import { importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export type CardRank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type CardSuit = 's' | 'h' | 'd' | 'c';

export type EquityCard = {
  rank: CardRank;
  suit: CardSuit;
};

export type EquityLookupResult = {
  key: string;
  hand1: string;
  hand2: string;
  player1Win: number;
  player1Lose: number;
  player2Win: number;
  player2Lose: number;
  tie: number;
  sims: number;
};

type EquityRow = {
  key: string;
  hand1: string;
  hand2: string;
  win1: number;
  win2: number;
  tie: number;
  sims: number;
};

const rankValue: Record<CardRank, number> = {
  A: 12,
  K: 11,
  Q: 10,
  J: 9,
  T: 8,
  '9': 7,
  '8': 6,
  '7': 5,
  '6': 4,
  '5': 3,
  '4': 2,
  '3': 1,
  '2': 0,
};

const canonicalSuits: CardSuit[] = ['s', 'h', 'd', 'c'];
let equityDbPromise: Promise<SQLiteDatabase> | null = null;
let imported = false;

async function getEquityDb() {
  if (!imported) {
    await importDatabaseFromAssetAsync('equity_table.db', {
      assetId: require('../../assets/equity_table.db'),
    });
    imported = true;
  }
  if (!equityDbPromise) {
    equityDbPromise = openDatabaseAsync('equity_table.db');
  }
  return equityDbPromise;
}

export async function lookupEquity(player1: [EquityCard, EquityCard], player2: [EquityCard, EquityCard]) {
  const variants = canonicalizeMatchupVariants(player1, player2);
  const db = await getEquityDb();
  const placeholders = variants.map(() => '?').join(',');
  const row = await db.getFirstAsync<EquityRow>(
    `SELECT key, hand1, hand2, win1, win2, tie, sims FROM equity WHERE key IN (${placeholders}) LIMIT 1`,
    variants.map((variant) => variant.key),
  );
  if (!row) return null;
  const matched = variants.find((variant) => variant.key === row.key);
  if (!matched) return null;

  const player1IsHand1 = row.hand1 === matched.player1Hand || matched.player1IsHand1;
  const player1Win = player1IsHand1 ? row.win1 : row.win2;
  const player2Win = player1IsHand1 ? row.win2 : row.win1;
  return {
    key: row.key,
    hand1: row.hand1,
    hand2: row.hand2,
    player1Win,
    player1Lose: player2Win,
    player2Win,
    player2Lose: player1Win,
    tie: row.tie,
    sims: row.sims,
  };
}

export function canonicalizeMatchup(player1: [EquityCard, EquityCard], player2: [EquityCard, EquityCard]) {
  return canonicalizeMatchupVariants(player1, player2)[0];
}

export function canonicalizeMatchupVariants(player1: [EquityCard, EquityCard], player2: [EquityCard, EquityCard]) {
  const sorted1 = sortHand(player1);
  const sorted2 = sortHand(player2);
  const variants = new Map<string, { key: string; player1Hand: string; player2Hand: string; player1IsHand1: boolean }>();

  function addVariant(player1Hand: string, player2Hand: string) {
    const forwardKey = `${player1Hand}|${player2Hand}`;
    if (!variants.has(forwardKey)) {
      variants.set(forwardKey, { key: forwardKey, player1Hand, player2Hand, player1IsHand1: true });
    }

    const reverseKey = `${player2Hand}|${player1Hand}`;
    if (!variants.has(reverseKey)) {
      variants.set(reverseKey, { key: reverseKey, player1Hand, player2Hand, player1IsHand1: false });
    }
  }

  for (const permutation of suitPermutations(canonicalSuits)) {
    const suitMap = new Map<CardSuit, CardSuit>();
    canonicalSuits.forEach((sourceSuit, index) => {
      suitMap.set(sourceSuit, permutation[index]);
    });
    const remap = (card: EquityCard) => `${card.rank}${suitMap.get(card.suit)}`;
    const player1Hand = `${remap(sorted1[0])}${remap(sorted1[1])}`;
    const player2Hand = `${remap(sorted2[0])}${remap(sorted2[1])}`;
    addVariant(player1Hand, player2Hand);
  }

  for (const player1Hand of independentHandForms(sorted1)) {
    for (const player2Hand of independentHandForms(sorted2)) {
      addVariant(player1Hand, player2Hand);
    }
  }

  return Array.from(variants.values());
}

export function cardToString(card: EquityCard) {
  return `${card.rank}${card.suit}`;
}

function sortHand(cards: [EquityCard, EquityCard]) {
  return [...cards].sort((a, b) => rankValue[b.rank] - rankValue[a.rank]) as [EquityCard, EquityCard];
}

function suitPermutations(suits: CardSuit[]): CardSuit[][] {
  if (suits.length <= 1) return [suits];
  return suits.flatMap((suit, index) => {
    const rest = [...suits.slice(0, index), ...suits.slice(index + 1)];
    return suitPermutations(rest).map((permutation) => [suit, ...permutation]);
  });
}

function independentHandForms(cards: [EquityCard, EquityCard]) {
  const forms = new Set<string>();
  for (const permutation of suitPermutations(canonicalSuits)) {
    const suitMap = new Map<CardSuit, CardSuit>();
    canonicalSuits.forEach((sourceSuit, index) => {
      suitMap.set(sourceSuit, permutation[index]);
    });
    const remapped = sortHand(cards.map((card) => ({
      rank: card.rank,
      suit: suitMap.get(card.suit) ?? card.suit,
    })) as [EquityCard, EquityCard]);
    forms.add(`${remapped[0].rank}${remapped[0].suit}${remapped[1].rank}${remapped[1].suit}`);
  }
  return Array.from(forms);
}
