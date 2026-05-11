import { StyleSheet, Text, View } from 'react-native';

import { C } from '../constants/colors';

type PlaceholderScreenProps = {
  title: string;
  subtitle: string;
};

// Simple reusable screen while each feature is migrated into src/screens.
export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: C.bg,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: C.textSec,
    fontSize: 16,
    lineHeight: 22,
  },
});
