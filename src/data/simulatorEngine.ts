import type { PlayingCard, SeatPosition } from '../components/poker-table/pokerTableTypes';

export type SimSuit = 's' | 'h' | 'd' | 'c';
export type SimRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type SimCard = { rank: SimRank; suit: SimSuit };
export type SimAction = 'fold' | 'call' | 'raise' | 'jam';
export type SimFrequencies = [number, number, number, number];

export type SimLogEntry = {
  position: SeatPosition;
  action: SimAction;
  amount: number;
  potAfter: number;
  raiseLevel: number;
  frequencies?: SimFrequencies;
};

export type SimGameState = {
  handId: number;
  positions: SeatPosition[];
  hands: Record<SeatPosition, [SimCard, SimCard]>;
  stacks: Record<SeatPosition, number>;
  committed: Record<SeatPosition, number>;
  pot: number;
  currentBet: number;
  lastRaiseSize: number;
  raiseLevel: number;
  opener: SeatPosition | null;
  active: SeatPosition[];
  folded: SeatPosition[];
  playersToAct: SeatPosition[];
  actionLog: SimLogEntry[];
  phase: 'preflop' | 'preflop_complete';
};

export type ModelDecision = {
  action: SimAction;
  frequencies: SimFrequencies;
  roundedFrequencies: SimFrequencies;
  input: Float32Array;
};

export const SIM_POSITIONS: SeatPosition[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const SIM_ACTIONS: SimAction[] = ['fold', 'call', 'raise', 'jam'];

const RANKS: SimRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: SimSuit[] = ['s', 'h', 'd', 'c'];
const RAISE_SIZES: Record<string, number> = {
  'RFI:UTG': 2.5, 'RFI:HJ': 2.5, 'RFI:CO': 2.5, 'RFI:BTN': 2.5, 'RFI:SB': 3.0,
  'VO:HJ:UTG': 7.5, 'VO:CO:UTG': 7.5, 'VO:CO:HJ': 7.5,
  'VO:BTN:UTG': 7.5, 'VO:BTN:HJ': 7.5, 'VO:BTN:CO': 7.5,
  'VO:SB:UTG': 10.0, 'VO:SB:HJ': 10.0, 'VO:SB:CO': 10.0, 'VO:SB:BTN': 10.0,
  'VO:BB:UTG': 10.0, 'VO:BB:HJ': 10.0, 'VO:BB:CO': 10.0, 'VO:BB:BTN': 10.0, 'VO:BB:SB': 10.0,
  '3BET:UTG:UTG:HJ': 20.0, '3BET:UTG:UTG:CO': 20.0, '3BET:UTG:UTG:BTN': 20.0, '3BET:UTG:UTG:SB': 22.0, '3BET:UTG:UTG:BB': 23.0,
  '3BET:HJ:HJ:CO': 20.0, '3BET:HJ:HJ:BTN': 20.0, '3BET:HJ:HJ:SB': 22.0, '3BET:HJ:HJ:BB': 23.0,
  '3BET:CO:CO:BTN': 22.0, '3BET:CO:CO:SB': 22.0, '3BET:CO:CO:BB': 23.0,
  '3BET:BTN:UTG:HJ': 15.0, '3BET:BTN:UTG:CO': 15.0, '3BET:BTN:HJ:CO': 15.0, '3BET:BTN:BTN:SB': 22.0, '3BET:BTN:BTN:BB': 23.0,
  '3BET:SB:UTG:HJ': 20.0, '3BET:SB:UTG:CO': 20.0, '3BET:SB:UTG:BTN': 21.0, '3BET:SB:HJ:CO': 20.0, '3BET:SB:HJ:BTN': 21.0, '3BET:SB:CO:BTN': 21.0, '3BET:SB:SB:BB': 22.5,
  '3BET:BB:UTG:HJ': 20.0, '3BET:BB:UTG:CO': 20.0, '3BET:BB:UTG:BTN': 20.0, '3BET:BB:UTG:SB': 22.0,
  '3BET:BB:HJ:CO': 20.0, '3BET:BB:HJ:BTN': 20.0, '3BET:BB:HJ:SB': 22.0,
  '3BET:BB:CO:BTN': 21.0, '3BET:BB:CO:SB': 22.0, '3BET:BB:BTN:SB': 21.0,
  '3BET:CO:UTG:HJ': 15.0, '3BET:CO:UTG:CO': 15.0,
};

export function createSimulatorHand(handId: number): SimGameState {
  const deck = shuffleDeck();
  const hands = {} as Record<SeatPosition, [SimCard, SimCard]>;
  SIM_POSITIONS.forEach((position) => {
    hands[position] = [deck.pop() as SimCard, deck.pop() as SimCard];
  });

  const stacks = Object.fromEntries(SIM_POSITIONS.map((position) => [position, 100])) as Record<SeatPosition, number>;
  const committed = Object.fromEntries(SIM_POSITIONS.map((position) => [position, 0])) as Record<SeatPosition, number>;
  committed.SB = 0.5;
  committed.BB = 1;
  stacks.SB = 99.5;
  stacks.BB = 99;

  return {
    handId,
    positions: [...SIM_POSITIONS],
    hands,
    stacks,
    committed,
    pot: 1.5,
    currentBet: 1,
    lastRaiseSize: 1,
    raiseLevel: -1,
    opener: null,
    active: [...SIM_POSITIONS],
    folded: [],
    playersToAct: [...SIM_POSITIONS],
    actionLog: [],
    phase: 'preflop',
  };
}

export function applySimulatorAction(state: SimGameState, position: SeatPosition, action: SimAction, frequencies?: SimFrequencies) {
  if (!state.active.includes(position) || state.phase === 'preflop_complete') return state;
  const next = cloneState(state);
  const legalAction = normalizeAction(next, position, action);
  let amount = 0;

  if (legalAction === 'fold') {
    next.active = next.active.filter((pos) => pos !== position);
    if (!next.folded.includes(position)) next.folded.push(position);
    next.playersToAct = next.playersToAct.filter((pos) => pos !== position);
  } else if (legalAction === 'call') {
    amount = Math.min(next.stacks[position], Math.max(0, next.currentBet - next.committed[position]));
    next.committed[position] = roundBB(next.committed[position] + amount);
    next.stacks[position] = roundBB(next.stacks[position] - amount);
    next.pot = roundBB(next.pot + amount);
    next.playersToAct = next.playersToAct.filter((pos) => pos !== position);
  } else {
    const target = legalAction === 'jam'
      ? roundBB(next.committed[position] + next.stacks[position])
      : Math.min(roundBB(next.committed[position] + next.stacks[position]), getRaiseSize(next, position));
    const raiseTo = target > next.currentBet ? target : roundBB(next.committed[position] + next.stacks[position]);
    const added = Math.min(next.stacks[position], Math.max(0, raiseTo - next.committed[position]));
    amount = raiseTo;
    next.lastRaiseSize = roundBB(Math.max(0, raiseTo - next.currentBet));
    next.committed[position] = roundBB(next.committed[position] + added);
    next.stacks[position] = roundBB(next.stacks[position] - added);
    next.pot = roundBB(next.pot + added);
    next.currentBet = next.committed[position];
    next.raiseLevel += 1;
    if (!next.opener) next.opener = position;
    next.playersToAct = actionOrderAfter(next, position).filter((pos) => next.stacks[pos] > 0);
  }

  next.actionLog = [
    ...next.actionLog,
    {
      position,
      action: legalAction,
      amount: roundBB(amount),
      potAfter: roundBB(next.pot),
      raiseLevel: next.raiseLevel,
      frequencies,
    },
  ];

  if (next.playersToAct.length === 0 || next.active.length <= 1) {
    next.playersToAct = [];
    next.phase = 'preflop_complete';
  }

  return next;
}

export function buildSimulatorInputVector(state: SimGameState, position: SeatPosition) {
  const vec = new Float32Array(48);

  SIM_POSITIONS.forEach((seat, index) => {
    const base = index * 7;
    const isHero = seat === position ? 1 : 0;
    const lastAction = [...state.actionLog].reverse().find((entry) => entry.position === seat)?.action ?? null;
    const folded = lastAction === 'fold' ? 1 : 0;
    const called = lastAction === 'call' ? 1 : 0;
    const raised = lastAction === 'raise' || lastAction === 'jam' ? 1 : 0;
    const hasActed = folded || called || raised ? 1 : 0;

    vec[base + 0] = isHero;
    vec[base + 1] = isHero ? 0 : hasActed;
    vec[base + 2] = folded;
    vec[base + 3] = called;
    vec[base + 4] = raised;
    vec[base + 5] = (state.committed[seat] || 0) / 10;
    vec[base + 6] = (state.stacks[seat] ?? 100) / 100;
  });

  const [card1, card2] = state.hands[position];
  const r1 = RANKS.indexOf(card1.rank);
  const r2 = RANKS.indexOf(card2.rank);
  vec[42] = (Math.max(r1, r2) + 2) / 14;
  vec[43] = (Math.min(r1, r2) + 2) / 14;
  vec[44] = card1.rank === card2.rank ? 0 : card1.suit === card2.suit ? 1 : 0;
  vec[45] = getRaiseSize(state, position) / 100;
  vec[46] = (state.stacks[position] ?? 100) / 100;
  vec[47] = state.playersToAct.filter((pos) => pos !== position).length / 5;

  return vec;
}

export function getRaiseSize(state: SimGameState, position: SeatPosition) {
  if (state.raiseLevel === -1) return RAISE_SIZES[`RFI:${position}`] ?? fallbackRaiseTo(state);
  if (state.raiseLevel === 0 && state.opener) {
    return RAISE_SIZES[`VO:${position}:${state.opener}`] ?? fallbackRaiseTo(state);
  }
  const aggressor = [...state.actionLog].reverse().find((entry) => entry.action === 'raise' || entry.action === 'jam')?.position;
  return state.opener && aggressor
    ? RAISE_SIZES[`3BET:${position}:${state.opener}:${aggressor}`] ?? fallbackRaiseTo(state)
    : fallbackRaiseTo(state);
}

export function roundFrequencies(raw: number[]): SimFrequencies {
  const freqs = normalizeFrequencies(raw);
  let redistributed = 0;
  for (let i = 0; i < freqs.length; i += 1) {
    if (freqs[i] < 0.1) {
      redistributed += freqs[i];
      freqs[i] = 0;
    }
  }
  const maxIdx = freqs.indexOf(Math.max(...freqs));
  freqs[maxIdx] += redistributed;
  return normalizeFrequencies(freqs);
}

export function sampleSimulatorAction(rounded: SimFrequencies): SimAction {
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < rounded.length; i += 1) {
    cumulative += rounded[i];
    if (roll < cumulative) return SIM_ACTIONS[i];
  }
  return SIM_ACTIONS[rounded.length - 1];
}

export function availableSimulatorActions(state: SimGameState, position: SeatPosition): SimAction[] {
  const toCall = Math.max(0, state.currentBet - state.committed[position]);
  const canRaise = state.stacks[position] > toCall && state.committed[position] + state.stacks[position] > state.currentBet;
  return [toCall > 0 ? 'fold' : null, 'call', canRaise ? 'raise' : null, canRaise ? 'jam' : null].filter(Boolean) as SimAction[];
}

export function simCardToPlayingCard(card: SimCard): PlayingCard {
  return {
    rank: card.rank,
    suit: card.suit === 's' ? 'spades' : card.suit === 'h' ? 'hearts' : card.suit === 'd' ? 'diamonds' : 'clubs',
  };
}

export function formatSimHand(cards: [SimCard, SimCard]) {
  return `${cards[0].rank}${cards[0].suit} ${cards[1].rank}${cards[1].suit}`;
}

function normalizeAction(state: SimGameState, position: SeatPosition, action: SimAction): SimAction {
  const legal = availableSimulatorActions(state, position);
  if (legal.includes(action)) return action;
  if (action === 'fold' && legal.includes('call')) return 'call';
  if ((action === 'raise' || action === 'jam') && legal.includes('call')) return 'call';
  return legal[0] ?? 'call';
}

function normalizeFrequencies(raw: number[]): SimFrequencies {
  const safe = [0, 1, 2, 3].map((index) => Math.max(0, Number(raw[index]) || 0)) as SimFrequencies;
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [1, 0, 0, 0];
  return safe.map((value) => value / total) as SimFrequencies;
}

function actionOrderAfter(state: SimGameState, position: SeatPosition) {
  const start = state.positions.indexOf(position);
  const ordered: SeatPosition[] = [];
  for (let offset = 1; offset < state.positions.length; offset += 1) {
    const pos = state.positions[(start + offset) % state.positions.length];
    if (pos !== position && state.active.includes(pos)) ordered.push(pos);
  }
  return ordered;
}

function fallbackRaiseTo(state: SimGameState) {
  return roundBB(state.currentBet + state.lastRaiseSize);
}

function shuffleDeck() {
  const deck = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cloneState(state: SimGameState): SimGameState {
  return {
    ...state,
    hands: { ...state.hands },
    stacks: { ...state.stacks },
    committed: { ...state.committed },
    active: [...state.active],
    folded: [...state.folded],
    playersToAct: [...state.playersToAct],
    actionLog: [...state.actionLog],
  };
}

function roundBB(value: number) {
  return Math.round(value * 100) / 100;
}
