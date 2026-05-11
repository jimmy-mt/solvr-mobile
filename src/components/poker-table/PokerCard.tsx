import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { PlayingCard } from './pokerTableTypes';

type PokerCardProps = {
  card: PlayingCard;
  cardIndex?: 0 | 1;
  animDelay?: number;
  dealKey?: number | string;
};

const suitGlyph = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const easing = Easing.bezier(0.22, 1, 0.36, 1);

export function PokerCard({ card, cardIndex = 0, animDelay = 0, dealKey }: PokerCardProps) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = red ? '#c41c1c' : '#1a0e35';

  // card1: -8→+1→0deg, card2: +8→-1→0deg
  const rotDir = cardIndex === 0 ? 1 : -1;

  const translateY = useRef(new Animated.Value(-60)).current;
  const rotateVal = useRef(new Animated.Value(-8 * rotDir)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateY.setValue(-60);
    rotateVal.setValue(-8 * rotDir);
    opacity.setValue(0);

    const phase1Duration = Math.round(0.32 * 0.6 * 1000); // 192ms
    const phase2Duration = Math.round(0.32 * 0.4 * 1000); // 128ms

    const anim = Animated.sequence([
      Animated.delay(animDelay),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 4, duration: phase1Duration, easing, useNativeDriver: true }),
        Animated.timing(rotateVal, { toValue: 1 * rotDir, duration: phase1Duration, easing, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: phase1Duration, easing, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: phase2Duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rotateVal, { toValue: 0, duration: phase2Duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]);

    anim.start();
    return () => anim.stop();
  }, [dealKey]);

  const rotate = rotateVal.interpolate({ inputRange: [-8, 8], outputRange: ['-8deg', '8deg'] });

  return (
    <Animated.View style={{ transform: [{ translateY }, { rotate }], opacity }}>
      <View style={styles.card}>
        <View style={styles.corner}>
          <Text style={[styles.rank, { color }]}>{card.rank}</Text>
        </View>
        <Text style={[styles.bigSuit, { color }]}>{suitGlyph[card.suit]}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 65,
    height: 89,
    borderRadius: 11,
    backgroundColor: '#fdfcff',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.46,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  corner: {
    position: 'absolute',
    top: 3,
    left: 8,
    alignItems: 'flex-start',
  },
  rank: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  bigSuit: {
    position: 'absolute',
    right: 6,
    bottom: -3,
    fontSize: 60,
    lineHeight: 51,
    fontFamily: 'Georgia',
  },
});
