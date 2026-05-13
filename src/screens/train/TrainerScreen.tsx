import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { PokerTable } from '../../components/poker-table/PokerTable';
import { pokerTablePropsFromSpot } from '../../components/poker-table/trainerTableAdapter';
import type { PokerTableProps } from '../../components/poker-table/pokerTableTypes';
import { RangeGrid, RangeLegend } from '../../components/range-grid/RangeGrid';
import { C } from '../../constants/colors';
import {
  availableActionsForSpot,
  computeSolvrScore,
  dealRandomTrainerHand,
  formatBB,
  getActionFrequency,
  scenarioLabel,
  type SpotTypeFilter,
  type TrainerAction,
  type TrainerDeal,
} from '../../data/trainerDb';
import {
  endPerformanceSession,
  ensurePerformanceStore,
  savePerformanceDecision,
  startPerformanceSession,
} from '../../data/performanceStore';

const spotFilters: Array<{ label: string; value: SpotTypeFilter }> = [
  { label: 'Any', value: 'ANY' },
  { label: 'RFI', value: 'RFI' },
  { label: 'Open', value: 'VO' },
  { label: '3Bet', value: 'V3B' },
  { label: '4Bet', value: 'V4B' },
];

const allPositions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const TOP_CONTENT_OFFSET = 58;
const DEFAULT_TABLE_PROPS: PokerTableProps = {
  heroPos: 'BTN',
  openerPos: null,
  foldedPositions: ['UTG', 'HJ', 'CO'],
  blindAmounts: { SB: 0.5, BB: 1 },
  cards: null,
};
const FALLBACK_ACTIONS: TrainerAction[] = ['Fold', 'Call', 'Raise'];

export function TrainerScreen() {
  const db = useSQLiteContext();
  const [spotTypeFilter, setSpotTypeFilter] = useState<SpotTypeFilter>('ANY');
  const [posFilter, setPosFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [wrongPracticeMode, setWrongPracticeMode] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [phase, setPhase] = useState<'quiz' | 'result'>('quiz');
  const [deal, setDeal] = useState<TrainerDeal | null>(null);
  const [handLoading, setHandLoading] = useState(false);
  const [picked, setPicked] = useState<TrainerAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [solvrScore, setSolvrScore] = useState<{ sum: number; count: number }>({ sum: 0, count: 0 });
  const [lastHandScore, setLastHandScore] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [dealKey, setDealKey] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hintClosing, setHintClosing] = useState(false);
  const [filtersClosing, setFiltersClosing] = useState(false);
  const hintCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintCloseTimer.current) clearTimeout(hintCloseTimer.current);
      if (filtersCloseTimer.current) clearTimeout(filtersCloseTimer.current);
    };
  }, []);

  const beginSession = useCallback(async () => {
    await ensurePerformanceStore();
    const nextSessionId = await startPerformanceSession({
      spotTypeFilter,
      positionFilter: posFilter,
    });
    setSessionId(nextSessionId);
    return nextSessionId;
  }, [posFilter, spotTypeFilter]);

  useEffect(() => {
    beginSession().catch(() => {});
  }, [beginSession]);

  const loadHand = useCallback(async () => {
    setHandLoading(true);
    setError(null);
    try {
      const nextDeal = await dealRandomTrainerHand(db, spotTypeFilter, posFilter);
      if (!nextDeal) {
        setDeal(null);
        setError('No trainer spots found for this filter.');
        return;
      }
      setDeal(nextDeal);
      setPicked(null);
      setPhase('quiz');
      setShowHint(false);
      setHintClosing(false);
      setDealKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trainer.db.');
    } finally {
      setHandLoading(false);
    }
  }, [db, posFilter, spotTypeFilter]);

  useEffect(() => {
    loadHand();
  }, [loadHand]);

  const selectedCorrect = useMemo(() => {
    if (!deal || !picked) return false;
    return getActionFrequency(picked, deal.handFreq) > 0;
  }, [deal, picked]);

  function answer(action: TrainerAction) {
    if (!deal || phase === 'result') return;
    const correct = getActionFrequency(action, deal.handFreq) > 0;
    const score = computeSolvrScore(action, deal.handFreq);
    setShowHint(false);
    setHintClosing(false);
    setShowFilters(false);
    setFiltersClosing(false);
    setPicked(action);
    setPhase('result');
    setLastHandScore(score);
    setStats((current) => ({
      correct: current.correct + (correct ? 1 : 0),
      total: current.total + 1,
    }));
    setSolvrScore((current) => ({ sum: current.sum + score, count: current.count + 1 }));
    const currentSessionId = sessionId;
    const persistDecision = currentSessionId
      ? Promise.resolve(currentSessionId)
      : beginSession();
    persistDecision
      .then((id) =>
        savePerformanceDecision(id, {
          deal,
          action,
          wasCorrect: correct,
          solvrScore: score,
        }),
      )
      .catch(() => {});
  }

  function resetSessionStats() {
    endPerformanceSession(sessionId).catch(() => {});
    setStats({ correct: 0, total: 0 });
    setSolvrScore({ sum: 0, count: 0 });
    setLastHandScore(null);
    beginSession().catch(() => {});
  }

  function changeFilter(filter: SpotTypeFilter) {
    setWrongPracticeMode(false);
    setTestMode(false);
    setSpotTypeFilter(filter);
    setPosFilter([]);
  }

  function openHint() {
    if (hintCloseTimer.current) clearTimeout(hintCloseTimer.current);
    closeFilters();
    setHintClosing(false);
    setShowHint(true);
  }

  function closeHint() {
    if (!showHint || hintClosing) return;
    setHintClosing(true);
    if (hintCloseTimer.current) clearTimeout(hintCloseTimer.current);
    hintCloseTimer.current = setTimeout(() => {
      setShowHint(false);
      setHintClosing(false);
    }, 180);
  }

  function openFilters() {
    if (filtersCloseTimer.current) clearTimeout(filtersCloseTimer.current);
    closeHint();
    setFiltersClosing(false);
    setShowFilters(true);
  }

  function closeFilters() {
    if (!showFilters || filtersClosing) return;
    setFiltersClosing(true);
    if (filtersCloseTimer.current) clearTimeout(filtersCloseTimer.current);
    filtersCloseTimer.current = setTimeout(() => {
      setShowFilters(false);
      setFiltersClosing(false);
    }, 180);
  }

  function toggleFilters() {
    if (showFilters) closeFilters();
    else openFilters();
  }

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const sessionSolvr = solvrScore.count > 0 ? Math.round((solvrScore.sum / solvrScore.count) * 100) : null;
  const filterActive = testMode || wrongPracticeMode || posFilter.length > 0 || spotTypeFilter !== 'ANY';
  const availableActions = deal ? availableActionsForSpot(deal.hands) : FALLBACK_ACTIONS;
  const tableProps = deal ? pokerTablePropsFromSpot(deal.spot, deal.hand) : DEFAULT_TABLE_PROPS;
  const showQuizChrome = phase !== 'result';
  const overlayTop =
    (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0) +
    TOP_CONTENT_OFFSET +
    42;

  return (
    <View style={[styles.screen, phase === 'result' && (selectedCorrect ? styles.screenResultCorrect : styles.screenResultWrong)]}>
      {phase === 'result' && <FullScreenShimmer trigger={dealKey} />}
      <ScrollView
        style={[styles.screen, { backgroundColor: 'transparent' }]}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        {showQuizChrome && <View style={styles.filterHeader}>
        <Pressable
          onPress={() => {
            if (!deal || error) return;
            if (showHint) closeHint();
            else openHint();
          }}
          style={[styles.infoButton, showHint && styles.infoButtonActive]}
        >
          <Text style={styles.infoButtonText}>i</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          {testMode && (
            <>
              <Pressable onPress={() => setTestMode(false)} style={styles.smallHeaderButton}>
                <Text style={styles.smallHeaderButtonText}>Trainer</Text>
              </Pressable>
              <Pressable onPress={() => setTestMode(false)} style={styles.endTestButton}>
                <Text style={styles.endTestButtonText}>End Test</Text>
              </Pressable>
            </>
          )}

          {wrongPracticeMode && !testMode && (
            <Pressable onPress={() => setWrongPracticeMode(false)} style={styles.smallHeaderButton}>
              <Text style={styles.smallHeaderButtonText}>Trainer</Text>
            </Pressable>
          )}

          {!testMode && !wrongPracticeMode && (
            <>
              <View style={styles.statPill}>
                <Text style={styles.statPillText}>
                  {stats.correct}/{stats.total} - {accuracy}%{sessionSolvr !== null ? ` · S ${sessionSolvr}` : ''}
                </Text>
              </View>
              <Pressable onPress={resetSessionStats} style={styles.smallHeaderButton}>
                <Text style={styles.smallHeaderButtonText}>New Session</Text>
              </Pressable>
            </>
          )}
        </View>

        <AnimatedFiltersButton active={filterActive} onPress={toggleFilters} />
      </View>}

        {showQuizChrome && <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
            {
              width: `${testMode ? 0 : accuracy}%`,
              backgroundColor: testMode ? '#14b8a6' : wrongPracticeMode ? C.purpleLight : C.green,
            },
            ]}
          />
        </View>}

        {error ? (
        <View style={styles.statePanel}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadHand} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : deal && phase === 'result' ? (
        <TrainerResultView
          deal={deal}
          selectedCorrect={selectedCorrect}
          solvrScore={lastHandScore}
          onNextHand={loadHand}
        />
      ) : deal ? (
        <>
          <View style={styles.tableStage}>
            <PokerTable {...tableProps} dealKey={dealKey} />
          </View>

          <View style={styles.actionDock}>
            <View style={styles.actionGrid}>
              {availableActions.map((action) => {
                const active = picked === action;
                return (
                  <Pressable
                    key={action}
                    disabled={!deal || handLoading}
                    onPress={() => answer(action)}
                    style={[
                      styles.actionButton,
                      actionStyle(action),
                      active && styles.actionButtonPicked,
                      (!deal || handLoading) && styles.actionButtonDisabled,
                    ]}
                  >
                    <Text style={styles.actionText}>{actionLabel(action, deal?.spot.raiseBB ?? 0)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.tableStage}>
            <PokerTable {...tableProps} dealKey="initial" />
          </View>

          <View style={styles.actionDock}>
            <View style={styles.actionGrid}>
              {availableActions.map((action) => (
                <Pressable
                  key={action}
                  disabled
                  style={[styles.actionButton, actionStyle(action), styles.actionButtonDisabled]}
                >
                  <Text style={styles.actionText}>{actionLabel(action, 0)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}
      </ScrollView>

      {showFilters && (
        <TrainerFiltersOverlay
          closing={filtersClosing}
          onClose={closeFilters}
          top={overlayTop}
        >
          <TrainerFiltersPanel
            spotTypeFilter={spotTypeFilter}
            posFilter={posFilter}
            wrongPracticeMode={wrongPracticeMode}
            testMode={testMode}
            onSpotTypeChange={changeFilter}
            onPositionToggle={(position) => {
              setWrongPracticeMode(false);
              setTestMode(false);
              setPosFilter((current) =>
                current.includes(position)
                  ? current.filter((item) => item !== position)
                  : [...current, position],
              );
            }}
            onImproveToggle={() => {
              setTestMode(false);
              setWrongPracticeMode((current) => !current);
            }}
            onTestToggle={() => {
              setWrongPracticeMode(false);
              setTestMode((current) => !current);
            }}
          />
        </TrainerFiltersOverlay>
      )}

      {showHint && deal && phase === 'quiz' && (
        <HintRangeOverlay
          closing={hintClosing}
          deal={deal}
          onClose={closeHint}
          top={overlayTop}
        />
      )}
    </View>
  );
}

function AnimatedFiltersButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.filtersToggle}>
        <Text style={styles.filtersToggleIcon}>≡</Text>
        <Text style={styles.filtersToggleText}>Filters</Text>
        <AnimatedFilterDot active={active} />
      </View>
    </Pressable>
  );
}

function AnimatedFilterDot({ active }: { active: boolean }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? 180 : 140,
      easing: active ? Easing.out(Easing.back(1.6)) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [active]);

  const size = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const marginLeft = progress.interpolate({ inputRange: [0, 1], outputRange: [-5, 0] });

  return (
    <Animated.View
      style={[
        styles.filtersToggleDot,
        {
          width: size,
          height: size,
          marginLeft,
          opacity: progress,
        },
      ]}
    />
  );
}

function HintRangeOverlay({
  closing,
  deal,
  onClose,
  top,
}: {
  closing: boolean;
  deal: TrainerDeal;
  onClose: () => void;
  top: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: closing ? 0 : 1,
      duration: closing ? 160 : 220,
      easing: closing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [closing]);

  return (
    <Pressable onPress={onClose} style={styles.hintOverlay}>
      <Animated.View
        style={[
          styles.hintAnimatedPanel,
          {
            top,
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 0],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.hintPanel}>
          <View style={styles.hintHeader}>
            <View style={styles.hintTitleGroup}>
              <Text style={styles.hintTitle}>{deal.spot.hero} Range</Text>
              <Text style={styles.hintSubtitle}>{scenarioLabel(deal.spot)}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.hintCloseButton}>
              <Text style={styles.hintCloseText}>x</Text>
            </Pressable>
          </View>
          <RangeLegend hands={deal.hands} />
          <RangeGrid hands={deal.hands} highlightHand={deal.hand} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}


function TrainerFiltersOverlay({
  children,
  closing,
  onClose,
  top,
}: {
  children: ReactNode;
  closing: boolean;
  onClose: () => void;
  top: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: closing ? 0 : 1,
      duration: closing ? 160 : 220,
      easing: closing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [closing]);

  return (
    <Pressable onPress={onClose} style={styles.filtersOverlay}>
      <Animated.View
        style={[
          styles.filtersOverlayPanel,
          {
            top,
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 0],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable onPress={(event) => event.stopPropagation()}>
          {children}
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

function TrainerFiltersPanel({
  spotTypeFilter,
  posFilter,
  wrongPracticeMode,
  testMode,
  onSpotTypeChange,
  onPositionToggle,
  onImproveToggle,
  onTestToggle,
}: {
  spotTypeFilter: SpotTypeFilter;
  posFilter: string[];
  wrongPracticeMode: boolean;
  testMode: boolean;
  onSpotTypeChange: (filter: SpotTypeFilter) => void;
  onPositionToggle: (position: string) => void;
  onImproveToggle: () => void;
  onTestToggle: () => void;
}) {
  return (
    <View style={styles.filtersPanel}>
      <View style={styles.filterSection}>
        <Text style={styles.filterSectionTitle}>Spot type</Text>
        <View style={styles.spotTypeGrid}>
          {spotFilters.map((filter) => {
            const active = !wrongPracticeMode && !testMode && spotTypeFilter === filter.value;
            return (
              <Pressable
                key={filter.value}
                onPress={() => onSpotTypeChange(filter.value)}
                style={[styles.filterButton, active && styles.filterButtonActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterSectionTitle}>
          Position <Text style={styles.filterSectionHint}>(all if none selected)</Text>
        </Text>
        <View style={styles.positionRow}>
          {allPositions.map((position) => {
            const active = !wrongPracticeMode && !testMode && posFilter.includes(position);
            return (
              <Pressable
                key={position}
                onPress={() => onPositionToggle(position)}
                style={[styles.positionButton, active && styles.positionButtonActive]}
              >
                <Text style={[styles.positionButtonText, active && styles.positionButtonTextActive]}>
                  {position}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.practiceSection}>
        <Text style={styles.filterSectionTitle}>Practice set</Text>
        <View style={styles.practiceGrid}>
          <Pressable
            onPress={onImproveToggle}
            style={[styles.practiceButton, styles.improveButton, wrongPracticeMode && styles.improveButtonActive]}
          >
            <Text style={[styles.practiceButtonText, styles.improveButtonText, wrongPracticeMode && styles.practiceButtonTextActive]}>
              Improve
            </Text>
            <View style={[styles.practiceBadge, wrongPracticeMode && styles.practiceBadgeActive]}>
              <Text style={styles.practiceBadgeText}>0</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={onTestToggle}
            style={[styles.practiceButton, styles.testButton, testMode && styles.testButtonActive]}
          >
            <Text style={[styles.practiceButtonText, styles.testButtonText, testMode && styles.practiceButtonTextActive]}>
              Test
            </Text>
            <View style={[styles.practiceBadge, testMode && styles.practiceBadgeActive]}>
              <Text style={styles.practiceBadgeText}>New</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FullScreenShimmer({ trigger }: { trigger: number }) {
  const shimmerX = useRef(new Animated.Value(-600)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    shimmerX.setValue(-600);
    shimmerOpacity.setValue(0);
    const anim = Animated.parallel([
      Animated.timing(shimmerX, { toValue: 900, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 1, duration: 80, easing: Easing.ease, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(shimmerOpacity, { toValue: 0, duration: 220, easing: Easing.ease, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [trigger]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.shimmerClip]}>
      <Animated.View
        style={[
          styles.shimmerBand,
          { transform: [{ translateX: shimmerX }, { skewX: '-15deg' }], opacity: shimmerOpacity },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'transparent']}
          locations={[0, 0.3, 0.5, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const springEasing = Easing.bezier(0.34, 1.56, 0.64, 1);
const slideEasing = Easing.bezier(0.22, 1, 0.36, 1);

function useSlideUp(delay: number) {
  const translateY = useRef(new Animated.Value(28)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    translateY.setValue(28);
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 250, easing: slideEasing, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, easing: slideEasing, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);
  return { transform: [{ translateY }], opacity };
}

function TrainerResultView({
  deal,
  selectedCorrect,
  solvrScore,
  onNextHand,
}: {
  deal: TrainerDeal;
  selectedCorrect: boolean;
  solvrScore: number | null;
  onNextHand: () => void;
}) {
  // resultBounce: scale 0.6→1.06→0.97→1, translateY 20→-4→0, opacity 0→1
  const labelScale = useRef(new Animated.Value(0.6)).current;
  const labelTranslateY = useRef(new Animated.Value(20)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;


  // gridReveal: scale 0.94→1, opacity 0→1
  const gridScale = useRef(new Animated.Value(0.94)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;

  const freqSlide = useSlideUp(70);
  const rangeSlide = useSlideUp(120);

  useEffect(() => {
    labelScale.setValue(0.6);
    labelTranslateY.setValue(20);
    labelOpacity.setValue(0);
    gridScale.setValue(0.94);
    gridOpacity.setValue(0);

    const labelAnim = Animated.parallel([
      Animated.timing(labelScale, { toValue: 1, duration: 350, easing: springEasing, useNativeDriver: true }),
      Animated.timing(labelTranslateY, { toValue: 0, duration: 350, easing: springEasing, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 1, duration: 180, easing: slideEasing, useNativeDriver: true }),
    ]);


    const gridAnim = Animated.sequence([
      Animated.delay(170),
      Animated.parallel([
        Animated.timing(gridScale, { toValue: 1, duration: 270, easing: slideEasing, useNativeDriver: true }),
        Animated.timing(gridOpacity, { toValue: 1, duration: 270, easing: slideEasing, useNativeDriver: true }),
      ]),
    ]);

    labelAnim.start();
    gridAnim.start();

    return () => {
      labelAnim.stop();
      gridAnim.stop();
    };
  }, []);

  return (
    <View style={styles.resultScreen}>
      <View style={styles.resultTopRow}>
        <Animated.Text
          style={[
            styles.resultStatusText,
            selectedCorrect ? styles.resultStatusCorrect : styles.resultStatusWrong,
            { transform: [{ scale: labelScale }, { translateY: labelTranslateY }], opacity: labelOpacity },
          ]}
        >
          {selectedCorrect ? 'Correct' : 'Wrong'}
        </Animated.Text>
        {solvrScore !== null && (
          <Animated.View style={[styles.solvrPill, { opacity: labelOpacity, transform: [{ scale: labelScale }] }]}>
            <Text style={styles.solvrPillValue}>{Math.round(solvrScore * 100)}</Text>
            <Text style={styles.solvrPillLabel}>Solvr</Text>
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.freqPanel, freqSlide]}>
        <View style={styles.freqPanelHeader}>
          <Text style={styles.freqHandLabel}>{deal.hand}</Text>
          <View style={styles.freqLegend}>
            {deal.handFreq.fold_freq > 0 && (
              <View style={styles.freqLegendItem}>
                <View style={[styles.freqLegendDot, { backgroundColor: C.blue }]} />
                <Text style={styles.freqLegendText}>Fold {Math.round(deal.handFreq.fold_freq)}%</Text>
              </View>
            )}
            {deal.handFreq.call_freq > 0 && (
              <View style={styles.freqLegendItem}>
                <View style={[styles.freqLegendDot, { backgroundColor: C.green }]} />
                <Text style={styles.freqLegendText}>Call {Math.round(deal.handFreq.call_freq)}%</Text>
              </View>
            )}
            {deal.handFreq.raise_freq > 0 && (
              <View style={styles.freqLegendItem}>
                <View style={[styles.freqLegendDot, { backgroundColor: C.red }]} />
                <Text style={styles.freqLegendText}>Raise {Math.round(deal.handFreq.raise_freq)}%</Text>
              </View>
            )}
            {deal.handFreq.all_in_freq > 0 && (
              <View style={styles.freqLegendItem}>
                <View style={[styles.freqLegendDot, { backgroundColor: C.allIn }]} />
                <Text style={styles.freqLegendText}>All-in {Math.round(deal.handFreq.all_in_freq)}%</Text>
              </View>
            )}
          </View>
        </View>
        <AnimatedFreqBar handFreq={deal.handFreq} />
      </Animated.View>

      <Animated.View style={[styles.resultRangePanel, rangeSlide]}>
        <Text style={styles.resultRangeTitle}>{deal.spot.hero} Range</Text>
        <Animated.View style={{ transform: [{ scale: gridScale }], opacity: gridOpacity }}>
          <RangeGrid hands={deal.hands} highlightHand={deal.hand} />
        </Animated.View>
      </Animated.View>

      <View style={styles.resultNextDock}>
        <Pressable onPress={onNextHand} style={[styles.actionButton, styles.resultNextButton]}>
          <Text style={styles.resultNextButtonText}>Next Hand</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AnimatedFreqBar({ handFreq }: { handFreq: TrainerDeal['handFreq'] }) {
  const segments = [
    { freq: handFreq.fold_freq, color: C.blue },
    { freq: handFreq.call_freq, color: C.green },
    { freq: handFreq.raise_freq, color: C.red },
    { freq: handFreq.all_in_freq, color: C.allIn },
  ].filter((s) => s.freq > 0);

  const total = segments.reduce((sum, s) => sum + s.freq, 0);

  const animValues = useRef(segments.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    animValues.forEach((v) => v.setValue(0));
    const anims = segments.map((s, i) =>
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(animValues[i], {
          toValue: (s.freq / total) * 100,
          duration: 900,
          easing: slideEasing,
          useNativeDriver: false,
        }),
      ])
    );
    const anim = Animated.parallel(anims);
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.freqBar}>
      {segments.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.freqSegment,
            { width: animValues[i].interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), backgroundColor: s.color, flex: undefined },
          ]}
        />
      ))}
    </View>
  );
}

function actionLabel(action: TrainerAction, raiseBB: number) {
  if (action === 'Raise') return `Raise ${formatBB(raiseBB)}`;
  return action;
}


function actionStyle(action: TrainerAction) {
  if (action === 'Fold') return styles.foldButton;
  if (action === 'Call') return styles.callButton;
  if (action === 'Raise') return styles.raiseButton;
  return styles.allInButton;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  screenContent: {
    flexGrow: 1,
    gap: 14,
    paddingHorizontal: 20,
    paddingTop:
      (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0) +
      TOP_CONTENT_OFFSET,
    paddingBottom: 0,
  },
  tableStage: {
    marginHorizontal: -2,
    marginTop: -24,
  },
  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
    position: 'relative',
    zIndex: 10,
  },
  infoButton: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  infoButtonActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  infoButtonText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '900',
  },
  headerCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    left: 42,
    position: 'absolute',
    right: 94,
    justifyContent: 'center',
  },
  statPill: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statPillText: {
    color: C.purplePale,
    fontSize: 11,
    fontWeight: '900',
  },
  smallHeaderButton: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallHeaderButtonText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
  },
  endTestButton: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  endTestButtonText: {
    color: C.red,
    fontSize: 11,
    fontWeight: '900',
  },
  filtersToggle: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filtersToggleIcon: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 13,
  },
  filtersToggleText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '900',
  },
  filtersToggleDot: {
    backgroundColor: C.purpleLight,
    borderRadius: 999,
  },
  progressTrack: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 5,
    marginTop: -8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  filtersOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  filtersOverlayPanel: {
    left: 20,
    position: 'absolute',
    right: 20,
  },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
  },
  hintAnimatedPanel: {
    left: 10,
    position: 'absolute',
    right: 10,
  },
  hintPanel: {
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
  hintHeader: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  hintTitleGroup: {
    flex: 1,
    paddingRight: 10,
  },
  hintTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: '900',
  },
  hintSubtitle: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  hintCloseButton: {
    alignItems: 'center',
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  hintCloseText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 12,
  },
  filtersPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterSectionTitle: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  filterSectionHint: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    textTransform: 'none',
  },
  spotTypeGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  positionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  positionButton: {
    backgroundColor: C.surface2,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  positionButtonActive: {
    backgroundColor: C.purple,
  },
  positionButtonText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '900',
  },
  positionButtonTextActive: {
    color: 'white',
  },
  practiceSection: {
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  practiceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  practiceButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  improveButton: {
    backgroundColor: 'rgba(34,197,94,0.13)',
  },
  improveButtonActive: {
    backgroundColor: C.green,
  },
  testButton: {
    backgroundColor: 'rgba(239,68,68,0.13)',
  },
  testButtonActive: {
    backgroundColor: C.red,
  },
  practiceButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  improveButtonText: {
    color: '#86efac',
  },
  testButtonText: {
    color: '#fca5a5',
  },
  practiceButtonTextActive: {
    color: 'white',
  },
  practiceBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    minWidth: 28,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  practiceBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  practiceBadgeText: {
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '900',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '900',
  },
  scorePill: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 70,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreValue: {
    color: C.green,
    fontSize: 18,
    fontWeight: '900',
  },
  scoreLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(124,58,237,0.24)',
    borderColor: C.purpleLight,
  },
  filterText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
  },
  filterTextActive: {
    color: C.purplePale,
  },
  statePanel: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  stateText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  handCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  scenario: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 14,
  },
  handRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionDock: {
    marginHorizontal: -13,
    marginTop: -31,
    paddingBottom: 6,
    paddingTop: 0,
  },
  positionPill: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  positionText: {
    color: C.purplePale,
    fontSize: 15,
    fontWeight: '900',
  },
  prompt: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '800',
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
  foldButton: {
    backgroundColor: C.blue,
  },
  callButton: {
    backgroundColor: C.green,
  },
  raiseButton: {
    backgroundColor: C.red,
  },
  allInButton: {
    backgroundColor: C.allIn,
  },
  actionButtonPicked: {
    borderColor: C.gold,
    borderWidth: 2,
  },
  actionButtonDisabled: {
    opacity: 0.48,
  },
  actionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  screenResultCorrect: {
    backgroundColor: '#14532d',
  },
  screenResultWrong: {
    backgroundColor: '#7f1d1d',
  },
  resultScreen: {
    flexGrow: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 14,
    marginHorizontal: -20,
    paddingBottom: 6,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  resultNextDock: {
    flexDirection: 'row',
    marginHorizontal: -8,
  },
  resultTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  solvrPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  solvrPillValue: {
    color: C.purplePale,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  solvrPillLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultStatusText: {
    color: 'white',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 42,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  resultStatusCorrect: {
    color: C.green,
  },
  resultStatusWrong: {
    color: C.red,
  },
  freqPanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  freqPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  freqHandLabel: {
    color: C.text,
    fontSize: 18,
    fontWeight: '900',
  },
  freqLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  freqLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  freqLegendDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  freqLegendText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '800',
  },
  freqBar: {
    borderRadius: 6,
    flexDirection: 'row',
    height: 16,
    overflow: 'hidden',
    gap: 2,
  },
  freqSegment: {
    height: '100%',
    borderRadius: 3,
  },
  resultRangePanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 6,
  },
  resultRangeTitle: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  shimmerClip: {
    overflow: 'hidden',
  },
  shimmerBand: {
    position: 'absolute',
    top: -300,
    bottom: -300,
    left: -150,
    width: 220,
  },
  resultNextButton: {
    backgroundColor: C.purple,
  },
  resultNextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  primaryButton: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },
});
