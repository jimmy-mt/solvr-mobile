import { StyleSheet, Text, View } from 'react-native';

import type { PlayingCard } from './pokerTableTypes';

type PokerCardProps = {
  card: PlayingCard;
  rotate?: '-5deg' | '0deg' | '5deg';
};

const suitGlyph = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function PokerCard({ card, rotate = '0deg' }: PokerCardProps) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = red ? '#c41c1c' : '#1a0e35';

  return (
    <View style={[styles.card, { transform: [{ rotate }] }]}>
      <View style={styles.corner}>
        <Text style={[styles.rank, { color }]}>{card.rank}</Text>
      </View>
      <Text style={[styles.bigSuit, { color }]}>{suitGlyph[card.suit]}</Text>
    </View>
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
