// components/suivibaby/VoiceCommandButton.tsx
import { useBaby } from '@/contexts/BabyContext';
import { useVoiceCommand } from '@/hooks/useVoiceCommand';
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface VoiceCommandButtonProps {
  size?: number;
  color?: string;
  showTestToggle?: boolean; // Afficher le bouton de bascule test/prod
}

export function VoiceCommandButton({ 
  size = 18, 
  color = "#4A90E2",
  showTestToggle = false,
}: VoiceCommandButtonProps) {
  const { activeChild } = useBaby();
  const { 
    isRecording, 
    isProcessing,
    testMode,
    startVoiceCommand, 
    stopVoiceCommand,
    toggleTestMode,
  } = useVoiceCommand(activeChild?.id || '', true); // true = mode test par défaut

  const handlePress = () => {
    if (isRecording) {
      stopVoiceCommand();
    } else if (!isProcessing) {
      startVoiceCommand();
    }
  };

  if (isProcessing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Bouton principal microphone */}
      <Pressable 
        onPress={handlePress}
        style={[
          styles.mainButton,
          isRecording && styles.recording
        ]}
      >
        <FontAwesome 
          name="microphone" 
          size={size} 
          color={isRecording ? "#E74C3C" : color} 
          solid={isRecording}
        />
        {isRecording && (
          <View style={styles.recordingDot} />
        )}
      </Pressable>

      {/* Badge indicateur mode test (optionnel) */}
      {showTestToggle && (
        <Pressable 
          onPress={toggleTestMode}
          style={[
            styles.modeBadge,
            testMode ? styles.testModeBadge : styles.prodModeBadge
          ]}
        >
          <Text style={styles.modeText}>
            {testMode ? 'TEST' : 'PROD'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  container: {
    paddingHorizontal: 10,
  },
  mainButton: {
    paddingHorizontal: 10,
    position: 'relative',
  },
  recording: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderRadius: 20,
    padding: 8,
  },
  recordingDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  testModeBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderColor: '#FF9800',
  },
  prodModeBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: '#4CAF50',
  },
  modeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});