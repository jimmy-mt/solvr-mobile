import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../../constants/colors';
import type { TrainerHandFrequencies } from '../../data/trainerDb';

const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function handLabel(rowRank: string, colRank: string, ri: number, ci: number) {
  if (ri === ci) return rowRank + colRank;
  if (ri < ci) return rowRank + colRank + 's';
  return colRank + rowRank + 'o';
}

export function RangeGrid({
  hands,
  highlightHand,
  selectedHand,
  onCellPress,
}: {
  hands: Record<string, TrainerHandFrequencies>;
  highlightHand?: string;
  selectedHand?: string | null;
  onCellPress?: (hand: string) => void;
}) {
  return (
    <View style={styles.rangeGrid}>
      {ranks.map((rowRank, ri) => (
        <View key={rowRank} style={styles.rangeRow}>
          {ranks.map((colRank, ci) => {
            const label = handLabel(rowRank, colRank, ri, ci);
            const freq = hands[label];
            const highlighted = label === highlightHand;
            const selected = label === selectedHand;
            const segments =
              freq && freq.possible
                ? [
                    { freq: freq.all_in_freq || 0, color: C.allIn },
                    { freq: freq.raise_freq || 0, color: C.red },
                    { freq: freq.call_freq || 0, color: C.green },
                    { freq: freq.fold_freq || 0, color: C.blue },
                  ].filter((s) => s.freq > 0)
                : [];
            const total = segments.reduce((sum, s) => sum + s.freq, 0);
            const prob = freq?.hand_probability ?? 0;
            const emptyFrac = 1 - prob / 100;

            const inner = (
              <View
                style={[
                  styles.rangeCell,
                  highlighted && styles.rangeCellActive,
                  selected && styles.rangeCellSelected,
                ]}
              >
                <View style={styles.rangeCellSegments}>
                  {segments.length > 0 ? (
                    <View style={{ flex: 1, flexDirection: 'column' }}>
                      {emptyFrac > 0 && (
                        <View style={{ flex: emptyFrac, backgroundColor: '#100c2f' }} />
                      )}
                      <View style={{ flex: prob / 100, flexDirection: 'row' }}>
                        {segments.map((s, i) => (
                          <View
                            key={i}
                            style={{
                              width: `${(s.freq / total) * 100}%`,
                              backgroundColor: s.color,
                              height: '100%',
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={{ flex: 1, backgroundColor: '#100c2f', height: '100%' }} />
                  )}
                </View>
                <View style={styles.rangeCellTextWrapper}>
                  <Text style={[styles.rangeCellText, highlighted && styles.rangeCellTextActive]}>
                    {label}
                  </Text>
                </View>
              </View>
            );

            if (onCellPress) {
              return (
                <Pressable key={label} style={styles.rangeCellOuter} onPress={() => onCellPress(label)}>
                  {inner}
                </Pressable>
              );
            }
            return (
              <View key={label} style={styles.rangeCellOuter}>
                {inner}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function RangeLegend({
  hands,
}: {
  hands: Record<string, TrainerHandFrequencies>;
}) {
  const handValues = Object.values(hands);
  const hasCall = handValues.some((h) => (h.call_freq || 0) > 0);
  const hasAllIn = handValues.some((h) => (h.all_in_freq || 0) > 0);

  return (
    <View style={styles.rangeLegend}>
      <View style={styles.rangeLegendItem}>
        <View style={[styles.rangeLegendDot, { backgroundColor: C.red }]} />
        <Text style={styles.rangeLegendText}>Raise</Text>
      </View>
      {hasAllIn && (
        <View style={styles.rangeLegendItem}>
          <View style={[styles.rangeLegendDot, { backgroundColor: C.allIn }]} />
          <Text style={styles.rangeLegendText}>All-in</Text>
        </View>
      )}
      {hasCall && (
        <View style={styles.rangeLegendItem}>
          <View style={[styles.rangeLegendDot, { backgroundColor: C.green }]} />
          <Text style={styles.rangeLegendText}>Call</Text>
        </View>
      )}
      <View style={styles.rangeLegendItem}>
        <View style={[styles.rangeLegendDot, { backgroundColor: C.blue }]} />
        <Text style={styles.rangeLegendText}>Fold</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeGrid: {
    flexDirection: 'column',
    gap: 0,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 0,
  },
  rangeCellOuter: {
    aspectRatio: 1,
    flex: 1,
  },
  rangeCell: {
    aspectRatio: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  rangeCellActive: {
    borderColor: C.gold,
    borderWidth: 3,
    margin: -2,
    zIndex: 1,
  },
  rangeCellSelected: {
    borderColor: C.purpleLight,
    borderWidth: 3,
    margin: -2,
    zIndex: 1,
  },
  rangeCellSegments: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  rangeCellTextWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeCellText: {
    color: 'white',
    fontSize: 7,
    fontWeight: '900',
    textAlign: 'center',
  },
  rangeCellTextActive: {
    color: 'white',
  },
  rangeLegend: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 8,
  },
  rangeLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  rangeLegendDot: {
    borderRadius: 2,
    height: 8,
    width: 8,
  },
  rangeLegendText: {
    color: C.textSec,
    fontSize: 9,
    fontWeight: '800',
  },
});
