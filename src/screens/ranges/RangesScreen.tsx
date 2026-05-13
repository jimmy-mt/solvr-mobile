import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';

import { RangeLegend } from '../../components/range-grid/RangeGrid';
import { C } from '../../constants/colors';
import {
  availableActionsForSpot,
  formatBB,
  scenarioLabel,
  type TrainerHandFrequencies,
  type TrainerSpot,
} from '../../data/trainerDb';

// ─── Types ───────────────────────────────────────────────────────────────────

type NodeRow = Record<string, string | number | null> & {
  id: number;
  layer: number;
  opener_sequence: string | null;
  hero_position: string;
  proposed_raise_bb: number;
};

type HandRow = {
  hand: string;
  freq_fold: number | null;
  freq_call: number | null;
  freq_raise: number | null;
  freq_all_in: number | null;
  hand_probability: number | null;
};

type TransitionRow = { action: string; to_node_id: number; proposed_raise_bb: number | null };

type NavAction = 'fold' | 'call' | 'raise' | 'all_in';

type HistoryEntry = { nodeId: number; action: NavAction };

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOT_NODE_ID = 1;
const allPositions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const TOP_CONTENT_OFFSET = 58;

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function loadNode(db: ReturnType<typeof useSQLiteContext>, nodeId: number) {
  const [node, rows, transitions] = await Promise.all([
    db.getFirstAsync<NodeRow>('SELECT * FROM nodes WHERE id = ?', [nodeId]),
    db.getAllAsync<HandRow>(
      `SELECT hand, freq_fold, freq_call, freq_raise, freq_all_in, hand_probability
       FROM hands WHERE node_id = ? ORDER BY id`,
      [nodeId],
    ),
    db.getAllAsync<TransitionRow>(
      `SELECT t.action, t.to_node_id, n.proposed_raise_bb
       FROM transitions t
       LEFT JOIN nodes n ON n.id = t.to_node_id
       WHERE t.from_node_id = ?`,
      [nodeId],
    ),
  ]);

  if (!node) return null;

  const hands: Record<string, TrainerHandFrequencies> = {};
  for (const row of rows) {
    const prob = row.hand_probability ?? 100;
    hands[row.hand] = {
      fold_freq: row.freq_fold ?? 0,
      call_freq: row.freq_call ?? 0,
      raise_freq: row.freq_raise ?? 0,
      all_in_freq: row.freq_all_in ?? 0,
      hand_probability: prob,
      possible: prob > 0,
      reach: prob,
    };
  }

  return { node, hands, transitions };
}

function spotFromNodeRow(node: NodeRow): TrainerSpot {
  const layer = Number(node.layer);
  const hero = String(node.hero_position);
  const sequence = typeof node.opener_sequence === 'string' ? node.opener_sequence : '';
  const base: TrainerSpot = {
    layer,
    type: 'RFI',
    hero,
    nodeId: Number(node.id),
    raiseBB: Number(node.proposed_raise_bb || 0),
    facingBB: 0,
    openerRaiseBB: null,
    opener: null,
    threebetter: null,
    fourbetter: null,
  };
  if (layer === 0) return base;
  const parts = sequence.split(', ');
  const inv = (pos?: string | null) => {
    if (!pos) return 0;
    return Number(node[`${pos.toLowerCase()}_invested_bb`] || 0);
  };
  if (layer === 1) {
    const opener = parts[0];
    return { ...base, type: 'VO', opener, facingBB: inv(opener) };
  }
  if (layer === 2) {
    const [opener, threebetter] = parts;
    return { ...base, type: 'V3B', opener, threebetter, openerRaiseBB: inv(opener), facingBB: inv(threebetter) };
  }
  const [opener, threebetter, fourbetter] = parts;
  return {
    ...base,
    type: 'V4B',
    opener,
    threebetter,
    fourbetter,
    openerRaiseBB: inv(opener),
    threebetBB: inv(threebetter),
    facingBB: inv(fourbetter),
  };
}

// ─── Position pill state ──────────────────────────────────────────────────────

type PillState = 'hero' | 'raised' | 'folded' | 'pending' | 'inactive';

function pillStateForPosition(pos: string, spot: TrainerSpot | null): PillState {
  if (!spot) return 'inactive';
  if (spot.hero === pos) return 'hero';
  if (spot.opener === pos || spot.threebetter === pos || spot.fourbetter === pos) return 'raised';
  const heroIdx = allPositions.indexOf(spot.hero);
  const posIdx = allPositions.indexOf(pos);
  const active = new Set(
    [spot.hero, spot.opener, spot.threebetter, spot.fourbetter].filter(Boolean) as string[],
  );
  if (!active.has(pos)) {
    if (spot.layer === 0) return posIdx < heroIdx ? 'folded' : 'pending';
    return posIdx < heroIdx ? 'folded' : 'pending';
  }
  return 'inactive';
}

// ─── Main screen ─────────────────────────────────────────────────────────────

type NodeData = NonNullable<Awaited<ReturnType<typeof loadNode>>>;
type EntranceRangeGridHandle = {
  replay: () => void;
};

export function RangesScreen() {
  const db = useSQLiteContext();

  const isFocused = useIsFocused();
  const wasFocused = useRef(false);
  const gridRef = useRef<EntranceRangeGridHandle | null>(null);

  const [nodeId, setNodeId] = useState(ROOT_NODE_ID);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
  const [selCell, setSelCell] = useState<string | null>(null);
  const [detailAnimKey, setDetailAnimKey] = useState(0);

  // Cache: nodeId → loaded data (avoids re-querying already-visited nodes)
  const cache = useMemo(() => new Map<number, NodeData>(), [db]);

  const spot = useMemo(() => (nodeData ? spotFromNodeRow(nodeData.node) : null), [nodeData]);
  const label = useMemo(() => (spot ? scenarioLabel(spot) : ''), [spot]);

  const loadAndCache = useCallback(
    async (id: number): Promise<NodeData | null> => {
      if (cache.has(id)) return cache.get(id)!;
      const data = await loadNode(db, id);
      if (data) cache.set(id, data);
      return data ?? null;
    },
    [db, cache],
  );

  const load = useCallback(
    async (id: number) => {
      const data = await loadAndCache(id);
      if (data) {
        setNodeData(data);
        setSelCell(null);
        // Prefetch all children in the background
        for (const t of data.transitions) {
          loadAndCache(t.to_node_id);
        }
      }
    },
    [loadAndCache],
  );

  useEffect(() => {
    load(nodeId);
  }, [nodeId, load]);

  useEffect(() => {
    if (isFocused && !wasFocused.current) {
      let secondFrame: number | null = null;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          gridRef.current?.replay();
          setDetailAnimKey((k) => k + 1);
        });
      });
      wasFocused.current = isFocused;
      return () => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame != null) cancelAnimationFrame(secondFrame);
      };
    }
    wasFocused.current = isFocused;
  }, [isFocused]);

  const navigate = useCallback(
    (action: NavAction) => {
      const t = nodeData?.transitions.find((tr) => tr.action === action);
      if (!t) return;
      const cached = cache.get(t.to_node_id);
      setHistory((h) => [...h, { nodeId, action }]);
      if (cached) {
        // Instant swap from cache
        setNodeData(cached);
        setSelCell(null);
        // Prefetch children of this node too
        for (const child of cached.transitions) {
          loadAndCache(child.to_node_id);
        }
      } else {
        setNodeId(t.to_node_id);
      }
    },
    [nodeData, nodeId, cache, loadAndCache],
  );

  const goBack = useCallback(() => {
    setEndOfHand(null);
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      const cached = cache.get(prev.nodeId);
      if (cached) {
        setNodeData(cached);
        setSelCell(null);
      } else {
        setNodeId(prev.nodeId);
      }
      return h.slice(0, -1);
    });
  }, [cache]);

  const reset = useCallback(() => {
    setEndOfHand(null);
    setHistory([]);
    const cached = cache.get(ROOT_NODE_ID);
    if (cached) {
      setNodeData(cached);
      setSelCell(null);
    } else {
      setNodeId(ROOT_NODE_ID);
    }
    requestAnimationFrame(() => {
      gridRef.current?.replay();
      setDetailAnimKey((k) => k + 1);
    });
  }, [cache]);

  const transitions = nodeData?.transitions ?? [];
  const hasBack = history.length > 0;

  // Derive available actions from the current spot's hand frequencies (source of truth),
  // then look up transitions separately just for navigation targets.
  const availableActions = nodeData ? availableActionsForSpot(nodeData.hands) : [];
  const hasFold = availableActions.includes('Fold');
  const hasCall = availableActions.includes('Call');
  const hasRaise = availableActions.includes('Raise');
  const hasAllIn = availableActions.includes('All-in');


  const [endOfHand, setEndOfHand] = useState<'fold' | 'call' | 'all_in' | null>(null);

  const handleAction = useCallback(
    (action: NavAction) => {
      setEndOfHand(null);
      const trans = transitions.find((t) => t.action === action);
      if (trans) {
        navigate(action);
      } else if (action !== 'raise') {
        setEndOfHand(action);
        setSelCell(null);
      }
    },
    [transitions, navigate],
  );

  const selFreq = selCell && nodeData?.hands[selCell] ? nodeData.hands[selCell] : null;

  // Weighted aggregate across all possible hands (weight = hand_probability)
  const aggregateFreq = useMemo((): TrainerHandFrequencies | null => {
    if (!nodeData) return null;
    const values = Object.values(nodeData.hands).filter((h) => h.possible && h.hand_probability > 0);
    if (values.length === 0) return null;
    const totalWeight = values.reduce((s, h) => s + h.hand_probability, 0);
    if (totalWeight === 0) return null;
    return {
      fold_freq: values.reduce((s, h) => s + h.fold_freq * h.hand_probability, 0) / totalWeight,
      call_freq: values.reduce((s, h) => s + h.call_freq * h.hand_probability, 0) / totalWeight,
      raise_freq: values.reduce((s, h) => s + h.raise_freq * h.hand_probability, 0) / totalWeight,
      all_in_freq: values.reduce((s, h) => s + h.all_in_freq * h.hand_probability, 0) / totalWeight,
      hand_probability: 100,
      possible: true,
      reach: 100,
    };
  }, [nodeData]);

  // What CellDetail shows: selected hand if tapped, otherwise the aggregate
  const detailFreq = selFreq ?? aggregateFreq;
  const detailLabel = selCell ?? 'Range';
  const handleCellPress = useCallback((cell: string) => {
    setSelCell((prev) => (prev === cell ? null : cell));
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header nav row */}
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            {hasBack && (
              <Pressable onPress={goBack} style={styles.navButton}>
                <Text style={styles.navButtonText}>← Back</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.screenTitle}>Ranges</Text>
          <View style={styles.headerSide}>
            <Pressable onPress={reset} style={[styles.navButton, styles.resetButton]}>
              <Text style={styles.navButtonText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        {/* Position pills */}
        <View style={styles.positionRow}>
          {allPositions.map((pos) => {
            const state = pillStateForPosition(pos, spot);
            return (
              <View key={pos} style={[styles.posPill, posPillStyle(state)]}>
                <Text style={[styles.posPillText, posPillTextStyle(state)]}>{pos}</Text>
              </View>
            );
          })}
        </View>

        {/* Scenario label */}
        <View style={styles.scenarioBox}>
          <Text style={styles.scenarioLabel} numberOfLines={2}>
            {label || 'Ranges'}
          </Text>
        </View>

        {/* Legend + Grid — exact match to hint panel layout */}
        {nodeData && (
          <View style={styles.rangePanel}>
            <RangeLegend hands={nodeData.hands} />
            <EntranceRangeGrid
              ref={gridRef}
              hands={nodeData.hands}
              focused={isFocused}
              selectedHand={selCell}
              onCellPress={handleCellPress}
            />
          </View>
        )}

        {/* Frequency detail — shows selected hand or weighted range aggregate */}
        {detailFreq && (
          <View style={{ marginTop: -6 }}>
            <CellDetail hand={detailLabel} freq={detailFreq} animationKey={detailAnimKey} focused={isFocused} />
          </View>
        )}

        {/* End-of-hand banner */}
        {endOfHand && (
          <View style={styles.endOfHandBox}>
            <Text style={styles.endOfHandTitle}>End of preflop</Text>
            <Text style={styles.endOfHandSub}>
              {endOfHand === 'fold' ? 'Hand folded — no further spots yet.' : endOfHand === 'call' ? 'Hand called — postflop coming soon.' : 'All-in — postflop coming soon.'}
            </Text>
          </View>
        )}

        {/* Action buttons — inside scroll, same sizing as trainer */}
        {nodeData && (hasFold || hasCall || hasRaise || hasAllIn) && (
          <View style={styles.actionDock}>
            <View style={styles.actionGrid}>
              {hasFold && (
                <Pressable style={[styles.actionButton, styles.foldButton]} onPress={() => handleAction('fold')}>
                  <Text style={styles.actionText}>Fold</Text>
                </Pressable>
              )}
              {hasCall && (
                <Pressable style={[styles.actionButton, styles.callButton]} onPress={() => handleAction('call')}>
                  <Text style={styles.actionText}>
                    Call{spot?.facingBB ? ` ${formatBB(spot.facingBB)}` : ''}
                  </Text>
                </Pressable>
              )}
              {hasRaise && (
                <Pressable style={[styles.actionButton, styles.raiseButton]} onPress={() => handleAction('raise')}>
                  <Text style={styles.actionText}>
                    Raise{nodeData.node.proposed_raise_bb ? ` ${formatBB(nodeData.node.proposed_raise_bb)}` : ''}
                  </Text>
                </Pressable>
              )}
              {hasAllIn && (
                <Pressable style={[styles.actionButton, styles.allInButton]} onPress={() => handleAction('all_in')}>
                  <Text style={styles.actionText}>All-in</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Entrance range grid ──────────────────────────────────────────────────────

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const GRID_ANIMATION_DURATION = 570;

function cellLabel(rr: string, cr: string, ri: number, ci: number) {
  if (ri === ci) return rr + cr;
  if (ri < ci) return rr + cr + 's';
  return cr + rr + 'o';
}

const EntranceRangeGrid = memo(forwardRef<EntranceRangeGridHandle, {
  focused: boolean;
  hands: Record<string, TrainerHandFrequencies>;
  selectedHand: string | null;
  onCellPress: (hand: string) => void;
}>(function EntranceRangeGrid({
  focused,
  hands,
  selectedHand,
  onCellPress,
}, ref) {
  const progress = useRef(new Animated.Value(0)).current;

  const replay = useCallback(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: GRID_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  useImperativeHandle(ref, () => ({ replay }), [replay]);

  useEffect(() => {
    if (!focused) {
      progress.setValue(0);
    }
  }, [focused, progress]);

  return (
    <View style={entranceStyles.grid}>
      {RANKS.map((rowRank, ri) => {
        const rowSelected = RANKS.some((colRank, ci) => cellLabel(rowRank, colRank, ri, ci) === selectedHand);
        return (
        <View key={rowRank} style={[entranceStyles.row, rowSelected && { zIndex: 10 }]}>
          {RANKS.map((colRank, ci) => {
            const label = cellLabel(rowRank, colRank, ri, ci);
            const freq = hands[label];
            const selected = label === selectedHand;
            const cellDelay = ((ri + ci) * 13) / GRID_ANIMATION_DURATION;
            const opacity = progress.interpolate({
              inputRange: [0, Math.min(cellDelay, 0.96), Math.min(cellDelay + 0.14, 1)],
              outputRange: [0, 0, 1],
              extrapolate: 'clamp',
            });

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

            return (
              <Pressable
                key={label}
                style={[entranceStyles.cellOuter, selected && entranceStyles.cellOuterSelected]}
                onPress={() => onCellPress(label)}
              >
                <Animated.View
                  style={[
                    entranceStyles.cell,
                    selected && entranceStyles.cellSelected,
                    { opacity },
                  ]}
                >
                  <View style={entranceStyles.segments}>
                    {segments.length > 0 ? (
                      <View style={{ flex: 1, flexDirection: 'column' }}>
                        {emptyFrac > 0 && (
                          <View style={{ flex: emptyFrac, backgroundColor: '#100c2f' }} />
                        )}
                        <View style={{ flex: prob / 100, flexDirection: 'row' }}>
                          {segments.map((s, i) => (
                            <View
                              key={i}
                              style={{ width: `${(s.freq / total) * 100}%`, backgroundColor: s.color, height: '100%' }}
                            />
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View style={{ flex: 1, backgroundColor: '#100c2f', height: '100%' }} />
                    )}
                  </View>
                  <View style={entranceStyles.textWrapper}>
                    <Text style={entranceStyles.cellText}>{label}</Text>
                  </View>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
        );
      })}
    </View>
  );
}));

const entranceStyles = StyleSheet.create({
  grid: { flexDirection: 'column', gap: 0 },
  row: { flexDirection: 'row', gap: 0 },
  cellOuter: { aspectRatio: 1, flex: 1 },
  cell: {
    aspectRatio: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  cellOuterSelected: {
    zIndex: 10,
    elevation: 10,
  },
  cellSelected: {
    borderColor: C.gold,
    borderWidth: 3,
    margin: -2,
  },
  segments: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  textWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { color: 'white', fontSize: 7, fontWeight: '900', textAlign: 'center' },
});

// ─── Cell detail panel ────────────────────────────────────────────────────────


const cellDetailSlideEasing = Easing.bezier(0.22, 1, 0.36, 1);

function CellDetail({
  animationKey,
  focused,
  hand,
  freq,
}: {
  animationKey: number;
  focused: boolean;
  hand: string;
  freq: TrainerHandFrequencies;
}) {
  const segments = [
    { label: 'All-in', value: freq.all_in_freq, color: C.allIn },
    { label: 'Raise', value: freq.raise_freq, color: C.red },
    { label: 'Call', value: freq.call_freq, color: C.green },
    { label: 'Fold', value: freq.fold_freq, color: C.blue },
  ].filter((s) => s.value > 0);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const revealWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!focused) {
      revealWidth.setValue(0);
      return;
    }

    revealWidth.setValue(0);
    const anim = Animated.timing(revealWidth, {
      toValue: 100,
      duration: 900,
      easing: cellDetailSlideEasing,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [animationKey, focused, revealWidth]);

  return (
    <View style={styles.cellDetail}>
      <View style={styles.cellDetailHeader}>
        <Text style={styles.cellDetailHand}>{hand}</Text>
        {!freq.possible && <Text style={styles.cellDetailImpossible}>Not reachable</Text>}
      </View>
      {segments.length === 0 ? (
        <Text style={styles.cellDetailEmpty}>No frequency data</Text>
      ) : (
        <>
          {/* Outer track clips the reveal */}
          <View style={[styles.cellDetailBar, { overflow: 'hidden' }]}>
            {/* Inner row holds all segments at full width; reveal clips it */}
            <Animated.View
              style={{
                flexDirection: 'row',
                width: revealWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                height: '100%',
                overflow: 'hidden',
              }}
            >
              {/* Segments fill the inner row proportionally */}
              <View style={{ flex: 1, flexDirection: 'row' }}>
                {segments.map((s) => (
                  <View
                    key={s.label}
                    style={{ flex: s.value / total, backgroundColor: s.color, height: '100%' }}
                  />
                ))}
              </View>
            </Animated.View>
          </View>
          <View style={styles.cellDetailLegend}>
            {segments.map((s) => (
              <View key={s.label} style={styles.cellDetailLegendItem}>
                <View style={[styles.cellDetailDot, { backgroundColor: s.color }]} />
                <Text style={styles.cellDetailLegendText}>{s.label} {s.value.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Pill style helpers ───────────────────────────────────────────────────────

function posPillStyle(state: PillState): object {
  if (state === 'hero') return styles.posPillHero;
  if (state === 'raised') return styles.posPillRaised;
  if (state === 'folded') return styles.posPillFolded;
  if (state === 'pending') return styles.posPillPending;
  return styles.posPillInactive;
}

function posPillTextStyle(state: PillState): object {
  if (state === 'hero') return styles.posPillTextHero;
  if (state === 'raised') return styles.posPillTextRaised;
  if (state === 'folded') return styles.posPillTextFolded;
  if (state === 'pending') return styles.posPillTextPending;
  return styles.posPillTextInactive;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:
      (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0) + TOP_CONTENT_OFFSET,
    paddingBottom: 24,
    gap: 12,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  headerSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  screenTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '900',
  },
  navButton: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resetButton: {
    alignSelf: 'flex-end',
  },
  navButtonText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
  },
  positionRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  posPill: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  posPillHero: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  posPillRaised: {
    backgroundColor: 'rgba(240,69,69,0.18)',
    borderColor: C.red,
  },
  posPillFolded: {
    backgroundColor: C.surface2,
    borderColor: C.border,
  },
  posPillPending: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderColor: 'rgba(168,85,247,0.4)',
  },
  posPillInactive: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    opacity: 0.4,
  },
  posPillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  posPillTextHero: { color: 'white' },
  posPillTextRaised: { color: C.red },
  posPillTextFolded: { color: C.textMuted },
  posPillTextPending: { color: C.purplePale },
  posPillTextInactive: { color: C.textMuted },
  scenarioBox: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scenarioLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  rangePanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  cellDetail: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  cellDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cellDetailHand: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
  },
  cellDetailImpossible: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  cellDetailEmpty: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  cellDetailBar: {
    borderRadius: 6,
    flexDirection: 'row',
    height: 14,
    overflow: 'hidden',
  },
  cellDetailLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cellDetailLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  cellDetailDot: {
    borderRadius: 3,
    height: 8,
    width: 8,
  },
  cellDetailLegendText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '700',
  },
  actionDock: {
    paddingBottom: 6,
    paddingTop: 0,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    flexBasis: 0,
    minHeight: 78,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  actionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  foldButton: { backgroundColor: C.blue },
  callButton: { backgroundColor: C.green },
  raiseButton: { backgroundColor: C.red },
  allInButton: { backgroundColor: C.allIn },
  endOfHandBox: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  endOfHandTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
  endOfHandSub: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
