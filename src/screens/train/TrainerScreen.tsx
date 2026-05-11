import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { C } from '../../constants/colors';
import {
  availableActionsForSpot,
  dealRandomTrainerHand,
  formatBB,
  getActionFrequency,
  type SpotTypeFilter,
  type TrainerAction,
  type TrainerDeal,
} from '../../data/trainerDb';

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

export function TrainerScreen() {
  const db = useSQLiteContext();
  const [spotTypeFilter, setSpotTypeFilter] = useState<SpotTypeFilter>('ANY');
  const [posFilter, setPosFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [wrongPracticeMode, setWrongPracticeMode] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [phase, setPhase] = useState<'quiz' | 'result'>('quiz');
  const [deal, setDeal] = useState<TrainerDeal | null>(null);
  const [picked, setPicked] = useState<TrainerAction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const hasLoadedRef = useRef(false);

  const loadHand = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    setIsLoading(isInitialLoad);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trainer.db.');
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
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
    setPicked(action);
    setPhase('result');
    setStats((current) => ({
      correct: current.correct + (correct ? 1 : 0),
      total: current.total + 1,
    }));
  }

  function changeFilter(filter: SpotTypeFilter) {
    setWrongPracticeMode(false);
    setTestMode(false);
    setSpotTypeFilter(filter);
    setPosFilter([]);
  }

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const filterActive = testMode || wrongPracticeMode || posFilter.length > 0 || spotTypeFilter !== 'ANY';
  const availableActions = deal ? availableActionsForSpot(deal.hands) : [];
  const overlayTop =
    (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0) +
    TOP_CONTENT_OFFSET +
    42;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterHeader}>
        <Pressable style={styles.infoButton}>
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
                  {stats.correct}/{stats.total} - {accuracy}%
                </Text>
              </View>
              <Pressable onPress={() => setStats({ correct: 0, total: 0 })} style={styles.smallHeaderButton}>
                <Text style={styles.smallHeaderButtonText}>New Session</Text>
              </Pressable>
            </>
          )}
        </View>

        <Pressable
          onPress={() => setShowFilters((current) => !current)}
          style={styles.filtersToggle}
        >
          <Text style={styles.filtersToggleIcon}>≡</Text>
          <Text style={styles.filtersToggleText}>Filters {filterActive ? '●' : ''}</Text>
        </Pressable>
      </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
            {
              width: `${testMode ? 0 : accuracy}%`,
              backgroundColor: testMode ? '#14b8a6' : wrongPracticeMode ? C.purpleLight : C.green,
            },
            ]}
          />
        </View>

        {isLoading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={C.purpleLight} />
          <Text style={styles.stateText}>Loading trainer.db...</Text>
        </View>
      ) : error ? (
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
          onNextHand={loadHand}
        />
      ) : deal ? (
        <>
          <View style={styles.tableStage}>
            <PokerTable {...pokerTablePropsFromSpot(deal.spot, deal.hand)} />
          </View>

          <View style={styles.actionDock}>
            <View style={styles.actionGrid}>
              {availableActions.map((action) => {
                const active = picked === action;
                return (
                  <Pressable
                    key={action}
                    onPress={() => answer(action)}
                    style={[
                      styles.actionButton,
                      actionStyle(action),
                      active && styles.actionButtonPicked,
                    ]}
                  >
                    <Text style={styles.actionText}>{actionLabel(action, deal.spot.raiseBB)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}
      </ScrollView>

      {showFilters && (
        <Pressable onPress={() => setShowFilters(false)} style={styles.filtersOverlay}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.filtersOverlayPanel, { top: overlayTop }]}
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
          </Pressable>
        </Pressable>
      )}
    </View>
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

function TrainerResultView({
  deal,
  selectedCorrect,
  onNextHand,
}: {
  deal: TrainerDeal;
  selectedCorrect: boolean;
  onNextHand: () => void;
}) {
  return (
    <View style={styles.resultScreen}>
      <View style={styles.resultStatus}>
        <Text
          style={[
            styles.resultStatusText,
            selectedCorrect ? styles.resultStatusCorrect : styles.resultStatusWrong,
          ]}
        >
          {selectedCorrect ? 'Correct' : 'Wrong'}
        </Text>
      </View>

      <View style={styles.resultRangePanel}>
        <Text style={styles.resultRangeTitle}>{deal.spot.hero} Range</Text>
        <RangeGrid deal={deal} />
      </View>

      <Pressable onPress={onNextHand} style={styles.resultNextButton}>
        <Text style={styles.resultNextButtonText}>Next Hand</Text>
      </Pressable>
    </View>
  );
}

function actionLabel(action: TrainerAction, raiseBB: number) {
  if (action === 'Raise') return `Raise ${formatBB(raiseBB)}`;
  return action;
}

function RangeGrid({ deal }: { deal: TrainerDeal }) {
  return (
    <View style={styles.rangeGrid}>
      {ranks.map((rowRank, rowIndex) => {
        return ranks.map((columnRank, columnIndex) => {
          const label = handLabel(rowRank, columnRank, rowIndex, columnIndex);
          const frequencies = deal.hands[label];
          const highlighted = label === deal.hand;
          return (
            <View
              key={label}
              style={[
                styles.rangeCell,
                { backgroundColor: rangeCellColor(frequencies) },
                highlighted && styles.rangeCellActive,
              ]}
            >
              <Text style={[styles.rangeCellText, highlighted && styles.rangeCellTextActive]}>
                {label}
              </Text>
            </View>
          );
        });
      })}
    </View>
  );
}

function handLabel(
  rowRank: string,
  columnRank: string,
  rowIndex: number,
  columnIndex: number,
) {
  if (rowIndex === columnIndex) return rowRank + columnRank;
  if (rowIndex < columnIndex) return rowRank + columnRank + 's';
  return columnRank + rowRank + 'o';
}

function rangeCellColor(frequencies?: TrainerDeal['handFreq']) {
  if (!frequencies || !frequencies.possible) return '#100c2f';
  const raise = frequencies.raise_freq || 0;
  const allIn = frequencies.all_in_freq || 0;
  const call = frequencies.call_freq || 0;
  const fold = frequencies.fold_freq || 0;
  const max = Math.max(raise, allIn, call, fold);

  if (max === allIn && allIn > 0) return C.allIn;
  if (max === raise && raise > 0) return C.red;
  if (max === call && call > 0) return C.green;
  if (max === fold && fold > 0) return C.blue;
  return C.surface2;
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
    gap: 5,
    paddingHorizontal: 12,
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
  actionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  resultScreen: {
    flexGrow: 1,
    gap: 14,
    paddingBottom: 6,
  },
  resultStatus: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 10,
  },
  resultStatusText: {
    color: 'white',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 42,
    textShadowColor: 'rgba(0,0,0,0.24)',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 22,
    textTransform: 'uppercase',
  },
  resultStatusCorrect: {
    color: C.green,
  },
  resultStatusWrong: {
    color: C.red,
  },
  resultRangePanel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  resultRangeTitle: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  resultNextButton: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderRadius: 15,
    marginTop: 'auto',
    paddingVertical: 16,
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
  rangeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  rangeCell: {
    alignItems: 'center',
    aspectRatio: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    width: '7.1%',
  },
  rangeCellActive: {
    borderColor: C.gold,
    borderWidth: 2,
  },
  rangeCellText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 7,
    fontWeight: '900',
  },
  rangeCellTextActive: {
    color: 'white',
  },
});
