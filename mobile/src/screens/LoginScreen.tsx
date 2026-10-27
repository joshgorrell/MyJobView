import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Logo } from '../components/Logo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.toLowerCase().trim(), password);
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        error.message || 'Invalid email or password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { title: 'High-Precision GPS', subtitle: '3-10 meter accuracy' },
    { title: 'Offline Support', subtitle: 'Works without connection' },
    { title: 'Biometric Security', subtitle: 'Face ID & fingerprint' },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[Colors.primary[600], Colors.primary[700], Colors.primary[900]]}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Logo / Title */}
          <View style={styles.header}>
            <Logo size={88} variant="light" />
            <Text style={styles.title}>MyJobView</Text>
            <Text style={styles.subtitle}>Sign in with your MyJobView account</Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Sign In</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your.email@company.com"
                placeholderTextColor={Colors.gray[400]}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={Colors.gray[400]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

          </View>


        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'space-between', padding: Spacing.lg, maxWidth: 480, alignSelf: 'center', width: '100%' },
  header: { alignItems: 'center', marginTop: 24, gap: Spacing.md },
  title: { fontSize: 32, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.8)' },
  formContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xxl,
    padding: Spacing.xxl,
    ...Shadows.large,
  },
  formTitle: { fontSize: 22, fontWeight: '700', color: Colors.gray[900], marginBottom: Spacing.xl },
  inputContainer: { marginBottom: Spacing.xl },
  label: { fontSize: 14, fontWeight: '600', color: Colors.gray[700], marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg + 2,
    fontSize: 16,
    color: Colors.gray[900],
  },
  loginButton: {
    backgroundColor: Colors.primary[600],
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg + 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  featuresContainer: {
    marginTop: Spacing.xxl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    gap: Spacing.lg,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  featureCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.green[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCheckInner: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.green[600],
    transform: [{ rotate: '-45deg' }],
    marginTop: 2,
  },
  featureTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray[800] },
  featureSubtitle: { fontSize: 12, color: Colors.gray[400], marginTop: 1 },
  footer: { alignItems: 'center', marginBottom: 20 },
  footerText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500', letterSpacing: 1 },
});
