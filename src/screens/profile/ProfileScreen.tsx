import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '../../constants/colors';
import {
  DAILY_GOAL_OPTIONS,
  getDailyGoal,
  setDailyGoal,
  type DailyGoal,
} from '../../data/appSettingsStore';

const freeFeatures = ['50 trainer hands/day', 'Ranges', 'Session stats'];
const proFeatures = ['Unlimited training', 'Mistake review', 'Leak tracking'];

export function ProfileScreen() {
  const isPro = false;
  const [dailyGoal, setDailyGoalState] = useState<DailyGoal>(10);

  useEffect(() => {
    getDailyGoal()
      .then(setDailyGoalState)
      .catch(() => {});
  }, []);

  function chooseDailyGoal(goal: DailyGoal) {
    setDailyGoalState(goal);
    setDailyGoal(goal).catch(() => {});
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.statusCard}>
        <View>
          <Text style={styles.eyebrow}>Subscription</Text>
          <Text style={styles.statusTitle}>{isPro ? 'Solvr Pro' : 'Free'}</Text>
        </View>
        <View style={[styles.statusPill, isPro && styles.statusPillPro]}>
          <Text style={styles.statusPillText}>{isPro ? 'Active' : 'Free Plan'}</Text>
        </View>
      </View>

      <View style={styles.planCompare}>
        <View style={styles.freePlanCard}>
          <Text style={styles.planEyebrow}>Free</Text>
          <Text style={styles.planTitle}>Start sharp</Text>
          <View style={styles.compactFeatureList}>
            {freeFeatures.map((feature) => (
              <Text key={feature} style={styles.freeFeatureText}>- {feature}</Text>
            ))}
          </View>
        </View>

        <View style={styles.proPlanCard}>
          <LinearGradient
            colors={['#b43ee5', '#8b5cf6', '#6c2ed2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.proEyebrow}>Solvr Pro</Text>
          <Text style={styles.proTitle}>Train deeper</Text>
          <View style={styles.compactFeatureList}>
            {proFeatures.map((feature) => (
              <Text key={feature} style={styles.proFeatureText}>- {feature}</Text>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View>
            <Text style={styles.eyebrow}>Daily Goal</Text>
            <Text style={styles.goalTitle}>{dailyGoal} hands/day</Text>
          </View>
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText}>Streak</Text>
          </View>
        </View>

        <View style={styles.goalOptions}>
          {DAILY_GOAL_OPTIONS.map((goal) => {
            const active = goal === dailyGoal;
            return (
              <Pressable
                key={goal}
                onPress={() => chooseDailyGoal(goal)}
                style={[styles.goalOption, active && styles.goalOptionActive]}
              >
                <Text style={[styles.goalOptionText, active && styles.goalOptionTextActive]}>
                  {goal}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.goalCopy}>
          This controls the home streak progress now and can power reminders later.
        </Text>
      </View>

      <Pressable style={({ pressed }) => [styles.subscribeButton, pressed && styles.subscribeButtonPressed]}>
        <LinearGradient
          colors={['#b43ee5', '#8b5cf6', '#6c2ed2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.subscribeButtonText}>Upgrade to Solvr Pro</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: C.bg,
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 36,
    paddingTop: 58,
  },
  header: {
    alignItems: 'center',
  },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: '900',
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  eyebrow: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  statusPill: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillPro: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  statusPillText: {
    color: C.purplePale,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  planCompare: {
    flexDirection: 'row',
    gap: 10,
  },
  freePlanCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 9,
    minHeight: 168,
    padding: 14,
  },
  proPlanCard: {
    borderColor: 'rgba(237,233,254,0.72)',
    borderRadius: 16,
    borderWidth: 2,
    flex: 1,
    gap: 9,
    minHeight: 168,
    overflow: 'hidden',
    padding: 14,
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 9,
  },
  planEyebrow: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  proEyebrow: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  planTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
  },
  proTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  compactFeatureList: {
    gap: 6,
  },
  freeFeatureText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  proFeatureText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  goalCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  goalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  goalBadge: {
    backgroundColor: 'rgba(251,146,60,0.14)',
    borderColor: 'rgba(251,146,60,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goalBadgeText: {
    color: '#fdba74',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  goalOptions: {
    flexDirection: 'row',
    gap: 7,
  },
  goalOption: {
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  goalOptionActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
  },
  goalOptionText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '900',
  },
  goalOptionTextActive: {
    color: 'white',
  },
  goalCopy: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  subscribeButton: {
    alignItems: 'center',
    borderColor: 'rgba(237,233,254,0.62)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  subscribeButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  subscribeButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
