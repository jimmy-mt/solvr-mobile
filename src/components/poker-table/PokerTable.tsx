import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  FeDropShadow,
  Filter,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { C } from '../../constants/colors';
import { PlayerSeat } from './PlayerSeat';
import { PokerCard } from './PokerCard';
import {
  fmtBB,
  getSeatsRelativeToHero,
  TABLE_ASPECT_RATIO,
  TABLE_ORDER,
  TABLE_SEAT_POSITIONS,
} from './tableLayout';
import type { PokerTableProps } from './pokerTableTypes';

const TABLE_PATH =
  'M 80 100 C 109.5 -97, 390.5 -97, 420 100 C 446.6 278, 453.4 322, 480 500 C 520 767, -20 767, 20 500 C 46.6 322, 53.4 278, 80 100 Z';

export function PokerTable({
  heroPos,
  openerPos,
  cards,
  foldedPositions = [],
  raiseAmounts = {},
  blindAmounts = {},
  stackAmounts = {},
  theme = 'green',
}: PokerTableProps) {
  const tableColors =
    theme === 'blue'
      ? { feltCenter: '#2563eb', feltEdge: '#0f3f8a', rim: '#081a2f', rail: '#1d4ed8' }
      : { feltCenter: '#2e7d35', feltEdge: '#174f1e', rim: '#0d2412', rail: '#1a5c24' };
  const foldedSet = new Set(foldedPositions);
  const { topSeat, rightSeats, leftSeats } = getSeatsRelativeToHero(heroPos);
  const committedBySeat = { ...blindAmounts, ...raiseAmounts };
  const potBB = TABLE_ORDER.reduce((sum, seat) => sum + Number(committedBySeat[seat] || 0), 0);

  return (
    <View style={styles.outer}>
      <View style={styles.tableFrame}>
        <Svg
          viewBox="-50 -150 600 1000"
          preserveAspectRatio="xMidYMid meet"
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <RadialGradient id="feltGrad" cx="50%" cy="54%" r="56%">
              <Stop offset="0%" stopColor={tableColors.feltCenter} />
              <Stop offset="100%" stopColor={tableColors.feltEdge} />
            </RadialGradient>
            <Filter id="tableShadow" x="-20%" y="-15%" width="140%" height="135%">
              <FeDropShadow dx="0" dy="12" stdDeviation="24" floodColor="rgba(0,0,0,0.9)" />
            </Filter>
          </Defs>

          <Path d={TABLE_PATH} fill={tableColors.rim} stroke={tableColors.rim} strokeWidth={2} filter="url(#tableShadow)" />
          <Path d={TABLE_PATH} fill={tableColors.rim} stroke={tableColors.rim} strokeWidth={60} strokeLinejoin="round" />
          <Path d={TABLE_PATH} fill={tableColors.rail} stroke={tableColors.rail} strokeWidth={44} strokeLinejoin="round" />
          <Path d={TABLE_PATH} fill="url(#feltGrad)" />
        </Svg>

        <PlayerSeat seat={topSeat} position={TABLE_SEAT_POSITIONS.top} heroPos={heroPos} openerPos={openerPos} folded={foldedSet.has(topSeat)} raisedBB={raiseAmounts[topSeat]} blindBB={blindAmounts[topSeat]} stackBB={stackAmounts[topSeat]} />
        <PlayerSeat seat={rightSeats[0]} position={TABLE_SEAT_POSITIONS.rightBottom} heroPos={heroPos} openerPos={openerPos} folded={foldedSet.has(rightSeats[0])} raisedBB={raiseAmounts[rightSeats[0]]} blindBB={blindAmounts[rightSeats[0]]} stackBB={stackAmounts[rightSeats[0]]} />
        <PlayerSeat seat={rightSeats[1]} position={TABLE_SEAT_POSITIONS.rightTop} heroPos={heroPos} openerPos={openerPos} folded={foldedSet.has(rightSeats[1])} raisedBB={raiseAmounts[rightSeats[1]]} blindBB={blindAmounts[rightSeats[1]]} stackBB={stackAmounts[rightSeats[1]]} />
        <PlayerSeat seat={leftSeats[0]} position={TABLE_SEAT_POSITIONS.leftBottom} heroPos={heroPos} openerPos={openerPos} folded={foldedSet.has(leftSeats[0])} raisedBB={raiseAmounts[leftSeats[0]]} blindBB={blindAmounts[leftSeats[0]]} stackBB={stackAmounts[leftSeats[0]]} />
        <PlayerSeat seat={leftSeats[1]} position={TABLE_SEAT_POSITIONS.leftTop} heroPos={heroPos} openerPos={openerPos} folded={foldedSet.has(leftSeats[1])} raisedBB={raiseAmounts[leftSeats[1]]} blindBB={blindAmounts[leftSeats[1]]} stackBB={stackAmounts[leftSeats[1]]} />
        <PlayerSeat seat={heroPos} position={TABLE_SEAT_POSITIONS.hero} heroPos={heroPos} openerPos={openerPos} folded={false} raisedBB={raiseAmounts[heroPos]} blindBB={blindAmounts[heroPos]} stackBB={stackAmounts[heroPos]} />

        <View pointerEvents="none" style={styles.potBadge}>
          <Text style={styles.potText}>Pot {fmtBB(potBB)}</Text>
        </View>

        {cards && (
          <View pointerEvents="none" style={styles.cardRow}>
            <PokerCard card={cards[0]} />
            <PokerCard card={cards[1]} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    marginBottom: 14,
  },
  tableFrame: {
    width: '100%',
    maxWidth: 330,
    aspectRatio: TABLE_ASPECT_RATIO,
    position: 'relative',
    overflow: 'visible',
  },
  potBadge: {
    position: 'absolute',
    left: '50%',
    top: '43%',
    transform: [{ translateX: -49 }, { translateY: -15 }],
    width: 98,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    zIndex: 2,
  },
  potText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 16,
  },
  cardRow: {
    position: 'absolute',
    left: '50%',
    top: '88%',
    transform: [{ translateX: -69 }, { translateY: -168 }],
    width: 138,
    flexDirection: 'row',
    gap: 8,
    zIndex: 5,
  },
});
