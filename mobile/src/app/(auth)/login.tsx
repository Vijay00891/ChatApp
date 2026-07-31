import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) return setError('All fields are required');
    try {
      setLoading(true);
      setError('');
      await login({ email, password });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>💬</Text>
        </View>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue chatting</Text>
      </View>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#5F6368"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#5F6368"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </TouchableOpacity>
      
      <Link href="/(auth)/register" style={styles.link}>
        Don't have an account? Sign up
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#FFFFFF' },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoText: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: '700', color: '#202124', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#5F6368' },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 16,
    color: '#202124',
    backgroundColor: '#FFFFFF',
  },
  button: {
    backgroundColor: '#1A73E8',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  error: { color: '#EA4335', marginBottom: 15, textAlign: 'center', fontSize: 14 },
  link: { color: '#1A73E8', textAlign: 'center', marginTop: 24, fontSize: 15 },
});
