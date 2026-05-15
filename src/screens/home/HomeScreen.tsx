import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PokerCard } from '../../components/poker-table/PokerCard';
import type { PlayingCard } from '../../components/poker-table/pokerTableTypes';
import { C } from '../../constants/colors';
import {
  cardToString,
  lookupEquity,
  type CardRank,
  type CardSuit,
  type EquityCard,
  type EquityLookupResult,
} from '../../data/equityDb';
import {
  getPerformanceDecisions,
  getPerformanceSessions,
  type PerformanceDecision,
  type PerformanceSession,
} from '../../data/performanceStore';
import { getDailyGoal, type DailyGoal } from '../../data/appSettingsStore';
import type { SpotTypeFilter } from '../../data/trainerDb';

type TimeFilter = '7D' | '30D' | 'ALL';
type PositionFilter = 'ALL' | 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
type TableMetric = 'solvr' | 'accuracy';
type EquityCardSlot = EquityCard | null;
type SessionSummary = {
  id: number;
  startedAt: number;
  endedAt: number;
  hands: number;
  correct: number;
  accuracy: number | null;
  score: number | null;
  decisions: PerformanceDecision[];
  filterLabel: string;
};

type StreakSummary = {
  todayHands: number;
  progress: number;
  goalMet: boolean;
  currentStreak: number;
};

type GroupStats = {
  key: string;
  label: string;
  hands: number;
  correct: number;
  scoreTotal: number;
  score: number | null;
  accuracy: number | null;
  weakestSpot?: string;
  spots?: Partial<Record<Exclude<SpotTypeFilter, 'ANY'>, GroupStats>>;
};

const positions: Exclude<PositionFilter, 'ALL'>[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const equityRanks: CardRank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const equitySuits: Array<{ label: string; value: CardSuit; color: string }> = [
  { label: '♠', value: 's', color: '#ede9ff' },
  { label: '♥', value: 'h', color: '#f87171' },
  { label: '♦', value: 'd', color: '#60a5fa' },
  { label: '♣', value: 'c', color: '#4ade80' },
];
const spotFilters: Array<{ label: string; value: SpotTypeFilter }> = [
  { label: 'All', value: 'ANY' },
  { label: 'RFI', value: 'RFI' },
  { label: 'VS Open', value: 'VO' },
  { label: 'VS 3Bet', value: 'V3B' },
  { label: 'VS 4Bet', value: 'V4B' },
];
const spotLabels: Record<Exclude<SpotTypeFilter, 'ANY'>, string> = {
  RFI: 'RFI',
  VO: 'VS Open',
  V3B: 'VS 3Bet',
  V4B: 'VS 4Bet',
};
export function HomeScreen() {
  const router = useRouter();
  const [view, setView] = useState<'home' | 'analytics' | 'equity' | 'sessions'>('home');
  const [decisions, setDecisions] = useState<PerformanceDecision[]>([]);
  const [performanceSessions, setPerformanceSessions] = useState<PerformanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30D');
  const [spotFilter, setSpotFilter] = useState<SpotTypeFilter>('ANY');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [selectedTablePosition, setSelectedTablePosition] = useState<PositionFilter | null>(null);
  const [showAnalyticsFilters, setShowAnalyticsFilters] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [tableMetric, setTableMetric] = useState<TableMetric>('solvr');
  const [dailyGoal, setDailyGoalState] = useState<DailyGoal>(10);

  const loadScores = useCallback(() => {
    let active = true;
    setLoading(true);
    Promise.all([getPerformanceDecisions(), getPerformanceSessions(), getDailyGoal()])
      .then(([decisionRows, sessionRows, savedDailyGoal]) => {
        if (active) {
          setDecisions(decisionRows);
          setPerformanceSessions(sessionRows);
          setDailyGoalState(savedDailyGoal);
        }
      })
      .catch(() => {
        if (active) {
          setDecisions([]);
          setPerformanceSessions([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadScores);

  const filtered = useMemo(() => {
    const now = Date.now();
    const minTime =
      timeFilter === 'ALL'
        ? 0
        : now - (timeFilter === '7D' ? 7 : 30) * 24 * 60 * 60 * 1000;

    return decisions.filter((decision) => {
      if (decision.timestamp < minTime) return false;
      if (spotFilter !== 'ANY' && decision.spot_type !== spotFilter) return false;
      if (positionFilter !== 'ALL' && decision.hero_position !== positionFilter) return false;
      return true;
    });
  }, [decisions, positionFilter, spotFilter, timeFilter]);

  const positionCards = useMemo(() => {
    return positions.map((position) => {
      const rows = filtered.filter((decision) => decision.hero_position === position);
      const stats = summarizeRows(position, position, rows);
      stats.weakestSpot = weakestSpotType(rows);
      return stats;
    });
  }, [filtered]);

  const filteredSummary = useMemo(() => summarizeRows('filtered', 'Selected Filters', filtered), [filtered]);

  const spotCards = useMemo(() => {
    return (['RFI', 'VO', 'V3B', 'V4B'] as const).map((spotType) => {
      return summarizeRows(spotType, spotLabels[spotType], filtered.filter((decision) => decision.spot_type === spotType));
    });
  }, [filtered]);

  const allTimePositionCards = useMemo(() => {
    return positions.map((position) => summarizeRows(position, position, decisions.filter((decision) => decision.hero_position === position)));
  }, [decisions]);
  const allTimeOverall = useMemo(() => summarizeRows('overall', 'Overall', decisions), [decisions]);
  const sessions = useMemo(() => buildSessionSummaries(decisions, performanceSessions), [decisions, performanceSessions]);
  const streak = useMemo(() => buildStreakSummary(decisions, dailyGoal), [dailyGoal, decisions]);

  if (view === 'analytics') {
    return (
      <AnalyticsView
        loading={loading}
        timeFilter={timeFilter}
        spotFilter={spotFilter}
        positionFilter={positionFilter}
        selectedTablePosition={selectedTablePosition}
        filteredSummary={filteredSummary}
        tableMetric={tableMetric}
        positionCards={positionCards}
        spotCards={spotCards}
        onBack={() => setView('home')}
        onTimeChange={setTimeFilter}
        onSpotChange={setSpotFilter}
        onPositionChange={setPositionFilter}
        onTablePositionPress={(position) =>
          setSelectedTablePosition((current) => (current === position ? null : position))
        }
        onTablePopoverClose={() => setSelectedTablePosition(null)}
        showFilters={showAnalyticsFilters}
        onToggleFilters={() => setShowAnalyticsFilters((current) => !current)}
        onTableMetricChange={setTableMetric}
      />
    );
  }

  if (view === 'equity') {
    return <EquityCalculatorView onBack={() => setView('home')} />;
  }

  if (view === 'sessions') {
    return <SessionsView loading={loading} sessions={sessions} onBack={() => setView('home')} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.subscriptionStatus}>
          <Text style={styles.subscriptionStatusLabel}>Plan</Text>
          <Text style={styles.subscriptionStatusValue}>Free</Text>
        </View>
        <Text style={styles.title}>Solvr</Text>
        <Pressable
          onPress={() => setShowStreakModal(true)}
          style={({ pressed }) => [styles.streakButton, pressed && styles.analyticsCardPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Daily streak. ${streak.todayHands} of ${dailyGoal} hands complete today.`}
        >
          <Text style={styles.streakIcon}>🔥</Text>
          <View style={styles.streakTrack}>
            <View style={[styles.streakFill, { width: `${Math.round(streak.progress * 100)}%` }]} />
          </View>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setView('analytics')}
        style={({ pressed }) => [styles.analyticsCard, pressed && styles.analyticsCardPressed]}
      >
        <LinearGradient
          colors={['#b43ee5', '#8b5cf6', '#6c2ed2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <MiniPositionTable positions={allTimePositionCards} overallScore={allTimeOverall.score} />
        <Text style={styles.statsTapHint}>Tap to review</Text>
      </Pressable>

      <Pressable
        onPress={() => setView('equity')}
        style={({ pressed }) => [styles.equityCard, pressed && styles.analyticsCardPressed]}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEyebrow}>Equity Calculator</Text>
          <View style={styles.cardCtaPill}>
            <Text style={styles.cardCtaText}>Open</Text>
            <Text style={styles.cardCtaArrow}>{'>'}</Text>
          </View>
        </View>
        <Text style={styles.cardTapHint}>Compare two exact hands using preflop equity data</Text>
      </Pressable>

      <Pressable
        onPress={() => setView('sessions')}
        style={({ pressed }) => [styles.sessionsCard, pressed && styles.analyticsCardPressed]}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEyebrow}>Sessions</Text>
          <View style={styles.cardCtaPill}>
            <Text style={styles.cardCtaText}>Open</Text>
            <Text style={styles.cardCtaArrow}>{'>'}</Text>
          </View>
        </View>
        <View style={styles.sessionPreviewStats}>
          <View style={styles.sessionPreviewStat}>
            <Text style={styles.sessionPreviewValue}>{sessions.length}</Text>
            <Text style={styles.sessionPreviewLabel}>Sessions</Text>
          </View>
          <View style={styles.sessionPreviewStat}>
            <Text style={styles.sessionPreviewValue}>{decisions.length}</Text>
            <Text style={styles.sessionPreviewLabel}>Hands</Text>
          </View>
          <View style={styles.sessionPreviewStat}>
            <Text style={styles.sessionPreviewValue}>{formatScore(allTimeOverall.score)}</Text>
            <Text style={styles.sessionPreviewLabel}>Solvr</Text>
          </View>
        </View>
        <Text style={styles.cardTapHint}>Review session filters, accuracy, and Solvr scores</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/train')}
        style={({ pressed }) => [styles.startTrainingButton, pressed && styles.analyticsCardPressed]}
      >
        <Text style={styles.startTrainingText}>Start Training</Text>
      </Pressable>

      <Modal
        visible={showStreakModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStreakModal(false)}
      >
        <Pressable style={styles.infoModalBackdrop} onPress={() => setShowStreakModal(false)}>
          <Pressable style={styles.infoModalCard}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>Daily Streak</Text>
              <Pressable onPress={() => setShowStreakModal(false)} style={styles.infoModalClose}>
                <Text style={styles.infoModalCloseText}>x</Text>
              </Pressable>
            </View>
            <View style={styles.streakModalHero}>
              <Text style={styles.streakModalIcon}>🔥</Text>
              <Text style={styles.streakModalValue}>{streak.currentStreak}</Text>
              <Text style={styles.streakModalLabel}>
                {streak.currentStreak === 1 ? 'day streak' : 'day streak'}
              </Text>
            </View>
            <View style={styles.streakModalProgress}>
              <View style={styles.streakModalProgressTop}>
                <Text style={styles.streakModalProgressLabel}>Today</Text>
                <Text style={styles.streakModalProgressValue}>
                  {Math.min(streak.todayHands, dailyGoal)}/{dailyGoal} hands
                </Text>
              </View>
              <View style={styles.streakModalTrack}>
                <View style={[styles.streakModalFill, { width: `${Math.round(streak.progress * 100)}%` }]} />
              </View>
            </View>
            <Text style={styles.infoModalText}>
              Complete {dailyGoal} trainer hands in a day to light the streak bar.
              {streak.goalMet ? ' Today is already counted.' : ' Keep going to count today.'}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function AnalyticsView({
  loading,
  timeFilter,
  spotFilter,
  positionFilter,
  selectedTablePosition,
  filteredSummary,
  tableMetric,
  positionCards,
  spotCards,
  onBack,
  onTimeChange,
  onSpotChange,
  onPositionChange,
  onTablePositionPress,
  onTablePopoverClose,
  showFilters,
  onToggleFilters,
  onTableMetricChange,
}: {
  loading: boolean;
  timeFilter: TimeFilter;
  spotFilter: SpotTypeFilter;
  positionFilter: PositionFilter;
  selectedTablePosition: PositionFilter | null;
  filteredSummary: GroupStats;
  tableMetric: TableMetric;
  positionCards: GroupStats[];
  spotCards: GroupStats[];
  onBack: () => void;
  onTimeChange: (value: TimeFilter) => void;
  onSpotChange: (value: SpotTypeFilter) => void;
  onPositionChange: (value: PositionFilter) => void;
  onTablePositionPress: (value: PositionFilter) => void;
  onTablePopoverClose: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  onTableMetricChange: (value: TableMetric) => void;
}) {
  const activeFilterLabel = [
    timeFilter === 'ALL' ? 'All time' : timeFilter,
    spotFilter === 'ANY' ? 'All spots' : spotLabels[spotFilter],
    positionFilter === 'ALL' ? 'All positions' : positionFilter,
  ].join(' · ');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.analyticsHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <MetricToggle value={tableMetric} onChange={onTableMetricChange} />
      </View>

      <PositionScoreTable
        loading={loading}
        positions={positionCards}
        metric={tableMetric}
        selectedPosition={selectedTablePosition}
        onPositionPress={onTablePositionPress}
        onPopoverClose={onTablePopoverClose}
      />

      <FilterSummary stats={filteredSummary} />

      <Pressable onPress={onToggleFilters} style={styles.filterButton}>
        <View>
          <Text style={styles.filterButtonTitle}>Filters</Text>
          <Text style={styles.filterButtonSubtitle}>{activeFilterLabel}</Text>
        </View>
        <Text style={styles.filterButtonIcon}>{showFilters ? '^' : 'v'}</Text>
      </Pressable>

      {showFilters && (
        <View style={styles.filterPanel}>
          <FilterRow
            label="Time"
            value={timeFilter}
            options={[
              { label: '7D', value: '7D' },
              { label: '30D', value: '30D' },
              { label: 'All', value: 'ALL' },
            ]}
            onChange={onTimeChange}
          />
          <FilterRow label="Spot Type" value={spotFilter} options={spotFilters} onChange={onSpotChange} />
          <FilterRow
            label="Position"
            value={positionFilter}
            options={[
              { label: 'All', value: 'ALL' },
              ...positions.map((position) => ({ label: position, value: position })),
            ]}
            onChange={onPositionChange}
          />
        </View>
      )}

      <SectionTitle title="Spot Cards" />
      <View style={styles.cardGrid}>
        {spotCards.map((card) => (
          <ScoreCard key={card.key} stats={card} summary={summaryLine(card)} />
        ))}
      </View>
    </ScrollView>
  );
}

function SessionsView({
  loading,
  sessions,
  onBack,
}: {
  loading: boolean;
  sessions: SessionSummary[];
  onBack: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.analyticsHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      </View>

      <View style={styles.sessionsHeader}>
        <Text style={styles.equityTitle}>Sessions</Text>
        <Text style={styles.sessionsSubtitle}>Review session filters, accuracy, and Solvr score.</Text>
      </View>

      {loading ? (
        <Text style={styles.emptyText}>Loading sessions...</Text>
      ) : sessions.length === 0 ? (
        <Text style={styles.emptyText}>No sessions yet. Train a few hands and they will appear here.</Text>
      ) : (
        <View style={styles.sessionList}>
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} onPress={() => setSelectedSessionId(session.id)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SessionCard({ session, onPress }: { session: SessionSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sessionCard, pressed && styles.analyticsCardPressed]}>
      {session.filterLabel ? <Text style={styles.sessionMeta}>{session.filterLabel}</Text> : null}
      <View style={styles.sessionStatRow}>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{session.hands}</Text>
          <Text style={styles.sessionStatLabel}>Hands</Text>
        </View>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{formatAccuracy(session.accuracy)}</Text>
          <Text style={styles.sessionStatLabel}>Accuracy</Text>
        </View>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{formatScore(session.score)}</Text>
          <Text style={styles.sessionStatLabel}>Solvr</Text>
        </View>
      </View>
    </Pressable>
  );
}

function SessionDetailView({ session, onBack }: { session: SessionSummary; onBack: () => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.analyticsHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Sessions</Text>
        </Pressable>
      </View>

      <View style={styles.sessionsHeader}>
        <Text style={styles.equityTitle}>Session Details</Text>
        {session.filterLabel ? <Text style={styles.sessionsSubtitle}>{session.filterLabel}</Text> : null}
      </View>

      <View style={styles.sessionStatRow}>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{formatScore(session.score)}</Text>
          <Text style={styles.sessionStatLabel}>Solvr</Text>
        </View>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{formatAccuracy(session.accuracy)}</Text>
          <Text style={styles.sessionStatLabel}>Accuracy</Text>
        </View>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatValue}>{session.correct}/{session.hands}</Text>
          <Text style={styles.sessionStatLabel}>Correct</Text>
        </View>
      </View>

      <View style={styles.handLogList}>
        {session.decisions.map((decision) => (
          <HandLogRow key={decision.id} decision={decision} />
        ))}
      </View>
    </ScrollView>
  );
}

function HandLogRow({ decision }: { decision: PerformanceDecision }) {
  const correct = Boolean(decision.was_correct);
  const expected = decision.dominant_action ?? 'Mixed';

  return (
    <View style={styles.handLogRow}>
      <View style={styles.handLogMain}>
        <Text style={styles.handLogTitle}>{decision.hand_class} · {handContext(decision)}</Text>
        <Text style={styles.handLogDetail}>
          Chose {decision.action_taken} · Solver {expected} · {decision.chosen_freq.toFixed(0)}% chosen freq
        </Text>
      </View>
      <View style={[styles.handResultPill, correct ? styles.handResultCorrect : styles.handResultMiss]}>
        <Text style={styles.handResultText}>{correct ? 'Right' : 'Miss'}</Text>
        <Text style={styles.handResultScore}>{formatScore(decision.solvr_score)}</Text>
      </View>
    </View>
  );
}

function EquityCalculatorView({ onBack }: { onBack: () => void }) {
  const [player1, setPlayer1] = useState<[EquityCardSlot, EquityCardSlot]>([null, null]);
  const [player2, setPlayer2] = useState<[EquityCardSlot, EquityCardSlot]>([null, null]);
  const [activeSlot, setActiveSlot] = useState<0 | 1 | 2 | 3>(0);
  const [result, setResult] = useState<EquityLookupResult | null>(null);
  const [equityError, setEquityError] = useState<string | null>(null);
  const [loadingEquity, setLoadingEquity] = useState(false);
  const [pendingRank, setPendingRank] = useState<CardRank | null>(null);
  const [pendingSuit, setPendingSuit] = useState<CardSuit | null>(null);
  const [showEquityInfo, setShowEquityInfo] = useState(false);

  const allCards: EquityCardSlot[] = [...player1, ...player2];
  const pendingCard = {
    rank: allCards[activeSlot]?.rank ?? pendingRank,
    suit: allCards[activeSlot]?.suit ?? pendingSuit,
  };
  const selectedCards = allCards.filter((card): card is EquityCard => card != null);
  const incomplete = selectedCards.length < 4;
  const duplicate = new Set(selectedCards.map(cardToString)).size !== selectedCards.length;
  const selectedByOtherSlots = useMemo(() => {
    return new Set(
      allCards
        .map((card, index) => ({ card, index }))
        .filter((item): item is { card: EquityCard; index: number } => item.card != null && item.index !== activeSlot)
        .map((item) => cardToString(item.card)),
    );
  }, [activeSlot, allCards]);
  const activeCard = allCards[activeSlot];

  const runLookup = useCallback(() => {
    if (incomplete) {
      setResult(null);
      setEquityError('Select all four cards first.');
      return;
    }
    if (duplicate) {
      setResult(null);
      setEquityError('Choose four different cards.');
      return;
    }

    setLoadingEquity(true);
    setEquityError(null);
    lookupEquity(player1 as [EquityCard, EquityCard], player2 as [EquityCard, EquityCard])
      .then((row) => {
        setResult(row);
        if (!row) setEquityError('No equity row found for this canonical matchup.');
      })
      .catch((err) => {
        setResult(null);
        setEquityError(err instanceof Error ? err.message : 'Could not open equity database.');
      })
      .finally(() => setLoadingEquity(false));
  }, [duplicate, incomplete, player1, player2]);

  function updateActiveCard(patch: Partial<EquityCard>) {
    const nextRank = patch.rank ?? allCards[activeSlot]?.rank ?? pendingRank;
    const nextSuit = patch.suit ?? allCards[activeSlot]?.suit ?? pendingSuit;
    setResult(null);
    setEquityError(null);
    setPendingRank(nextRank ?? null);
    setPendingSuit(nextSuit ?? null);
    if (!nextRank || !nextSuit) return;

    const nextCard = { rank: nextRank, suit: nextSuit };
    if (activeSlot < 2) {
      setPlayer1((current) => {
        const next = [...current] as [EquityCardSlot, EquityCardSlot];
        next[activeSlot as 0 | 1] = nextCard;
        return next;
      });
    } else {
      setPlayer2((current) => {
        const next = [...current] as [EquityCardSlot, EquityCardSlot];
        next[(activeSlot - 2) as 0 | 1] = nextCard;
        return next;
      });
    }
    setPendingRank(null);
    setPendingSuit(null);
  }

  function randomFill() {
    const selected = new Set(selectedCards.map(cardToString));
    const deck = equityRanks.flatMap((rank) => equitySuits.map((suit) => ({ rank, suit: suit.value }) as EquityCard));
    const available = deck.filter((card) => !selected.has(cardToString(card)));
    for (let i = available.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const nextCards = [...allCards];
    let deckIndex = 0;
    for (let i = 0; i < nextCards.length; i += 1) {
      if (!nextCards[i]) {
        nextCards[i] = available[deckIndex];
        deckIndex += 1;
      }
    }
    setPlayer1([nextCards[0], nextCards[1]]);
    setPlayer2([nextCards[2], nextCards[3]]);
    setPendingRank(null);
    setPendingSuit(null);
    setResult(null);
    setEquityError(null);
  }

  function clearCards() {
    setPlayer1([null, null]);
    setPlayer2([null, null]);
    setActiveSlot(0);
    setPendingRank(null);
    setPendingSuit(null);
    setResult(null);
    setEquityError(null);
  }

  function selectSlot(slot: 0 | 1 | 2 | 3) {
    setActiveSlot(slot);
    setPendingRank(null);
    setPendingSuit(null);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.analyticsHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </Pressable>
      </View>

      <View style={styles.equityPanel}>
        <View style={styles.equityTitleRow}>
          <Text style={styles.equityTitle}>Equity Calculator</Text>
          <Pressable onPress={() => setShowEquityInfo(true)} style={styles.equityInfoButton}>
            <Text style={styles.equityInfoButtonText}>?</Text>
          </Pressable>
        </View>

        <View style={styles.equityActionsRow}>
          <Pressable onPress={randomFill} style={styles.secondaryEquityButton}>
            <Text style={styles.secondaryEquityButtonText}>Random</Text>
          </Pressable>
          <Pressable onPress={clearCards} style={styles.secondaryEquityButton}>
            <Text style={styles.secondaryEquityButtonText}>Clear</Text>
          </Pressable>
        </View>

        <View style={styles.handSelectorRow}>
          <EquityHandCards
            label="Hero"
            cards={player1}
            activeOffset={activeSlot}
            offsetStart={0}
            onSelect={selectSlot}
          />
          <Text style={styles.equityVs}>vs</Text>
          <EquityHandCards
            label="Villain"
            cards={player2}
            activeOffset={activeSlot}
            offsetStart={2}
            onSelect={selectSlot}
          />
        </View>

        <View style={styles.cardPicker}>
          <Text style={styles.pickerLabel}>Rank</Text>
          <View style={styles.rankGrid}>
            {equityRanks.map((rank) => (
              (() => {
                const blocked = pendingCard.suit
                  ? selectedByOtherSlots.has(`${rank}${pendingCard.suit}`)
                  : false;
                return (
                  <Pressable
                    key={rank}
                    disabled={blocked}
                    onPress={() => updateActiveCard({ rank })}
                    style={[
                      styles.rankButton,
                      pendingCard.rank === rank && styles.rankButtonActive,
                      blocked && styles.pickerButtonBlocked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rankButtonText,
                        pendingCard.rank === rank && styles.rankButtonTextActive,
                        blocked && styles.pickerButtonTextBlocked,
                      ]}
                    >
                      {rank}
                    </Text>
                  </Pressable>
                );
              })()
            ))}
          </View>

          <Text style={styles.pickerLabel}>Suit</Text>
          <View style={styles.suitRow}>
            {equitySuits.map((suit) => (
              (() => {
                const blocked = pendingCard.rank
                  ? selectedByOtherSlots.has(`${pendingCard.rank}${suit.value}`)
                  : false;
                return (
                  <Pressable
                    key={suit.value}
                    disabled={blocked}
                    onPress={() => updateActiveCard({ suit: suit.value })}
                    style={[
                      styles.suitButton,
                      pendingCard.suit === suit.value && styles.suitButtonActive,
                      blocked && styles.pickerButtonBlocked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.suitButtonText,
                        { color: suit.color },
                        blocked && styles.pickerButtonTextBlocked,
                      ]}
                    >
                      {suit.label}
                    </Text>
                  </Pressable>
                );
              })()
            ))}
          </View>
        </View>

        <Pressable
          disabled={loadingEquity || duplicate || incomplete}
          onPress={runLookup}
          style={[styles.calculateButton, (loadingEquity || duplicate || incomplete) && styles.calculateButtonDisabled]}
        >
          <Text style={styles.calculateButtonText}>{loadingEquity ? 'Calculating...' : 'Calculate Equity'}</Text>
        </Pressable>
      </View>

      <View style={styles.equityResults}>
        {equityError ? (
          <Text style={styles.errorText}>{equityError}</Text>
        ) : result ? (
          <>
            <EquityResultCard
              label="Hero"
              hand={`${cardToString(player1[0] as EquityCard)}${cardToString(player1[1] as EquityCard)}`}
              opponent={`${cardToString(player2[0] as EquityCard)}${cardToString(player2[1] as EquityCard)}`}
              win={result.player1Win}
              lose={result.player1Lose}
              tie={result.tie}
            />
            <Text style={styles.canonicalKey}>Key: {result.key} · {result.sims.toLocaleString()} sims</Text>
          </>
        ) : (
          <Text style={styles.emptyText}>Select four cards, then calculate equity.</Text>
        )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={showEquityInfo}
        onRequestClose={() => setShowEquityInfo(false)}
      >
        <Pressable style={styles.infoModalBackdrop} onPress={() => setShowEquityInfo(false)}>
          <Pressable style={styles.infoModalCard}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>Equity Calculator</Text>
              <Pressable onPress={() => setShowEquityInfo(false)} style={styles.infoModalClose}>
                <Text style={styles.infoModalCloseText}>x</Text>
              </Pressable>
            </View>
            <Text style={styles.infoModalText}>
              Select exact hole cards for Hero and Villain. Hands are canonicalized before querying equity_table.db.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function EquityHandCards({
  label,
  cards,
  activeOffset,
  offsetStart,
  onSelect,
}: {
  label: string;
  cards: [EquityCardSlot, EquityCardSlot];
  activeOffset: number;
  offsetStart: 0 | 2;
  onSelect: (slot: 0 | 1 | 2 | 3) => void;
}) {
  return (
    <View style={styles.equityHandBlock}>
      <Text style={styles.equityHandLabel}>{label}</Text>
      <View style={styles.equityCardsRow}>
        {cards.map((card, index) => {
          const slot = (offsetStart + index) as 0 | 1 | 2 | 3;
          return (
            <Pressable
              key={slot}
              onPress={() => onSelect(slot)}
              style={[
                styles.equityCardFace,
                !card && styles.equityCardFaceEmpty,
                activeOffset === slot && styles.equityCardFaceActive,
              ]}
            >
              {card ? (
                <PokerCard
                  card={toPlayingCard(card)}
                  cardIndex={(index as 0 | 1)}
                  dealKey={`${card.rank}${card.suit}-${slot}`}
                />
              ) : (
                <Text style={styles.emptyCardText}>Select</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EquityResultCard({
  label,
  hand,
  opponent,
  win,
  lose,
  tie,
}: {
  label: string;
  hand: string;
  opponent: string;
  win: number;
  lose: number;
  tie: number;
}) {
  const winShare = Math.max(0, Math.min(1, win));
  const tieShare = Math.max(0, Math.min(1, tie));
  const loseShare = Math.max(0, Math.min(1, lose));

  return (
    <View style={styles.equityResultCard}>
      <View style={styles.equityResultHeader}>
        <Text style={styles.equityResultLabel}>{label}</Text>
        <Text style={styles.equityResultHand}>{hand} vs {opponent}</Text>
      </View>
      <View style={styles.equityBar}>
        <View style={[styles.equityBarSegment, styles.equityBarWin, { flex: winShare }]} />
        <View style={[styles.equityBarSegment, styles.equityBarTie, { flex: tieShare }]} />
        <View style={[styles.equityBarSegment, styles.equityBarLose, { flex: loseShare }]} />
      </View>
      <View style={styles.equityMetricRow}>
        <View style={styles.equityMetric}>
          <Text style={styles.equityMetricValue}>{percent(win)}</Text>
          <Text style={styles.equityMetricLabel}>Win</Text>
        </View>
        <View style={styles.equityMetric}>
          <Text style={styles.equityMetricValue}>{percent(lose)}</Text>
          <Text style={styles.equityMetricLabel}>Lose</Text>
        </View>
        <View style={styles.equityMetric}>
          <Text style={styles.equityMetricValue}>{percent(tie)}</Text>
          <Text style={styles.equityMetricLabel}>Tie</Text>
        </View>
      </View>
    </View>
  );
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.filterPill, active && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function MetricToggle({
  value,
  onChange,
}: {
  value: TableMetric;
  onChange: (value: TableMetric) => void;
}) {
  return (
    <View style={styles.metricToggle}>
      <Pressable
        onPress={() => onChange('solvr')}
        style={[styles.metricToggleOption, value === 'solvr' && styles.metricToggleOptionActive]}
      >
        <Text style={[styles.metricToggleText, value === 'solvr' && styles.metricToggleTextActive]}>Solvr</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('accuracy')}
        style={[styles.metricToggleOption, value === 'accuracy' && styles.metricToggleOptionActive]}
      >
        <Text style={[styles.metricToggleText, value === 'accuracy' && styles.metricToggleTextActive]}>Acc</Text>
      </Pressable>
    </View>
  );
}

function FilterSummary({ stats }: { stats: GroupStats }) {
  return (
    <View style={styles.filterSummary}>
      <View style={styles.filterSummaryItem}>
        <Text style={styles.filterSummaryValue}>{formatScore(stats.score)}</Text>
        <Text style={styles.filterSummaryLabel}>Solvr</Text>
      </View>
      <View style={styles.filterSummaryDivider} />
      <View style={styles.filterSummaryItem}>
        <Text style={styles.filterSummaryValue}>{formatAccuracy(stats.accuracy)}</Text>
        <Text style={styles.filterSummaryLabel}>Accuracy</Text>
      </View>
      <View style={styles.filterSummaryDivider} />
      <View style={styles.filterSummaryItem}>
        <Text style={styles.filterSummaryValue}>{stats.hands}</Text>
        <Text style={styles.filterSummaryLabel}>Hands</Text>
      </View>
    </View>
  );
}

function PositionScoreTable({
  loading,
  positions: positionStats,
  metric,
  selectedPosition,
  onPositionPress,
  onPopoverClose,
}: {
  loading: boolean;
  positions: GroupStats[];
  metric: TableMetric;
  selectedPosition: PositionFilter | null;
  onPositionPress: (value: PositionFilter) => void;
  onPopoverClose: () => void;
}) {
  const byPosition = new Map(positionStats.map((position) => [position.key, position]));
  const selectedStats =
    selectedPosition && selectedPosition !== 'ALL'
      ? byPosition.get(selectedPosition) ?? summarizeRows(selectedPosition, selectedPosition, [])
      : null;

  return (
    <View style={styles.positionTableWrap}>
      <View style={styles.positionTable}>
        <View style={styles.innerFelt} />
        {positions.map((position) => {
          const stats = byPosition.get(position) ?? summarizeRows(position, position, []);
          return (
            <Pressable
              key={position}
              onPress={() => onPositionPress(position)}
              style={[
                styles.positionSeat,
                positionSeatStyle(position),
                { backgroundColor: scoreColor(metricValue(stats, metric)) },
                selectedPosition === position && styles.positionSeatSelected,
              ]}
            >
              <Text style={styles.positionScore}>{formatMetric(stats, metric)}</Text>
              <Text style={styles.positionLabel}>{position}</Text>
            </Pressable>
          );
        })}

        {selectedStats && (
          <View style={styles.positionPopover}>
            <View style={styles.popoverHeader}>
              <Text style={styles.popoverTitle}>{selectedStats.label}</Text>
              <Pressable onPress={onPopoverClose} style={styles.popoverClose}>
                <Text style={styles.popoverCloseText}>x</Text>
              </Pressable>
            </View>
            <View style={styles.popoverStats}>
              <View>
                <Text style={styles.popoverValue}>{formatScore(selectedStats.score)}</Text>
                <Text style={styles.popoverLabel}>Solvr</Text>
              </View>
              <View>
                <Text style={styles.popoverValue}>{formatAccuracy(selectedStats.accuracy)}</Text>
                <Text style={styles.popoverLabel}>Accuracy</Text>
              </View>
              <View>
                <Text style={styles.popoverValue}>{selectedStats.hands}</Text>
                <Text style={styles.popoverLabel}>Hands</Text>
              </View>
            </View>
            <View style={styles.popoverSpotList}>
              {(['RFI', 'VO', 'V3B', 'V4B'] as const).map((spotType) => {
                const spot = selectedStats.spots?.[spotType];
                return (
                  <View key={spotType} style={styles.popoverSpotRow}>
                    <Text style={styles.popoverSpotLabel}>{spotLabels[spotType]}</Text>
                    <Text style={styles.popoverSpotValue}>
                      {spot ? `${formatScore(spot.score)} · ${spot.hands}` : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {loading && !selectedStats && <Text style={styles.tableLoading}>Loading...</Text>}
      </View>
    </View>
  );
}

function MiniPositionTable({
  positions: positionStats,
  overallScore,
}: {
  positions: GroupStats[];
  overallScore: number | null;
}) {
  const byPosition = new Map(positionStats.map((position) => [position.key, position]));

  return (
    <View style={styles.miniTable}>
      <View style={styles.miniInnerFelt} />
      <View style={styles.miniCenterScore}>
        <Text style={styles.miniCenterValue}>{formatScore(overallScore)}</Text>
      </View>
      {positions.map((position) => {
        const stats = byPosition.get(position) ?? summarizeRows(position, position, []);
        return (
          <View
            key={position}
            style={[
              styles.miniSeat,
              miniSeatStyle(position),
              { backgroundColor: scoreColor(stats.score) },
            ]}
          >
            <Text style={styles.miniSeatScore}>{formatScore(stats.score)}</Text>
            <Text style={styles.miniSeatLabel}>{position}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ScoreCard({ stats, summary }: { stats: GroupStats; summary: string }) {
  return (
    <View style={[styles.scoreCard, { backgroundColor: scoreColor(stats.score) }]}>
      <Text style={styles.bigScore}>{formatScore(stats.score)}</Text>
      <Text style={styles.scoreCardLabel}>{stats.label}</Text>
      <Text style={styles.scoreCardMeta}>{stats.hands} hands · {formatAccuracy(stats.accuracy)} accuracy</Text>
      <Text style={styles.scoreCardSummary}>{summary}</Text>
    </View>
  );
}

function buildSessionSummaries(rows: PerformanceDecision[], sessionRows: PerformanceSession[]): SessionSummary[] {
  const bySession = new Map<number, PerformanceDecision[]>();
  for (const row of rows) {
    bySession.set(row.session_id, [...(bySession.get(row.session_id) || []), row]);
  }
  const sessionMeta = new Map(sessionRows.map((session) => [session.id, session]));

  return Array.from(bySession.entries())
    .map(([id, decisionRows]) => {
      const meta = sessionMeta.get(id);
      const orderedRows = [...decisionRows].sort((a, b) => a.timestamp - b.timestamp);
      const stats = summarizeRows(String(id), `Session ${id}`, orderedRows);
      return {
        id,
        startedAt: meta?.started_at ?? orderedRows[0]?.timestamp ?? 0,
        endedAt: meta?.ended_at ?? orderedRows[orderedRows.length - 1]?.timestamp ?? orderedRows[0]?.timestamp ?? 0,
        hands: stats.hands,
        correct: stats.correct,
        accuracy: stats.accuracy,
        score: stats.score,
        decisions: orderedRows,
        filterLabel: sessionFilterLabel(meta),
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

function sessionFilterLabel(session: PerformanceSession | undefined) {
  if (!session) return '';
  const filters: string[] = [];
  if (session.spot_type_filter !== 'ANY') {
    filters.push(spotLabels[session.spot_type_filter as Exclude<SpotTypeFilter, 'ANY'>] ?? session.spot_type_filter);
  }

  let positionsFilter: string[] = [];
  try {
    const parsed = JSON.parse(session.position_filter);
    if (Array.isArray(parsed)) positionsFilter = parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    positionsFilter = [];
  }
  if (positionsFilter.length > 0 && positionsFilter.length < positions.length) {
    filters.push(positionsFilter.join(', '));
  }

  return filters.length > 0 ? filters.join(' · ') : '';
}

function summarizeRows(key: string, label: string, rows: PerformanceDecision[]): GroupStats {
  const scoreTotal = rows.reduce((sum, row) => sum + clampScore(row.solvr_score), 0);
  const correct = rows.reduce((sum, row) => sum + (row.was_correct ? 1 : 0), 0);
  const hands = rows.length;
  return {
    key,
    label,
    hands,
    correct,
    scoreTotal,
    score: hands > 0 ? scoreTotal / hands : null,
    accuracy: hands > 0 ? correct / hands : null,
    spots: summarizeSpots(rows),
  };
}

function summarizeSpots(rows: PerformanceDecision[]) {
  return (['RFI', 'VO', 'V3B', 'V4B'] as const).reduce<Partial<Record<Exclude<SpotTypeFilter, 'ANY'>, GroupStats>>>(
    (acc, spotType) => {
      const spotRows = rows.filter((row) => row.spot_type === spotType);
      if (spotRows.length > 0) acc[spotType] = summarizeRowsWithoutSpots(spotType, spotLabels[spotType], spotRows);
      return acc;
    },
    {},
  );
}

function summarizeRowsWithoutSpots(key: string, label: string, rows: PerformanceDecision[]): GroupStats {
  const scoreTotal = rows.reduce((sum, row) => sum + clampScore(row.solvr_score), 0);
  const correct = rows.reduce((sum, row) => sum + (row.was_correct ? 1 : 0), 0);
  const hands = rows.length;
  return {
    key,
    label,
    hands,
    correct,
    scoreTotal,
    score: hands > 0 ? scoreTotal / hands : null,
    accuracy: hands > 0 ? correct / hands : null,
  };
}

function weakestSpotType(rows: PerformanceDecision[]) {
  const groups = (['RFI', 'VO', 'V3B', 'V4B'] as const)
    .map((spotType) => summarizeRows(spotType, spotLabels[spotType], rows.filter((row) => row.spot_type === spotType)))
    .filter((group) => group.hands > 0 && group.score != null)
    .sort((a, b) => Number(a.score) - Number(b.score));
  return groups[0]?.label;
}

function handContext(row: PerformanceDecision) {
  if (row.spot_type === 'RFI') return `${row.hero_position} RFI`;
  if (row.spot_type === 'VO') return `${row.hero_position} vs ${row.opener_position} Open`;
  if (row.spot_type === 'V3B') return `${row.hero_position} vs ${row.opener_position} Open`;
  return `${row.hero_position} vs ${row.opener_position} 4Bet pot`;
}

function summaryLine(stats: GroupStats) {
  if (stats.hands === 0) return 'No attempts yet';
  if (Number(stats.score) >= 0.9) return 'Strong recent execution';
  if (Number(stats.score) >= 0.8) return 'Playable, with room to sharpen';
  return 'Review this spot soon';
}

function clampScore(value: number | null) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

function formatScore(score: number | null) {
  return score == null ? '-' : String(Math.round(clampScore(score) * 100));
}

function formatAccuracy(value: number | null) {
  return value == null ? '-' : `${Math.round(value * 100)}%`;
}

function metricValue(stats: GroupStats, metric: TableMetric) {
  return metric === 'accuracy' ? stats.accuracy : stats.score;
}

function formatMetric(stats: GroupStats, metric: TableMetric) {
  if (metric === 'accuracy') return stats.accuracy == null ? '-' : String(Math.round(stats.accuracy * 100));
  return formatScore(stats.score);
}

function scoreColor(score: number | null) {
  if (score == null) return C.surface;
  const pct = Math.round(clampScore(score) * 100);
  if (pct <= 70) return 'hsl(0, 58%, 26%)';
  if (pct < 80) return 'hsl(18, 62%, 34%)';
  if (pct < 90) return 'hsl(42, 68%, 38%)';
  if (pct < 100) return 'hsl(132, 52%, 30%)';
  return 'hsl(134, 72%, 42%)';
}

function positionSeatStyle(position: string) {
  if (position === 'UTG') return styles.seatUtg;
  if (position === 'HJ') return styles.seatHj;
  if (position === 'CO') return styles.seatCo;
  if (position === 'BTN') return styles.seatBtn;
  if (position === 'SB') return styles.seatSb;
  return styles.seatBb;
}

function miniSeatStyle(position: string) {
  if (position === 'UTG') return styles.miniSeatUtg;
  if (position === 'HJ') return styles.miniSeatHj;
  if (position === 'CO') return styles.miniSeatCo;
  if (position === 'BTN') return styles.miniSeatBtn;
  if (position === 'SB') return styles.miniSeatSb;
  return styles.miniSeatBb;
}

function redSuit(suit: CardSuit) {
  return suit === 'h' || suit === 'd';
}

function toPlayingCard(card: EquityCard): PlayingCard {
  return {
    rank: card.rank,
    suit:
      card.suit === 's'
        ? 'spades'
        : card.suit === 'h'
          ? 'hearts'
          : card.suit === 'd'
            ? 'diamonds'
            : 'clubs',
  };
}

function suitSymbol(suit: CardSuit) {
  if (suit === 's') return '♠';
  if (suit === 'h') return '♥';
  if (suit === 'd') return '♦';
  return '♣';
}

function percent(value: number) {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function buildStreakSummary(decisions: PerformanceDecision[], dailyGoal: number): StreakSummary {
  const countsByDay = new Map<string, number>();
  decisions.forEach((decision) => {
    const key = dayKey(decision.timestamp);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  });

  const today = startOfLocalDay(Date.now());
  const todayHands = countsByDay.get(dayKey(today.getTime())) ?? 0;
  const goalMet = todayHands >= dailyGoal;
  let streakCursor = goalMet ? today : addDays(today, -1);
  let currentStreak = 0;

  while ((countsByDay.get(dayKey(streakCursor.getTime())) ?? 0) >= dailyGoal) {
    currentStreak += 1;
    streakCursor = addDays(streakCursor, -1);
  }

  return {
    todayHands,
    progress: Math.min(1, todayHands / dailyGoal),
    goalMet,
    currentStreak,
  };
}

function dayKey(timestamp: number) {
  const day = startOfLocalDay(timestamp);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  homeContent: {
    gap: 22,
    padding: 20,
    paddingBottom: 36,
    paddingTop: 58,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 36,
    paddingTop: 48,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  subscriptionStatus: {
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    borderColor: 'rgba(196, 181, 253, 0.34)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 1,
    left: 0,
    width: 112,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    top: -2,
  },
  subscriptionStatusLabel: {
    color: C.textMuted,
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 10,
    textTransform: 'uppercase',
  },
  subscriptionStatusValue: {
    color: C.purplePale,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  analyticsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  subtitle: {
    color: C.textSec,
    fontSize: 15,
    lineHeight: 21,
  },
  streakButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(251, 146, 60, 0.12)',
    borderColor: 'rgba(251, 146, 60, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: -2,
    width: 112,
  },
  streakIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  streakTrack: {
    backgroundColor: 'rgba(251, 146, 60, 0.2)',
    borderRadius: 4,
    height: 5,
    overflow: 'hidden',
    width: '100%',
  },
  streakFill: {
    backgroundColor: '#fb923c',
    borderRadius: 4,
    height: '100%',
  },
  startTrainingButton: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  startTrainingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  analyticsCard: {
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    borderColor: 'rgba(237, 233, 254, 0.66)',
    borderRadius: 22,
    borderWidth: 2,
    gap: 12,
    minHeight: 250,
    overflow: 'hidden',
    padding: 16,
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 9,
  },
  analyticsCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  statsCardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  statsSummaryItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 11,
  },
  statsSummaryValue: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 27,
  },
  statsSummaryLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  statsOpenPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 54,
    paddingHorizontal: 15,
  },
  statsOpenText: {
    color: '#581c87',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statsOpenArrow: {
    color: '#581c87',
    fontSize: 15,
    fontWeight: '900',
  },
  statsTapHint: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  analyticsText: {
    flex: 1,
    gap: 7,
  },
  cardEyebrow: {
    color: C.purplePale,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardCtaPill: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  cardCtaText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardCtaArrow: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
  },
  cardTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: C.textSec,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTapHint: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  equityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(24,16,46,0.78)',
    borderColor: 'rgba(196,181,253,0.28)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    minHeight: 96,
    padding: 16,
  },
  sessionsCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(24,16,46,0.78)',
    borderColor: 'rgba(196,181,253,0.28)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    minHeight: 142,
    padding: 16,
  },
  sessionPreviewStats: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  sessionPreviewStat: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 9,
  },
  sessionPreviewValue: {
    color: C.text,
    fontSize: 19,
    fontWeight: '900',
  },
  sessionPreviewLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  miniTable: {
    backgroundColor: '#1a5c24',
    borderColor: '#0d2412',
    borderRadius: 999,
    borderWidth: 7,
    height: 190,
    position: 'relative',
    width: '100%',
  },
  miniInnerFelt: {
    backgroundColor: '#2e7d35',
    borderColor: '#174f1e',
    borderRadius: 999,
    borderWidth: 3,
    bottom: 5,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 5,
  },
  miniCenterScore: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    position: 'absolute',
    top: 72,
    width: 90,
  },
  miniCenterValue: {
    color: 'white',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 43,
  },
  miniSeat: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 999,
    borderWidth: 2,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    width: 74,
  },
  miniSeatUtg: {
    left: 12,
    top: 18,
  },
  miniSeatHj: {
    left: '50%',
    marginLeft: -37,
    top: -10,
  },
  miniSeatCo: {
    right: 12,
    top: 18,
  },
  miniSeatBtn: {
    bottom: 18,
    right: 12,
  },
  miniSeatSb: {
    bottom: -10,
    left: '50%',
    marginLeft: -37,
  },
  miniSeatBb: {
    bottom: 18,
    left: 12,
  },
  miniSeatScore: {
    color: 'white',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 19,
  },
  miniSeatLabel: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  backText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
  metricToggle: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  metricToggleOption: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricToggleOptionActive: {
    backgroundColor: C.purple,
  },
  metricToggleText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricToggleTextActive: {
    color: 'white',
  },
  filterBlock: {
    gap: 8,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  filterButtonTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
  filterButtonSubtitle: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  filterButtonIcon: {
    color: C.purplePale,
    fontSize: 16,
    fontWeight: '900',
    paddingLeft: 12,
  },
  sessionsHeader: {
    gap: 5,
  },
  sessionsSubtitle: {
    color: C.textSec,
    fontSize: 13,
    lineHeight: 19,
  },
  sessionList: {
    gap: 12,
  },
  sessionCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  sessionCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sessionHeaderText: {
    flex: 1,
    gap: 3,
  },
  sessionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '900',
  },
  sessionMeta: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
  },
  sessionStatRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sessionStat: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 10,
    flex: 1,
    paddingVertical: 7,
  },
  sessionStatValue: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sessionStatLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  handLogList: {
    gap: 8,
  },
  handLogRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(34, 21, 64, 0.56)',
    borderColor: 'rgba(196, 181, 253, 0.14)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  handLogMain: {
    flex: 1,
    gap: 3,
  },
  handLogTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  handLogDetail: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  handResultPill: {
    alignItems: 'center',
    borderRadius: 9,
    minWidth: 54,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  handResultCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.24)',
  },
  handResultMiss: {
    backgroundColor: 'rgba(240, 69, 69, 0.28)',
  },
  handResultText: {
    color: C.text,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  handResultScore: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  sessionMoreText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  equityPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  equityTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  equityTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: '900',
  },
  equityInfoButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  equityInfoButtonText: {
    color: C.purplePale,
    fontSize: 15,
    fontWeight: '900',
  },
  handSelectorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  equityHandBlock: {
    flex: 1,
    gap: 8,
  },
  equityHandLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  equityCardsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  equityCardFace: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 2,
    height: 99,
    justifyContent: 'center',
    width: 75,
  },
  equityCardFaceActive: {
    borderColor: C.gold,
  },
  equityCardFaceEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.32)',
    borderStyle: 'dashed',
  },
  emptyCardText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  equityVs: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '900',
    paddingTop: 22,
    textTransform: 'uppercase',
  },
  cardPicker: {
    gap: 10,
  },
  pickerLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  rankButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 38,
  },
  rankButtonActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  rankButtonText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '900',
  },
  rankButtonTextActive: {
    color: 'white',
  },
  pickerButtonBlocked: {
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.16)',
    opacity: 0.45,
  },
  pickerButtonTextBlocked: {
    color: C.textMuted,
  },
  suitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  suitButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  suitButtonActive: {
    borderColor: C.gold,
    borderWidth: 2,
  },
  suitButtonText: {
    fontSize: 22,
    fontWeight: '900',
  },
  equityActionsRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryEquityButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  secondaryEquityButtonText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  calculateButton: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  calculateButtonDisabled: {
    opacity: 0.45,
  },
  calculateButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
  },
  equityResults: {
    gap: 10,
  },
  equityResultCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  equityResultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  equityResultLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  equityResultHand: {
    color: C.text,
    fontSize: 19,
    fontWeight: '900',
  },
  equityBar: {
    backgroundColor: C.surface2,
    borderRadius: 999,
    flexDirection: 'row',
    height: 14,
    overflow: 'hidden',
    width: '100%',
  },
  equityBarSegment: {
    height: '100%',
  },
  equityBarWin: {
    backgroundColor: C.green,
  },
  equityBarTie: {
    backgroundColor: C.gold,
  },
  equityBarLose: {
    backgroundColor: C.red,
  },
  equityMetricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  equityMetric: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 10,
    flex: 1,
    gap: 2,
    paddingVertical: 10,
  },
  equityMetricValue: {
    color: C.text,
    fontSize: 18,
    fontWeight: '900',
  },
  equityMetricLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  infoModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 4, 16, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  infoModalCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    maxWidth: 360,
    padding: 16,
    width: '100%',
  },
  infoModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoModalTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '900',
  },
  infoModalClose: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  infoModalCloseText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '900',
  },
  infoModalText: {
    color: C.textSec,
    fontSize: 13,
    lineHeight: 19,
  },
  streakModalHero: {
    alignItems: 'center',
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
    borderColor: 'rgba(251, 146, 60, 0.34)',
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    padding: 16,
  },
  streakModalIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  streakModalValue: {
    color: C.text,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  streakModalLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  streakModalProgress: {
    gap: 8,
  },
  streakModalProgressTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakModalProgressLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  streakModalProgressValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
  },
  streakModalTrack: {
    backgroundColor: 'rgba(251, 146, 60, 0.18)',
    borderRadius: 6,
    height: 10,
    overflow: 'hidden',
  },
  streakModalFill: {
    backgroundColor: '#fb923c',
    borderRadius: 6,
    height: '100%',
  },
  canonicalKey: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  filterPanel: {
    backgroundColor: 'rgba(24,16,46,0.72)',
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 13,
    padding: 12,
  },
  positionTableWrap: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  positionTable: {
    alignSelf: 'center',
    backgroundColor: '#1a5c24',
    borderColor: '#0d2412',
    borderRadius: 999,
    borderWidth: 8,
    height: 150,
    maxWidth: 380,
    position: 'relative',
    width: '100%',
  },
  innerFelt: {
    backgroundColor: '#2e7d35',
    borderColor: '#174f1e',
    borderRadius: 999,
    borderWidth: 5,
    bottom: 8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  positionSeat: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 999,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    width: 64,
  },
  positionSeatSelected: {
    borderColor: 'white',
    borderWidth: 2,
  },
  seatUtg: {
    left: 20,
    top: 10,
  },
  seatHj: {
    left: '50%',
    marginLeft: -32,
    top: -2,
  },
  seatCo: {
    right: 20,
    top: 10,
  },
  seatBtn: {
    bottom: 10,
    right: 20,
  },
  seatSb: {
    bottom: -2,
    left: '50%',
    marginLeft: -32,
  },
  seatBb: {
    bottom: 10,
    left: 20,
  },
  positionScore: {
    color: 'white',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
  },
  positionLabel: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  positionPopover: {
    alignSelf: 'center',
    backgroundColor: 'rgba(13,9,24,0.94)',
    borderColor: 'rgba(196,181,253,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 10,
    position: 'absolute',
    top: 38,
    width: 210,
  },
  popoverHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  popoverTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
  popoverClose: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  popoverCloseText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
  },
  popoverStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  popoverValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  popoverLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  popoverSpotList: {
    gap: 4,
  },
  popoverSpotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  popoverSpotLabel: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
  },
  popoverSpotValue: {
    color: C.text,
    fontSize: 11,
    fontWeight: '900',
  },
  tableLoading: {
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '900',
    position: 'absolute',
    top: 64,
  },
  filterSummary: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: -4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterSummaryItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  filterSummaryValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
  },
  filterSummaryLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  filterSummaryDivider: {
    backgroundColor: C.border,
    height: 28,
    width: 1,
  },
  filterLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pillRow: {
    gap: 8,
    paddingRight: 16,
  },
  filterPill: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterPillActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  filterPillText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '900',
  },
  filterPillTextActive: {
    color: 'white',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 6,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreCard: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    minHeight: 128,
    padding: 14,
    width: '48%',
  },
  bigScore: {
    color: 'white',
    fontSize: 31,
    fontWeight: '900',
  },
  scoreCardLabel: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
  },
  scoreCardMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '800',
  },
  scoreCardSummary: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 4,
  },
  emptyText: {
    color: C.textSec,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: C.red,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  worstList: {
    gap: 10,
  },
  worstRow: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  worstMain: {
    flex: 1,
    gap: 3,
  },
  handTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '900',
  },
  handContext: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
  },
  mistakeText: {
    color: C.gold,
    fontSize: 12,
    fontWeight: '900',
  },
  scoreBadge: {
    alignItems: 'center',
    borderRadius: 10,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  scoreBadgeText: {
    color: 'white',
    fontSize: 19,
    fontWeight: '900',
  },
  scoreBadgeMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '800',
  },
});
