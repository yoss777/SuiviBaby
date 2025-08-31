import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';


// Composant de boutons d'action moderne
const ModernActionButtons = ({ onCancel, onValidate, cancelText = "Annuler", validateText = "Valider" }) => {
  return (
    <View style={styles.buttonContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.cancelButton,
          pressed && styles.buttonPressed
        ]}
        onPress={onCancel}
        android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
      >
        <Text style={styles.cancelButtonText}>{cancelText}</Text>
      </Pressable>
      
      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.validateButton,
          pressed && styles.buttonPressed
        ]}
        onPress={onValidate}
        android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
      >
        <Text style={styles.validateButtonText}>{validateText}</Text>
      </Pressable>
    </View>
  );
};

// Styles optimisés
const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    // backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    // Ombre moderne
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  validateButton: {
    backgroundColor: '#0d82e7ff',
    borderWidth: 1,
    borderColor: '#0d82e7ff',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '600',
  },
  validateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ModernActionButtons;
