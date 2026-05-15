import type { TrainerSpot } from '../../data/trainerDb';
import type { PlayingCard, PokerTableProps, SeatPosition } from './pokerTableTypes';

const seats: SeatPosition[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const blindAmounts: Partial<Record<SeatPosition, number>> = { SB: 0.5, BB: 1 };

export function pokerTablePropsFromSpot(spot: TrainerSpot, hand: string): PokerTableProps {
  const raiseAmounts: Partial<Record<SeatPosition, number>> = {};
  const foldedPositions = foldedPositionsForSpot(spot);

  if (spot.type === 'VO' && spot.opener) {
    raiseAmounts[asSeat(spot.opener)] = spot.facingBB;
  }

  if (spot.type === 'V3B' && spot.opener && spot.threebetter) {
    raiseAmounts[asSeat(spot.opener)] = spot.openerRaiseBB || 0;
    raiseAmounts[asSeat(spot.threebetter)] = spot.facingBB;
  }

  if (spot.type === 'V4B' && spot.opener && spot.threebetter && spot.fourbetter) {
    raiseAmounts[asSeat(spot.opener)] = spot.openerRaiseBB || 0;
    raiseAmounts[asSeat(spot.threebetter)] = spot.threebetBB || 0;
    raiseAmounts[asSeat(spot.fourbetter)] = spot.facingBB;
  }

  const filteredBlinds = Object.fromEntries(
    Object.entries(blindAmounts).filter(([seat]) => raiseAmounts[asSeat(seat)] == null),
  ) as Partial<Record<SeatPosition, number>>;
  return {
    heroPos: asSeat(spot.hero),
    openerPos: spot.opener ? asSeat(spot.opener) : null,
    foldedPositions,
    raiseAmounts,
    blindAmounts: filteredBlinds,
    cards: cardsForHandClass(hand),
  };
}

function foldedPositionsForSpot(spot: TrainerSpot) {
  const heroIndex = seats.indexOf(asSeat(spot.hero));
  const active = new Set<SeatPosition>([asSeat(spot.hero)]);
  if (spot.opener) active.add(asSeat(spot.opener));
  if (spot.threebetter) active.add(asSeat(spot.threebetter));
  if (spot.fourbetter) active.add(asSeat(spot.fourbetter));

  return seats.filter((seat, index) => {
    if (active.has(seat)) return false;
    if (spot.type === 'RFI') return index < heroIndex;
    if (spot.type === 'VO') return actedBetween(spot.opener, spot.hero, seat);
    return true;
  });
}

function actedBetween(from: string | null, to: string, seat: SeatPosition) {
  if (!from) return false;
  const fromIndex = seats.indexOf(asSeat(from));
  const toIndex = seats.indexOf(asSeat(to));
  const seatIndex = seats.indexOf(seat);
  if (fromIndex < 0 || toIndex < 0 || seatIndex < 0) return false;

  if (fromIndex < toIndex) {
    return seatIndex > fromIndex && seatIndex < toIndex;
  }

  return seatIndex > fromIndex || seatIndex < toIndex;
}

function cardsForHandClass(hand: string): [PlayingCard, PlayingCard] {
  const first = hand[0];
  const second = hand[1];
  const suitedness = hand[2];

  if (first === second) {
    return [
      { rank: first, suit: 'spades' },
      { rank: second, suit: 'hearts' },
    ];
  }

  if (suitedness === 's') {
    return [
      { rank: first, suit: 'spades' },
      { rank: second, suit: 'spades' },
    ];
  }

  return [
    { rank: first, suit: 'spades' },
    { rank: second, suit: 'hearts' },
  ];
}

function asSeat(value: string): SeatPosition {
  if (seats.includes(value as SeatPosition)) return value as SeatPosition;
  throw new Error(`Unknown seat: ${value}`);
}
