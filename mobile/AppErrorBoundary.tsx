import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRANDING } from './branding';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Essentia] Mobile runtime error', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <View style={styles.mark}><Text style={styles.markText}>{BRANDING.monogram}</Text></View>
          <Text style={styles.title}>{BRANDING.appName}</Text>
          <Text style={styles.message}>Dieser Bereich konnte gerade nicht geladen werden.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Erneut versuchen" onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, padding: 26, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  mark: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  markText: { color: '#ffffff', fontSize: 24, fontWeight: '900' },
  title: { color: '#0f172a', fontSize: 21, fontWeight: '900' },
  message: { marginTop: 8, color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  button: { marginTop: 20, minWidth: 170, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
