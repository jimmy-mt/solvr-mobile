import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PokerTable } from '../../components/poker-table/PokerTable';
import type { SeatPosition } from '../../components/poker-table/pokerTableTypes';
import { C } from '../../constants/colors';
import {
  SIM_ACTIONS,
  SIM_POSITIONS,
  applySimulatorAction,
  availableSimulatorActions,
  createSimulatorHand,
  formatSimHand,
  simCardToPlayingCard,
  type ModelDecision,
  type SimAction,
  type SimFrequencies,
  type SimGameState,
} from '../../data/simulatorEngine';
import { decidePreflopAction, hasSimulatorNativeRuntime, warmSimulatorModel } from '../../data/simulatorModel';

const HERO_POSITION_CYCLE: SeatPosition[] = ['BB', 'SB', 'BTN', 'CO', 'HJ', 'UTG'];
type SeatDecision = ModelDecision & { position: SeatPosition };

export function SimulatorScreen() {
  const [handId, setHandId] = useState(1);
  const [game, setGame] = useState(() => createSimulatorHand(1));
  const [modelReady, setModelReady] = useState(false);
  const [nativeRuntimeAvailable] = useState(() => hasSimulatorNativeRuntime());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<SeatDecision | null>(null);
  const [heroDecision, setHeroDecision] = useState<SeatDecision | null>(null);
  const [seatDecisions, setSeatDecisions] = useState<Partial<Record<SeatPosition, SeatDecision>>>({});
  const runningRef = useRef(false);
  const heroDecisionKeyRef = useRef<string | null>(null);

  const heroPos = HERO_POSITION_CYCLE[(handId - 1) % HERO_POSITION_CYCLE.length];
  const currentActor = game.playersToAct[0] ?? null;
  const isHeroTurn = currentActor === heroPos && game.phase === 'preflop';
  const legalHeroActions = useMemo(
    () => (isHeroTurn ? availableSimulatorActions(game, heroPos) : []),
    [game, heroPos, isHeroTurn],
  );

  useEffect(() => {
    let active = true;
    if (!nativeRuntimeAvailable) {
      setError('ONNX Runtime native module is not installed in this app build. Rebuild the Expo dev client/native app, then reopen the simulator.');
      return () => {
        active = false;
        runningRef.current = false;
      };
    }
    warmSimulatorModel()
      .then(() => {
        if (active) setModelReady(true);
      })
      .catch((err) => {
        if (active) setError(modelErrorMessage(err));
      });
    return () => {
      active = false;
      runningRef.current = false;
    };
  }, [nativeRuntimeAvailable]);

  async function runNextSpot(seedGame?: SimGameState) {
    if (runningRef.current) return;
    const sourceGame = seedGame ?? game;
    const actor = sourceGame.playersToAct[0] ?? null;
    if (!actor || sourceGame.phase !== 'preflop') return;
    if (actor === heroPos) {
      await loadHeroDecision(sourceGame);
      return;
    }

    runningRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const decision = await decidePreflopAction(sourceGame, actor);
      const nextGame = applySimulatorAction(sourceGame, actor, decision.action, decision.frequencies);
      setLastDecision({
        ...decision,
        position: actor,
      });
      setSeatDecisions((current) => ({ ...current, [actor]: { ...decision, position: actor } }));
      setGame(nextGame);
      if (nextGame.phase === 'preflop' && nextGame.playersToAct[0] === heroPos) {
        await loadHeroDecision(nextGame);
      }
    } catch (err) {
      setError(modelErrorMessage(err));
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  function newHand() {
    runningRef.current = false;
    const nextId = handId + 1;
    const nextGame = createSimulatorHand(nextId);
    setHandId(nextId);
    setGame(nextGame);
    setLastDecision(null);
    setHeroDecision(null);
    setSeatDecisions({});
    heroDecisionKeyRef.current = null;
    setError(null);
  }

  async function heroAct(action: SimAction) {
    if (!isHeroTurn || busy) return;
    setBusy(true);
    setError(null);
    try {
      const decision = heroDecision && heroDecisionKeyRef.current === decisionKey(game, heroPos)
        ? heroDecision
        : { ...(await decidePreflopAction(game, heroPos)), position: heroPos };
      setHeroDecision(decision);
      setSeatDecisions((current) => ({ ...current, [heroPos]: decision }));
      const nextGame = applySimulatorAction(game, heroPos, action, decision.frequencies);
      setGame(nextGame);
      setHeroDecision(null);
      heroDecisionKeyRef.current = null;
    } catch (err) {
      setError(modelErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const tableCards = game.hands[heroPos].map(simCardToPlayingCard) as [
    ReturnType<typeof simCardToPlayingCard>,
    ReturnType<typeof simCardToPlayingCard>,
  ];
  const winnerText = game.phase === 'preflop_complete'
    ? game.active.length === 1
      ? `${game.active[0]} wins preflop`
      : `${game.active.join(', ')} continue to flop`
    : currentActor
      ? `${currentActor} to act`
      : 'Waiting';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!canStepNextSpot(game, heroPos, modelReady, nativeRuntimeAvailable, busy)}
            onPress={() => runNextSpot().catch(() => {})}
            style={({ pressed }) => [
              styles.headerStepButton,
              !canStepNextSpot(game, heroPos, modelReady, nativeRuntimeAvailable, busy) && styles.actionButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.headerButtonText}>Next</Text>
          </Pressable>
          <Pressable onPress={newHand} style={({ pressed }) => [styles.newHandButton, pressed && styles.pressed]}>
            <Text style={styles.headerButtonText}>{game.phase === 'preflop_complete' ? 'Next Hand' : 'New'}</Text>
          </Pressable>
        </View>
      </View>

      <PokerTable
        heroPos={heroPos}
        openerPos={game.opener}
        foldedPositions={game.folded}
        raiseAmounts={tableRaiseAmounts(game)}
        blindAmounts={tablePassiveCommitments(game)}
        cards={tableCards}
        theme="blue"
        dealKey={game.handId}
      />

      <HoleCardStrip game={game} heroPos={heroPos} />

      <View style={styles.statusPanel}>
        <View style={styles.statusItem}>
          <Text style={styles.statusValue}>{formatBB(game.pot)}</Text>
          <Text style={styles.statusLabel}>Pot</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusValue}>{formatSimHand(game.hands[heroPos])}</Text>
          <Text style={styles.statusLabel}>Hero {heroPos}</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusValue}>{modelReady ? 'Ready' : nativeRuntimeAvailable ? 'Loading' : 'Rebuild'}</Text>
          <Text style={styles.statusLabel}>Model</Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.heroPanel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Hero Action</Text>
          <Text style={styles.panelMeta}>
            {isHeroTurn ? `${formatBB(Math.max(0, game.currentBet - game.committed[heroPos]))} to call` : winnerText}
          </Text>
        </View>
        <View style={styles.actionRow}>
          {SIM_ACTIONS.map((action) => {
              const enabled = isHeroTurn && legalHeroActions.includes(action) && nativeRuntimeAvailable && modelReady && !busy;
            return (
              <Pressable
                key={action}
                disabled={!enabled}
                onPress={() => heroAct(action)}
                style={({ pressed }) => [
                  styles.actionButton,
                  action === 'raise' && styles.raiseButton,
                  action === 'jam' && styles.jamButton,
                  !enabled && styles.actionButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionText, !enabled && styles.actionTextDisabled]}>{actionLabel(action)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FrequencyPanel title="Hero NN Output" decision={heroDecision} emptyLabel={isHeroTurn ? 'Calculating hero strategy' : `Waiting for ${heroPos} action`} />
      <FrequencyPanel title="Last Simulated NN Output" decision={lastDecision} emptyLabel="No simulated decision yet" />
      <SeatNnGrid decisions={seatDecisions} heroPos={heroPos} />
      <ActionLog game={game} />
    </ScrollView>
  );

  async function loadHeroDecision(sourceGame: SimGameState) {
    const key = decisionKey(sourceGame, heroPos);
    if (heroDecisionKeyRef.current === key) return;
    heroDecisionKeyRef.current = key;
    const decision = await decidePreflopAction(sourceGame, heroPos);
    const seatDecision = { ...decision, position: heroPos };
    setHeroDecision(seatDecision);
    setSeatDecisions((current) => ({ ...current, [heroPos]: seatDecision }));
  }
}

function FrequencyPanel({
  title,
  decision,
  emptyLabel,
}: {
  title: string;
  decision: SeatDecision | null;
  emptyLabel: string;
}) {
  return (
    <View style={styles.modelPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelMeta}>
          {decision ? `${decision.position} ${actionLabel(decision.action)}` : emptyLabel}
        </Text>
      </View>
      {SIM_ACTIONS.map((action, index) => {
        const value = decision?.frequencies[index] ?? 0;
        return (
          <View key={action} style={styles.freqRow}>
            <Text style={styles.freqLabel}>{actionLabel(action)}</Text>
            <View style={styles.freqTrack}>
              <View style={[styles.freqFill, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} />
            </View>
            <Text style={styles.freqValue}>{Math.round(value * 100)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function HoleCardStrip({ game, heroPos }: { game: SimGameState; heroPos: SeatPosition }) {
  return (
    <View style={styles.holeCardStrip}>
      {SIM_POSITIONS.map((position) => (
        <View key={position} style={[styles.holeCardSeat, position === heroPos && styles.holeCardHeroSeat]}>
          <Text style={styles.holeCardPosition}>{position}</Text>
          <View style={styles.holeCardPair}>
            {game.hands[position].map((card, index) => (
              <MiniSimCard key={`${position}-${card.rank}${card.suit}-${index}`} card={card} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function MiniSimCard({ card }: { card: SimGameState['hands'][SeatPosition][number] }) {
  const red = card.suit === 'h' || card.suit === 'd';
  return (
    <View style={styles.miniCard}>
      <Text style={[styles.miniCardRank, red && styles.miniCardRed]}>{card.rank}</Text>
      <Text style={[styles.miniCardSuit, red && styles.miniCardRed]}>{suitLabel(card.suit)}</Text>
    </View>
  );
}

function SeatNnGrid({
  decisions,
  heroPos,
}: {
  decisions: Partial<Record<SeatPosition, SeatDecision>>;
  heroPos: SeatPosition;
}) {
  return (
    <View style={styles.debugPanel}>
      <Text style={styles.panelTitle}>Seat NN Outputs</Text>
      <View style={styles.debugGrid}>
        {SIM_POSITIONS.map((position) => {
          const decision = decisions[position];
          return (
            <View key={position} style={[styles.nnSeatCard, position === heroPos && styles.debugHeroHand]}>
              <View style={styles.nnSeatHeader}>
                <Text style={styles.debugSeat}>{position}</Text>
                <Text style={styles.nnSeatAction}>{decision ? actionLabel(decision.action) : '-'}</Text>
              </View>
              <Text style={styles.nnSeatFreqs}>{decision ? compactFreqs(decision.frequencies) : 'F -  C -  R -  J -'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActionLog({ game }: { game: SimGameState }) {
  const rows = [...game.actionLog].reverse().slice(0, 8);
  return (
    <View style={styles.logPanel}>
      <Text style={styles.panelTitle}>Action Log</Text>
      {rows.length === 0 ? (
        <Text style={styles.emptyText}>The model will open the action from UTG.</Text>
      ) : (
        rows.map((entry, index) => (
          <View key={`${entry.position}-${index}-${entry.potAfter}`} style={styles.logRow}>
            <Text style={styles.logAction}>
              {entry.position} {actionLabel(entry.action)}
            </Text>
            <Text style={styles.logMeta}>Pot {formatBB(entry.potAfter)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function actionLabel(action: SimAction) {
  if (action === 'jam') return 'Jam';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function suitLabel(suit: SimGameState['hands'][SeatPosition][number]['suit']) {
  if (suit === 's') return 'S';
  if (suit === 'h') return 'H';
  if (suit === 'd') return 'D';
  return 'C';
}

function formatBB(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}bb`;
}

function compactFreqs(freqs: SimFrequencies) {
  return `F ${pct(freqs[0])}  C ${pct(freqs[1])}  R ${pct(freqs[2])}  J ${pct(freqs[3])}`;
}

function pct(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}`;
}

function modelErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('install') || message.includes('onnxruntime')) {
    return 'ONNX Runtime native module is not installed in this app build. Rebuild the Expo dev client/native app, then reopen the simulator.';
  }
  return message || 'Simulator inference failed.';
}

function tableRaiseAmounts(game: SimGameState) {
  const raised = new Set(
    game.actionLog
      .filter((entry) => entry.action === 'raise' || entry.action === 'jam')
      .map((entry) => entry.position),
  );
  return Object.fromEntries(
    SIM_POSITIONS
      .filter((position) => raised.has(position))
      .map((position) => [position, game.committed[position]]),
  ) as Partial<Record<SeatPosition, number>>;
}

function tablePassiveCommitments(game: SimGameState) {
  const raiseAmounts = tableRaiseAmounts(game);
  return Object.fromEntries(
    SIM_POSITIONS
      .filter((position) => game.committed[position] > 0 && raiseAmounts[position] == null)
      .map((position) => [position, game.committed[position]]),
  ) as Partial<Record<SeatPosition, number>>;
}

function decisionKey(game: SimGameState, position: SeatPosition) {
  return `${game.handId}:${position}:${game.actionLog.length}:${game.currentBet}:${game.committed[position]}:${game.playersToAct.join(',')}`;
}

function canStepNextSpot(
  game: SimGameState,
  heroPos: SeatPosition,
  modelReady: boolean,
  nativeRuntimeAvailable: boolean,
  busy: boolean,
) {
  const actor = game.playersToAct[0] ?? null;
  return nativeRuntimeAvailable && modelReady && !busy && game.phase === 'preflop' && actor != null && actor !== heroPos;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 34,
    paddingTop: 48,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerStepButton: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 70,
  },
  newHandButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 86,
  },
  headerButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  statusPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  holeCardStrip: {
    alignSelf: 'stretch',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginTop: -10,
    overflow: 'hidden',
    paddingHorizontal: 1,
    paddingVertical: 6,
  },
  holeCardSeat: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexBasis: 0,
    flexShrink: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 3,
  },
  holeCardHeroSeat: {
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderColor: 'rgba(196,181,253,0.45)',
  },
  holeCardPosition: {
    color: C.textMuted,
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 9,
  },
  holeCardPair: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 0,
    justifyContent: 'center',
    width: '100%',
  },
  miniCard: {
    alignItems: 'center',
    backgroundColor: '#fdfcff',
    borderColor: 'rgba(15,23,42,0.14)',
    borderRadius: 3,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 13,
  },
  miniCardRank: {
    color: '#111827',
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 9,
  },
  miniCardSuit: {
    color: '#111827',
    fontSize: 6,
    fontWeight: '900',
    lineHeight: 7,
  },
  miniCardRed: {
    color: '#c41c1c',
  },
  statusItem: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 10,
    flex: 1,
    gap: 3,
    paddingVertical: 10,
  },
  statusValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  panelMeta: {
    color: C.textSec,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 6,
  },
  raiseButton: {
    borderColor: 'rgba(96, 165, 250, 0.55)',
  },
  jamButton: {
    borderColor: 'rgba(248, 113, 113, 0.55)',
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
  actionText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  actionTextDisabled: {
    color: C.textMuted,
  },
  modelPanel: {
    backgroundColor: 'rgba(20, 30, 54, 0.86)',
    borderColor: 'rgba(96, 165, 250, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  freqRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  freqLabel: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    width: 44,
  },
  freqTrack: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  freqFill: {
    backgroundColor: '#60a5fa',
    borderRadius: 5,
    height: '100%',
  },
  freqValue: {
    color: C.text,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    width: 36,
  },
  logPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  logRow: {
    alignItems: 'center',
    borderTopColor: C.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 9,
  },
  logAction: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  logMeta: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  debugPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  debugGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  debugHand: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '31%',
    flexGrow: 1,
    gap: 3,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  debugHeroHand: {
    borderColor: C.purpleLight,
  },
  debugSeat: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  debugCards: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  nnSeatCard: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 5,
    minWidth: 138,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  nnSeatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nnSeatAction: {
    color: C.text,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nnSeatFreqs: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
});
