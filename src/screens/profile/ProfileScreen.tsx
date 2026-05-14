import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '../../constants/colors';

const proBenefits = [
  { title: 'Unlimited trainer hands', detail: 'Train past the free 50 hands/day limit.', status: 'Live' },
  { title: 'Hand analysis', detail: 'Review individual decisions with deeper solver context.', status: 'Coming soon' },
  { title: 'Simulator hands', detail: 'Practice full simulated hands from preflop onward.', status: 'Coming soon' },
  { title: 'Leak tracking', detail: 'Turn session results into clearer study priorities.', status: 'Coming soon' },
];

export function ProfileScreen() {
  const isPro = false;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.statusCard}>
        <View>
          <Text style={styles.eyebrow}>Subscription</Text>
          <Text style={styles.statusTitle}>{isPro ? 'Solvr Pro' : 'Free Plan'}</Text>
          <Text style={styles.statusCopy}>
            {isPro ? 'You have unlimited training access.' : 'You get 50 trainer hands per day.'}
          </Text>
        </View>
        <View style={[styles.statusPill, isPro && styles.statusPillPro]}>
          <Text style={styles.statusPillText}>{isPro ? 'Active' : 'Free'}</Text>
        </View>
      </View>

      <View style={styles.proCard}>
        <Text style={styles.proEyebrow}>Solvr Pro</Text>
        <Text style={styles.proTitle}>Train without the daily cap.</Text>
        <Text style={styles.proCopy}>
          Unlock unlimited trainer volume now, with hand analysis and simulator hands planned for Pro.
        </Text>

        <View style={styles.benefitList}>
          {proBenefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitRow}>
              <View style={styles.benefitDot} />
              <View style={styles.benefitText}>
                <View style={styles.benefitTitleRow}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={[styles.benefitStatus, benefit.status === 'Live' && styles.benefitStatusLive]}>
                    {benefit.status}
                  </Text>
                </View>
                <Text style={styles.benefitDetail}>{benefit.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={({ pressed }) => [styles.subscribeButton, pressed && styles.subscribeButtonPressed]}>
          <Text style={styles.subscribeButtonText}>Subscribe to Solvr Pro</Text>
        </Pressable>
      </View>
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
  statusCopy: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '800',
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
  proCard: {
    backgroundColor: 'rgba(34, 21, 64, 0.82)',
    borderColor: 'rgba(196, 181, 253, 0.32)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  proEyebrow: {
    color: C.gold,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  proTitle: {
    color: C.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  proCopy: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  benefitList: {
    gap: 11,
  },
  benefitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  benefitDot: {
    backgroundColor: C.purpleLight,
    borderRadius: 999,
    height: 9,
    marginTop: 5,
    width: 9,
  },
  benefitText: {
    flex: 1,
    gap: 3,
  },
  benefitTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  benefitTitle: {
    color: C.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  benefitStatus: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  benefitStatusLive: {
    color: C.green,
  },
  benefitDetail: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  subscribeButton: {
    alignItems: 'center',
    backgroundColor: C.purple,
    borderColor: C.purpleLight,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  subscribeButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  subscribeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
