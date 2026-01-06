import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface ModernActionButtonsProps {
  onCancel: () => void;
  onValidate: () => void;
  onDelete?: () => void; // Optionnel pour le mode édition
  cancelText?: string;
  validateText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  loadingText?: string; // Texte optionnel pendant le chargement
}

// Composant de boutons d'action moderne
const ModernActionButtons: React.FC<ModernActionButtonsProps> = ({
  onCancel,
  onValidate,
  onDelete,
  cancelText = "Annuler",
  validateText = "Valider",
  isLoading = false,
  disabled = false,
  loadingText
}) => {
  const isValidateDisabled = disabled || isLoading;
  const displayText = isLoading && loadingText ? loadingText : validateText;

  return (
    <View style={styles.buttonContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.cancelButton,
          pressed && !isLoading && styles.buttonPressed,
          isLoading && styles.cancelButtonDisabled
        ]}
        onPress={onCancel}
        disabled={isLoading}
        android_ripple={{ color: isLoading ? 'transparent' : 'rgba(0, 0, 0, 0.1)' }}
      >
        <Text style={[
          styles.cancelButtonText,
          isLoading && styles.cancelButtonTextDisabled
        ]}>
          {cancelText}
        </Text>
      </Pressable>

      {onDelete && (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.deleteButton,
            pressed && !isLoading && styles.buttonPressed,
            isLoading && styles.deleteButtonDisabled
          ]}
          onPress={onDelete}
          disabled={isLoading}
          android_ripple={{ color: isLoading ? 'transparent' : 'rgba(255, 255, 255, 0.2)' }}
        >
          <Text style={[
            styles.deleteButtonText,
            isLoading && styles.deleteButtonTextDisabled
          ]}>
            Supprimer
          </Text>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.validateButton,
          pressed && !isValidateDisabled && styles.buttonPressed,
          isValidateDisabled && styles.validateButtonDisabled
        ]}
        onPress={onValidate}
        disabled={isValidateDisabled}
        android_ripple={{ color: isValidateDisabled ? 'transparent' : 'rgba(255, 255, 255, 0.2)' }}
      >
        <View style={styles.validateButtonContent}>
          {isLoading && (
            <ActivityIndicator
              size="small"
              color="#ffffff"
              style={styles.loadingIndicator}
            />
          )}
          <Text style={[
            styles.validateButtonText,
            isValidateDisabled && styles.validateButtonTextDisabled
          ]}>
            {displayText}
          </Text>
        </View>
      </Pressable>
    </View>
  );
};

// Styles optimisés
const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
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
  cancelButtonDisabled: {
    backgroundColor: 'rgba(248, 248, 248, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  validateButton: {
    backgroundColor: '#0d82e7ff',
    borderWidth: 1,
    borderColor: '#0d82e7ff',
  },
  validateButtonDisabled: {
    backgroundColor: '#a8a8a8',
    borderColor: '#a8a8a8',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  validateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIndicator: {
    marginHorizontal: 8,
    paddingLeft:20,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonTextDisabled: {
    color: '#bbb',
  },
  validateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  validateButtonTextDisabled: {
    color: '#ffffff',
    opacity: 0.7,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  deleteButtonDisabled: {
    backgroundColor: '#f8d7da',
    borderColor: '#f8d7da',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButtonTextDisabled: {
    color: '#ffffff',
    opacity: 0.7,
  },
});

export default ModernActionButtons;