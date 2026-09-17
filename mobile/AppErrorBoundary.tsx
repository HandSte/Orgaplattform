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
          <Text style={styles.message}>Essentia konnte diesen Bereich nicht laden.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Erneut versuchen" onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  mark: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  markText: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  title: { color: '#111827', fontSize: 20, fontWeight: '800' },
  message: { marginTop: 8, color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  button: { marginTop: 18, minWidth: 150, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: '#111827', alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
