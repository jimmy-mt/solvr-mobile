import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { RangeGrid, RangeLegend } from '../../components/range-grid/RangeGrid';
import { C } from '../../constants/colors';
import {
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
  const node = await db.getFirstAsync<NodeRow>('SELECT * FROM nodes WHERE id = ?', [nodeId]);
  if (!node) return null;

  const rows = await db.getAllAsync<HandRow>(
    `SELECT hand, freq_fold, freq_call, freq_raise, freq_all_in, hand_probability
     FROM hands WHERE node_id = ? ORDER BY id`,
    [nodeId],
  );

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

  const transitions = await db.getAllAsync<TransitionRow>(
    `SELECT t.action, t.to_node_id, n.proposed_raise_bb
     FROM transitions t
     LEFT JOIN nodes n ON n.id = t.to_node_id
     WHERE t.from_node_id = ?`,
    [nodeId],
  );

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

export function RangesScreen() {
  const db = useSQLiteContext();

  const [nodeId, setNodeId] = useState(ROOT_NODE_ID);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [nodeData, setNodeData] = useState<Awaited<ReturnType<typeof loadNode>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selCell, setSelCell] = useState<string | null>(null);

  const spot = useMemo(() => (nodeData ? spotFromNodeRow(nodeData.node) : null), [nodeData]);
  const label = useMemo(() => (spot ? scenarioLabel(spot) : ''), [spot]);

  const load = useCallback(
    async (id: number) => {
      setLoading(true);
      try {
        const data = await loadNode(db, id);
        setNodeData(data);
        setSelCell(null);
      } finally {
        setLoading(false);
      }
    },
    [db],
  );

  useEffect(() => {
    load(nodeId);
  }, [nodeId, load]);

  const navigate = useCallback(
    (action: NavAction) => {
      const t = nodeData?.transitions.find((tr) => tr.action === action);
      if (!t) return;
      setHistory((h) => [...h, { nodeId, action }]);
      setNodeId(t.to_node_id);
    },
    [nodeData, nodeId],
  );

  const goBack = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setNodeId(prev.nodeId);
      return h.slice(0, -1);
    });
  }, []);

  const reset = useCallback(() => {
    setHistory([]);
    setNodeId(ROOT_NODE_ID);
  }, []);

  const transitions = nodeData?.transitions ?? [];
  const hasBack = history.length > 0;

  const foldTrans = transitions.find((t) => t.action === 'fold');
  const callTrans = transitions.find((t) => t.action === 'call');
  const raiseTrans = transitions.find((t) => t.action === 'raise');
  const allInTrans = transitions.find((t) => t.action === 'all_in');

  const selFreq = selCell && nodeData?.hands[selCell] ? nodeData.hands[selCell] : null;

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
            {loading ? '…' : label || 'Select a spot'}
          </Text>
        </View>

        {/* Legend + Grid — exact match to hint panel layout */}
        {nodeData && (
          <View style={styles.rangePanel}>
            <RangeLegend hands={nodeData.hands} />
            <RangeGrid
              hands={nodeData.hands}
              selectedHand={selCell}
              onCellPress={(cell) => setSelCell((prev) => (prev === cell ? null : cell))}
            />
          </View>
        )}

        {/* Selected cell detail */}
        {selCell && selFreq && <CellDetail hand={selCell} freq={selFreq} />}

        {/* Action navigation buttons */}
        {(foldTrans || callTrans || raiseTrans || allInTrans) && (
          <View style={styles.actionRow}>
            {foldTrans && (
              <Pressable style={[styles.actionBtn, styles.foldBtn]} onPress={() => navigate('fold')}>
                <Text style={styles.actionBtnText}>Fold</Text>
              </Pressable>
            )}
            {callTrans && (
              <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={() => navigate('call')}>
                <Text style={styles.actionBtnText}>Call</Text>
              </Pressable>
            )}
            {raiseTrans && (
              <Pressable style={[styles.actionBtn, styles.raiseBtn]} onPress={() => navigate('raise')}>
                <Text style={styles.actionBtnText}>
                  Raise{raiseTrans.proposed_raise_bb ? ` ${formatBB(raiseTrans.proposed_raise_bb)}` : ''}
                </Text>
              </Pressable>
            )}
            {allInTrans && (
              <Pressable style={[styles.actionBtn, styles.allInBtn]} onPress={() => navigate('all_in')}>
                <Text style={styles.actionBtnText}>All-in</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Cell detail panel ────────────────────────────────────────────────────────

function CellDetail({ hand, freq }: { hand: string; freq: TrainerHandFrequencies }) {
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: 'Raise', value: freq.raise_freq, color: C.red },
    { label: 'All-in', value: freq.all_in_freq, color: C.allIn },
    { label: 'Call', value: freq.call_freq, color: C.green },
    { label: 'Fold', value: freq.fold_freq, color: C.blue },
  ].filter((r) => r.value > 0);

  return (
    <View style={styles.cellDetail}>
      <View style={styles.cellDetailHeader}>
        <Text style={styles.cellDetailHand}>{hand}</Text>
        {!freq.possible && <Text style={styles.cellDetailImpossible}>Not reachable</Text>}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.cellDetailEmpty}>No frequency data</Text>
      ) : (
        rows.map((r) => (
          <View key={r.label} style={styles.cellDetailRow}>
            <View style={[styles.cellDetailDot, { backgroundColor: r.color }]} />
            <Text style={styles.cellDetailLabel}>{r.label}</Text>
            <View style={styles.cellDetailBarTrack}>
              <View
                style={[
                  styles.cellDetailBarFill,
                  { width: `${r.value}%`, backgroundColor: r.color },
                ]}
              />
            </View>
            <Text style={styles.cellDetailValue}>{r.value.toFixed(0)}%</Text>
          </View>
        ))
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
  cellDetailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cellDetailDot: {
    borderRadius: 3,
    height: 10,
    width: 10,
  },
  cellDetailLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    width: 44,
  },
  cellDetailBarTrack: {
    backgroundColor: C.surface2,
    borderRadius: 4,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  cellDetailBarFill: {
    borderRadius: 4,
    height: '100%',
  },
  cellDetailValue: {
    color: C.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    width: 38,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  actionBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  foldBtn: { backgroundColor: C.blue },
  callBtn: { backgroundColor: C.green },
  raiseBtn: { backgroundColor: C.red },
  allInBtn: { backgroundColor: C.allIn },
});
