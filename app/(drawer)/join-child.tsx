import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  acceptInvitation,
  getPendingInvitations,
  rejectInvitation,
  useShareCode,
  type ShareInvitation
} from '@/services/childSharingService';
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';

export default function JoinChildScreen() {
  const colorScheme = useColorScheme();
  const [shareCode, setShareCode] = useState("");
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<ShareInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [processingInvitation, setProcessingInvitation] = useState<string | null>(null);

  // Charger les invitations en attente
  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const invites = await getPendingInvitations();
      setPendingInvitations(invites);
    } catch (error) {
      console.error('Erreur chargement invitations:', error);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleUseCode = async () => {
    if (!shareCode.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un code');
      return;
    }

    setIsLoadingCode(true);
    try {
      const result = await useShareCode(shareCode.trim().toUpperCase());
      
      Alert.alert(
        'Succès !',
        `Vous avez maintenant accès au suivi de ${result.childName}`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/explore'),
          },
        ]
      );
      
      setShareCode('');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Code invalide');
    } finally {
      setIsLoadingCode(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string, childName: string) => {
    setProcessingInvitation(invitationId);
    try {
      await acceptInvitation(invitationId);
      
      Alert.alert(
        'Invitation acceptée !',
        `Vous avez maintenant accès au suivi de ${childName}`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/explore'),
          },
        ]
      );
      
      await loadInvitations();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter l\'invitation');
    } finally {
      setProcessingInvitation(null);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    Alert.alert(
      'Refuser l\'invitation',
      'Êtes-vous sûr de vouloir refuser cette invitation ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            setProcessingInvitation(invitationId);
            try {
              await rejectInvitation(invitationId);
              await loadInvitations();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de refuser l\'invitation');
            } finally {
              setProcessingInvitation(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <FontAwesome name="user-plus" size={48} color="#4A90E2" />
            <Text style={styles.title}>Rejoindre un suivi</Text>
            <Text style={styles.subtitle}>
              Accédez au suivi d'un enfant partagé avec vous
            </Text>
          </View>

          {/* Invitations en attente */}
          {!loadingInvitations && pendingInvitations.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="envelope" size={20} color="#28a745" />
                <Text style={styles.sectionTitle}>Invitations en attente</Text>
              </View>

              {pendingInvitations.map((invitation) => (
                <View key={invitation.id} style={styles.invitationCard}>
                  <View style={styles.invitationHeader}>
                    <FontAwesome name="baby" size={24} color="#4A90E2" />
                    <View style={styles.invitationInfo}>
                      <Text style={styles.invitationChildName}>
                        {invitation.childName}
                      </Text>
                      <Text style={styles.invitationFrom}>
                        De : {invitation.inviterEmail}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.invitationActions}>
                    <TouchableOpacity
                      style={[styles.invitationButton, styles.rejectButton]}
                      onPress={() => handleRejectInvitation(invitation.id!)}
                      disabled={processingInvitation === invitation.id}
                      activeOpacity={0.7}
                    >
                      {processingInvitation === invitation.id ? (
                        <ActivityIndicator size="small" color="#dc3545" />
                      ) : (
                        <>
                          <FontAwesome name="times" size={16} color="#dc3545" />
                          <Text style={styles.rejectButtonText}>Refuser</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.invitationButton, styles.acceptButton]}
                      onPress={() => handleAcceptInvitation(invitation.id!, invitation.childName)}
                      disabled={processingInvitation === invitation.id}
                      activeOpacity={0.7}
                    >
                      {processingInvitation === invitation.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <>
                          <FontAwesome name="check" size={16} color="white" />
                          <Text style={styles.acceptButtonText}>Accepter</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Utiliser un code */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="qrcode" size={20} color="#9C27B0" />
              <Text style={styles.sectionTitle}>Code de partage</Text>
            </View>
            <Text style={styles.sectionDescription}>
              Saisissez le code de 6 caractères qui vous a été partagé
            </Text>

            <View style={styles.codeForm}>
              <View style={styles.inputContainer}>
                <FontAwesome name="key" size={16} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="ABC123"
                  value={shareCode}
                  onChangeText={(text) => setShareCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                  editable={!isLoadingCode}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, isLoadingCode && styles.buttonDisabled]}
                onPress={handleUseCode}
                disabled={isLoadingCode}
                activeOpacity={0.7}
              >
                {isLoadingCode ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <FontAwesome name="unlock" size={18} color="white" />
                    <Text style={styles.submitButtonText}>Valider le code</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Information */}
          <View style={styles.infoBox}>
            <FontAwesome name="info-circle" size={20} color="#17a2b8" />
            <Text style={styles.infoText}>
              Une fois l'accès validé, vous pourrez voir toutes les informations et le suivi de l'enfant partagé avec vous.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    padding: 32,
    paddingTop: 48,
    backgroundColor: "white",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#212529",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6c757d",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 20,
  },
  invitationCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationChildName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
  },
  invitationFrom: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  invitationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  rejectButton: {
    backgroundColor: '#fff5f5',
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  rejectButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: '#28a745',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  codeForm: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e9ecef",
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: "#333",
    letterSpacing: 4,
  },
  submitButton: {
    backgroundColor: '#9C27B0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 12,
    borderRadius: 12,
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#d1ecf1",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#17a2b8",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#0c5460",
    lineHeight: 20,
  },
});