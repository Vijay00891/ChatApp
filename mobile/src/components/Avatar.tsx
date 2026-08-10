import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image'; // Using expo-image for better caching

function getAvatarColor(name) {
  const colors = ['#1A73E8', '#EA4335', '#34A853', '#FBBC04', '#8E24AA', '#E91E63', '#00ACC1', '#FF7043'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

interface AvatarProps {
  url?: string;
  name: string;
  size?: number;
  color?: string;
  style?: any;
  textStyle?: any;
}

export default function Avatar({ url, name, size = 40, color, style, textStyle }: AvatarProps) {
  const avatarColor = color || getAvatarColor(name);
  const initials = (name || 'Unknown').substring(0, 2).toUpperCase();

  if (url && url.trim() !== '') {
    return (
      <Image
        source={{ uri: url }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        contentFit="cover"
        transition={200}
      />
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Text style={[{ color: '#FFFFFF', fontWeight: '600', fontSize: size * 0.4 }, textStyle]}>
        {initials}
      </Text>
    </View>
  );
}
