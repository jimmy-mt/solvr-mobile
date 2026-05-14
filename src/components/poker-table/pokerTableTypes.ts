export type SeatPosition = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export type PlayingCard = {
  rank: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
};

export type PokerTableProps = {
  heroPos: SeatPosition;
  openerPos?: SeatPosition | null;
  foldedPositions?: SeatPosition[];
  raiseAmounts?: Partial<Record<SeatPosition, number>>;
  blindAmounts?: Partial<Record<SeatPosition, number>>;
  cards?: [PlayingCard, PlayingCard] | null;
  theme?: 'green' | 'blue';
  dealKey?: number | string;
};
