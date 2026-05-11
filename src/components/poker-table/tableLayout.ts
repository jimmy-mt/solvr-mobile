import type { SeatPosition } from './pokerTableTypes';

export const TABLE_ORDER: SeatPosition[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const TABLE_ASPECT_RATIO = 330 / 550;

export const TABLE_SEAT_POSITIONS = {
  top: [50, 10],
  rightBottom: [85, 58],
  rightTop: [78.5, 32],
  leftBottom: [15, 58],
  leftTop: [21.5, 32],
  hero: [50, 88],
} as const;

export function getSeatsRelativeToHero(heroPos: SeatPosition) {
  const heroIndex = TABLE_ORDER.indexOf(heroPos);
  const others = Array.from(
    { length: 5 },
    (_, index) => TABLE_ORDER[(heroIndex + 1 + index) % TABLE_ORDER.length],
  );

  return {
    topSeat: others[2],
    rightSeats: [others[4], others[3]] as const,
    leftSeats: [others[0], others[1]] as const,
  };
}

export function fmtBB(value?: number | null) {
  const number = Number(value || 0);
  return `${Math.round(number * 100) / 100}bb`;
}
