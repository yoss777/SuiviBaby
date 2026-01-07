import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface AddChildModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AddChildModal({ visible, onClose }: AddChildModalProps) {
  const colorScheme = useColorScheme() ?? 'light';

  const handleCreateNew = () => {
    onClose();
    router.push("/(drawer)/add-baby");
  };

  const handleJoinWithCode = () => {
    onClose();
    router.push("/(drawer)/join-child");
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: Colors[colorScheme].background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <FontAwesome name="baby" size={32} color="#4A90E2" />
            <Text style={[styles.title, { color: Colors[colorScheme].text }]}>
              Ajouter un enfant
            </Text>
            <Text style={[styles.subtitle, { color: Colors[colorScheme].text }]}>
              Comment souhaitez-vous procéder ?
            </Text>
          </View>

          <View style={styles.options}>
            {/* Option 1 : Créer un nouvel enfant */}
            <TouchableOpacity
              style={[styles.option, styles.createOption]}
              onPress={handleCreateNew}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                <FontAwesome name="plus-circle" size={32} color="#28a745" />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Créer un nouvel enfant</Text>
                <Text style={styles.optionDescription}>
                  Ajoutez un enfant dont vous êtes le parent
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>

            {/* Option 2 : Rejoindre avec un code */}
            <TouchableOpacity
              style={[styles.option, styles.joinOption]}
              onPress={handleJoinWithCode}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                <FontAwesome name="key" size={32} color="#9C27B0" />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Rejoindre avec un code</Text>
                <Text style={styles.optionDescription}>
                  Accédez à un enfant partagé avec vous
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>
          </View>

          {/* Bouton Annuler */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: 'center',
  },
  options: {
    gap: 12,
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    gap: 12,
  },
  createOption: {
    borderColor: '#28a745',
    backgroundColor: '#e8f5e9',
  },
  joinOption: {
    borderColor: '#9C27B0',
    backgroundColor: '#f3e5f5',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#6c757d',
    lineHeight: 18,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});