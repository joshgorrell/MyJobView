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
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { Colors } from '../theme/colors';
import { Spacing, Radius, Shadows } from '../theme/styles';
import { Logo } from '../components/Logo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleResetPassword() {
    const address = email.trim().toLowerCase();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      Alert.alert('Email required', 'Enter your account email above to reset your password.');
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: 'https://elife.myjobview.com/',
      });
      if (error) throw error;
      Alert.alert('Check your email', 'If an account exists for that address, you will receive password reset instructions.');
    } catch (error) {
      Alert.alert('Reset unavailable', 'We could not request a password reset. Please try again later.');
    } finally {
      setResetting(false);
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
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
    { title: 'Secure Access', subtitle: 'Your company account' },
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
            <Text style={styles.subtitle}>Mobile Time Clock</Text>
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
                textContentType="username"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                placeholderTextColor={Colors.gray[400]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoComplete="password"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(value => !value)} style={styles.passwordToggle}>
                <Text style={styles.passwordToggleText}>{showPassword ? '◉' : '◎'}</Text>
              </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={handleResetPassword} disabled={resetting || loading} accessibilityRole="button" style={styles.resetLink}>
              <Text style={styles.resetText}>{resetting ? 'Sending reset link…' : 'Forgot password?'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, !canSubmit && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="link" style={styles.signupLink} onPress={() => Linking.openURL('https://elife.myjobview.com/')}>
              <Text style={styles.resetText}>New to MyJobView? Create an account on the web</Text>
            </TouchableOpacity>

            {/* Features */}
            <View style={styles.featuresContainer}>
              {features.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <View style={styles.featureCheck}>
                    <View style={styles.featureCheckInner} />
                  </View>
                  <View>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Accurate. Reliable. Secure.</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'space-between', padding: Spacing.xxl, maxWidth: 600, alignSelf: 'center', width: '100%' },
  header: { alignItems: 'center', marginTop: 60, gap: Spacing.md },
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
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 48 },
  passwordToggle: { position: 'absolute', right: 8, padding: 12 },
  passwordToggleText: { color: Colors.primary[600], fontSize: 14, fontWeight: '600' },
  signupLink: { alignSelf: 'center', paddingVertical: 14 },
  resetLink: { alignSelf: 'flex-end', paddingVertical: 8 },
  resetText: { color: Colors.primary[600], fontSize: 14, fontWeight: '600' },
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
