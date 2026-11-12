import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { neutralColors } from "@/constants/dashboardColors";

interface AddChildModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AddChildModal({ visible, onClose }: AddChildModalProps) {
  const { push: guardedPush } = useGuardedNavigation();
  const colorScheme = useColorScheme() ?? "light";

  const handleCreateNew = () => {
    onClose();
    guardedPush("/(drawer)/add-baby");
  };

  const handleJoinWithCode = () => {
    onClose();
    guardedPush("/settings/join-child");
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
          style={[
            styles.modalContent,
            { backgroundColor: Colors[colorScheme].surface },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <FontAwesome name="baby" size={32} color={Colors[colorScheme].tint} />
            <Text style={[styles.title, { color: Colors[colorScheme].text }]}>
              Ajouter un enfant
            </Text>
            <Text
              style={[styles.subtitle, { color: Colors[colorScheme].text }]}
            >
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
                <FontAwesome name="circle-plus" size={32} color={eventColors.pumping.dark} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Créer un nouvel enfant</Text>
                <Text style={styles.optionDescription}>
                  Ajoutez un enfant dont vous êtes le parent
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={20} color={neutralColors.textMuted} />
            </TouchableOpacity>

            {/* Option 2 : Rejoindre avec un code */}
            <TouchableOpacity
              style={[styles.option, styles.joinOption]}
              onPress={handleJoinWithCode}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                <FontAwesome name="key" size={32} color={eventColors.vaccin.dark} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Rejoindre avec un code</Text>
                <Text style={styles.optionDescription}>
                  Accédez à un enfant partagé avec vous
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={20} color={neutralColors.textMuted} />
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: "center",
  },
  options: {
    gap: 12,
    marginBottom: 20,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    gap: 12,
  },
  createOption: {
    borderColor: eventColors.pumping.dark,
    backgroundColor: eventColors.pumping.light,
  },
  joinOption: {
    borderColor: eventColors.vaccin.dark,
    backgroundColor: eventColors.vaccin.light,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: neutralColors.textStrong,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: neutralColors.textLight,
    lineHeight: 18,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: neutralColors.backgroundPressed,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: neutralColors.textLight,
  },
});
