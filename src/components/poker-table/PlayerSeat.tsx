import { StyleSheet, Text, View } from 'react-native';

import { C } from '../../constants/colors';
import { fmtBB } from './tableLayout';
import type { SeatPosition } from './pokerTableTypes';

type PlayerSeatProps = {
  seat: SeatPosition;
  position: readonly [number, number];
  heroPos: SeatPosition;
  openerPos?: SeatPosition | null;
  folded: boolean;
  raisedBB?: number;
  blindBB?: number;
  stackBB?: number;
};

export function PlayerSeat({
  seat,
  position,
  heroPos,
  openerPos,
  folded,
  raisedBB,
  blindBB,
  stackBB,
}: PlayerSeatProps) {
  const isHero = seat === heroPos;
  const isOpener = seat === openerPos;
  const showRaiseBadge = raisedBB != null || blindBB != null;
  const committedBB = raisedBB ?? blindBB;
  const isBlindCommit = blindBB != null && raisedBB == null;
  const isRaised = raisedBB != null;
  const isRaisedFolded = folded && isRaised;
  const isActionSeat = !folded && (isOpener || isRaised);
  const size = isHero ? 84 : 54;
  const badgeBelow = position[1] <= 12;
  const stackOnLeft = position[0] > 60;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: `${position[0]}%`,
          top: `${position[1]}%`,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        isHero && styles.hero,
        isActionSeat && styles.actionSeat,
        isRaisedFolded && styles.raisedFolded,
        folded && !isRaisedFolded && !isHero && styles.folded,
      ]}
    >
      {showRaiseBadge && (
        <View
          style={[
            styles.commitBadge,
            badgeBelow ? styles.commitBadgeBelow : styles.commitBadgeAbove,
            styles.commitBadgeCentered,
            !isBlindCommit && !isRaisedFolded && styles.raiseBadge,
            (isBlindCommit || isRaisedFolded) && styles.blindBadge,
          ]}
        >
          <Text
            style={[
              styles.commitText,
              !isBlindCommit && !isRaisedFolded && styles.raiseText,
              (isBlindCommit || isRaisedFolded) && styles.blindText,
            ]}
          >
            {fmtBB(committedBB)}
          </Text>
        </View>
      )}

      {stackBB != null && (
        <View
          style={[
            styles.stackBadge,
            stackOnLeft ? styles.stackBadgeLeft : styles.stackBadgeRight,
          ]}
        >
          <Text style={styles.stackText}>{fmtBB(stackBB)}</Text>
        </View>
      )}

      {seat === 'UTG' && <UTGArrow position={position} />}

      <Text
        style={[
          styles.label,
          isHero && styles.heroLabel,
          isActionSeat && styles.actionLabel,
          isRaisedFolded && styles.raisedFoldedLabel,
          folded && !isRaisedFolded && !isHero && styles.foldedLabel,
          isHero && styles.heroLabelSize,
        ]}
      >
        {seat}
      </Text>
    </View>
  );
}

function UTGArrow({ position }: { position: readonly [number, number] }) {
  const arrowStyle =
    position[1] >= 78
      ? styles.arrowHeroBottom
      : position[1] <= 16
        ? styles.arrowTop
        : position[0] > 60
          ? styles.arrowRight
          : styles.arrowLeft;

  return <View style={[styles.arrow, arrowStyle]} />;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  hero: {
    backgroundColor: 'rgba(124,58,237,0.65)',
    borderWidth: 2,
    borderColor: C.purple,
    shadowColor: C.purple,
    shadowOpacity: 0.48,
    shadowRadius: 10,
  },
  actionSeat: {
    backgroundColor: 'rgba(245,158,11,0.45)',
    borderWidth: 2,
    borderColor: C.gold,
  },
  raisedFolded: {
    backgroundColor: 'rgba(253,224,71,0.13)',
    borderColor: 'rgba(253,224,71,0.38)',
  },
  folded: {
    backgroundColor: 'rgba(148,163,184,0.16)',
    borderColor: 'rgba(148,163,184,0.24)',
  },
  label: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 16,
    fontWeight: '800',
  },
  heroLabel: {
    color: 'white',
  },
  heroLabelSize: {
    fontSize: 20,
  },
  actionLabel: {
    color: '#fde68a',
  },
  raisedFoldedLabel: {
    color: '#fef3c7',
  },
  foldedLabel: {
    color: 'rgba(203,213,225,0.58)',
  },
  commitBadge: {
    position: 'absolute',
    left: '50%',
    width: 54,
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: 'center',
  },
  commitBadgeCentered: {
    transform: [{ translateX: -27 }],
  },
  commitBadgeAbove: {
    bottom: '100%',
    marginBottom: 5,
  },
  commitBadgeBelow: {
    top: '100%',
    marginTop: 5,
  },
  raiseBadge: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.82)',
  },
  blindBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  commitText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 13,
  },
  raiseText: {
    color: '#fde68a',
  },
  blindText: {
    color: 'rgba(255,255,255,0.50)',
  },
  stackBadge: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  stackBadgeLeft: {
    right: '100%',
    marginRight: 7,
  },
  stackBadgeRight: {
    left: '100%',
    marginLeft: 7,
  },
  stackText: {
    color: 'rgba(237,233,255,0.82)',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 11,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(168,85,247,0.96)',
  },
  arrowHeroBottom: {
    left: '100%',
    top: '100%',
    marginLeft: 0,
    marginTop: -6,
    transform: [{ rotate: '225deg' }],
  },
  arrowTop: {
    right: '100%',
    bottom: '100%',
    marginRight: -2,
    marginBottom: -8,
    transform: [{ rotate: '45deg' }],
  },
  arrowRight: {
    left: '100%',
    top: '50%',
    marginLeft: 9,
    marginTop: -9,
    transform: [{ rotate: '180deg' }],
  },
  arrowLeft: {
    right: '100%',
    top: '50%',
    marginRight: 9,
    marginTop: -9,
  },
});
