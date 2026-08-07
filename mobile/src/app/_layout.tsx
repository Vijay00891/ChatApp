import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import WebRTCWrapper from '../components/WebRTCWrapper';
import { useEffect } from 'react';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      setTimeout(() => router.replace('/(auth)/login'), 0);
    } else if (user && inAuthGroup) {
      setTimeout(() => router.replace('/(tabs)'), 0);
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <SocketProvider>
      <WebRTCWrapper>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="new-group" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </WebRTCWrapper>
    </SocketProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
