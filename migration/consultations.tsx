import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import ConsultationDetailsModal from '../../components/ConsultationDetailsModal';
import { ConsultationCard, type Consultation } from '@mediscope/shared/components/mediscope/consultation-card';
import { ThemedText } from '@mediscope/shared/components/themed-text';
import { ThemedView } from '@mediscope/shared/components/themed-view';
import { Colors } from '@mediscope/shared/constants/theme';
import { useColorScheme } from '@mediscope/shared/hooks/use-color-scheme';
import { useConsultations } from '@mediscope/shared/hooks/use-consultations';
import { useAuth } from '@mediscope/shared/contexts/AuthContext';
import { getUserById } from '@mediscope/shared/services/userService';
import type { Consultation as FirebaseConsultation } from '@mediscope/shared/types/professional';

type FilterType = 'today' | 'upcoming' | 'past';

// Fonction pour formater la date en toutes lettres
const formatDate = (dateStr: string): string => {
  const [day, month, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  return date.toLocaleDateString('fr-FR', options);
};

// Données fictives pour le développement
const demoConsultations: Consultation[] = [
  {
    id: 1,
    name: 'Dr. Mikyas Souamy',
    specialite: 'Radiologie',
    tel: '+33168012345',
    favoris: true,
    date: (() => {
      const today = new Date();
      return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    })(),
    heureDebut: '15:30',
    statut: 'prevue' as const,
    medecinReferent: 'Famayo Hospital',
    notes: 'Consultation de contrôle - À jeun'
  },
  {
    id: 6,
    name: 'Dr. Sarah Martin',
    specialite: 'Cardiologie',
    tel: '+33168012345',
    favoris: true,
    date: '15/12/2025',
    heureDebut: '09:00',
    statut: 'terminee' as const,
    medecinReferent: 'Clinique du Cœur',
    notes: 'Scanner thoracique - Résultats normaux, pas d\'anomalie détectée'
  },
  {
    id: 2,
    name: 'Dr. Fatou Diop',
    specialite: 'Médecine générale',
    tel: '+33168012345',
    favoris: true,
    date: '20/01/2026',
    heureDebut: '14:00',
    statut: 'prevue' as const,
    medecinReferent: 'Cabinet Médical Diop',
    notes: 'Consultation de suivi - Bilan sanguin à apporter'
  },
  {
    id: 3,
    name: 'Dr. Po Li',
    specialite: 'Stomatologie',
    tel: '+33168012345',
    favoris: false,
    date: '08/11/2025',
    heureDebut: '10:00',
    statut: 'terminee' as const,
    medecinReferent: 'Cabinet Dentaire Po',
    notes: 'Détartrage et vérification dentaire'
  },
  {
    id: 4,
    name: 'Dr. Eden Bilongu',
    specialite: 'Physiothérapie',
    tel: '+33168012345',
    favoris: false,
    date: '22/09/2025',
    heureDebut: '16:30',
    statut: 'annulee' as const,
    medecinReferent: 'Eden\'s Relief Center',
    notes: 'Annulation de la séance de rééducation - Problème de planning'
  },
  {
    id: 5,
    name: 'Dr. Mamadou Touba',
    specialite: 'Pharmacien',
    tel: '+33168012345',
    favoris: true,
    date: '05/10/2025',
    heureDebut: '11:30',
    statut: 'terminee' as const,
    medecinReferent: 'Pharmacie Touba',
    notes: 'Renouvellement ordonnance - Médicaments pour diabète'
  },
].sort((a, b) => {
  const parseDate = (dateStr: string) => {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  };
  return parseDate(b.date).getTime() - parseDate(a.date).getTime();
});

// Fonction pour convertir une consultation Firebase en Consultation UI
async function convertFirebaseToUI(fbConsultation: FirebaseConsultation): Promise<Consultation> {
  const date = new Date(fbConsultation.date.seconds * 1000);
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

  // Extraire l'heure de début du timestamp (priorité au champ heureDebut s'il existe)
  const heureDebut = fbConsultation.heureDebut ||
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // Mapper le statut Firebase au statut UI en tenant compte de la date/heure
  let statut: 'terminee' | 'prevue' | 'annulee';
  if (fbConsultation.status === 'terminee') {
    statut = 'terminee';
  } else if (fbConsultation.status === 'annulee') {
    statut = 'annulee';
  } else {
    // Pour les consultations planifiées ou en cours, vérifier si l'heure est passée
    const now = new Date();
    const consultationDateTime = new Date(fbConsultation.date.seconds * 1000);

    // Si la date/heure de la consultation est passée, la marquer comme terminée
    if (consultationDateTime.getTime() < now.getTime()) {
      statut = 'terminee';
    } else {
      statut = 'prevue'; // planifiee ou en_cours
    }
  }

  // Récupérer le nom du professionnel et du cabinet
  let doctorName = 'Médecin';
  let cabinetName = 'Consultation';
  let professionalPhone = '';
  let specialite = 'Consultation';

  if (fbConsultation.professionalId) {
    try {
      const professional = await getUserById(fbConsultation.professionalId);
      if (professional) {
        doctorName = professional.userName || 'Médecin';
        cabinetName = professional.professionalProfile?.clinicName || 'Consultation';
        professionalPhone = professional.professionalProfile?.phone || '';
        specialite = professional.professionalProfile?.speciality || 'Consultation';
      }
    } catch (error) {
      console.error('Erreur récupération professionnel:', error);
    }
  }

  return {
    id: parseInt(fbConsultation.id.substring(0, 8), 16),
    name: doctorName, // Nom du médecin pour l'avatar
    specialite: specialite, // Spécialité du médecin
    tel: professionalPhone,
    favoris: false,
    date: dateStr,
    heureDebut: heureDebut, // Heure extraite du timestamp
    statut,
    notes: fbConsultation.observations || fbConsultation.motif,
    medecinReferent: cabinetName, // Nom du cabinet pour le médecin référent
  };
}

export default function Consultations() {
  const colorScheme = useColorScheme() ?? 'light';
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();

  // Charger les consultations réelles depuis Firebase
  const { consultations: firebaseConsultations, loading, error } = useConsultations(firebaseUser?.uid);

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Convertir les consultations Firebase en consultations UI (avec récupération des professionnels)
  useEffect(() => {
    async function loadConsultationsWithProfessionals() {
      // En DEV, toujours combiner les données fictives avec les données réelles
      const useDemoData = process.env.NODE_ENV !== 'production';

      if (firebaseConsultations.length === 0) {
        // Utiliser les données fictives si pas de consultations réelles
        if (useDemoData) {
          setConsultations(demoConsultations);
        } else {
          setConsultations([]);
        }
        return;
      }

      setLoadingProfessionals(true);
      const converted = await Promise.all(
        firebaseConsultations.map(convertFirebaseToUI)
      );

      // En DEV, combiner les données réelles avec les données fictives
      if (useDemoData) {
        setConsultations([...converted, ...demoConsultations]);
      } else {
        setConsultations(converted);
      }
      setLoadingProfessionals(false);
    }

    loadConsultationsWithProfessionals();
  }, [firebaseConsultations]);

  // Gérer le bouton calendrier
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const newValue = !prev;

      // Si on ouvre le calendrier, sélectionner la date du jour par défaut et réinitialiser le filtre
      if (newValue) {
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      } else {
        // Si on ferme le calendrier, réinitialiser la date sélectionnée
        setSelectedDate(null);
      }

      return newValue;
    });
  }, []);

  // Bouton calendrier dans le header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleCalendarPress}
          style={[
            styles.headerButton,
            showCalendar && {
              backgroundColor: Colors[colorScheme].tint + '20',
            },
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={24}
            color={Colors[colorScheme].tint}
          />
        </Pressable>
      ),
    });
  }, [navigation, showCalendar, colorScheme, handleCalendarPress]);

  // Filtrage des consultations
  const filteredConsultations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return consultations.filter((consultation) => {
      const [day, month, year] = consultation.date.split('/').map(Number);
      const consultationDate = new Date(year, month - 1, day);
      consultationDate.setHours(0, 0, 0, 0);
      const consultationTime = consultationDate.getTime();

      // Si le calendrier est affiché et qu'une date est sélectionnée
      if (showCalendar && selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split('-').map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return consultationTime === calDate.getTime();
      }

      // Sinon, appliquer le filtre sélectionné
      switch (selectedFilter) {
        case 'today':
          return consultationTime === todayTime;
        case 'upcoming':
          return consultationTime > todayTime;
        case 'past':
          return consultationTime < todayTime;
        case null:
        default:
          return true; // Afficher toutes les consultations par défaut
      }
    });
  }, [consultations, selectedFilter, selectedDate, showCalendar]);

  // Grouper les consultations par date
  const groupedConsultations = useMemo(() => {
    const grouped: { [key: string]: Consultation[] } = {};

    filteredConsultations.forEach((consultation) => {
      const dateKey = consultation.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(consultation);
    });

    // Convertir en tableau pour FlatList et trier par date (du plus récent au plus ancien)
    return Object.keys(grouped)
      .map((dateKey) => ({
        date: dateKey,
        consultations: grouped[dateKey],
      }))
      .sort((a, b) => {
        const parseDate = (dateStr: string) => {
          const [day, month, year] = dateStr.split('/').map(Number);
          return new Date(year, month - 1, day).getTime();
        };
        return parseDate(b.date) - parseDate(a.date);
      });
  }, [filteredConsultations]);

  // Préparer les dates marquées pour le calendrier
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    consultations.forEach((consultation) => {
      const [day, month, year] = consultation.date.split('/').map(Number);
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      marked[dateKey] = {
        marked: true,
        dotColor: Colors[colorScheme].tint,
      };
    });

    // Marquer la date sélectionnée
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
      };
    }

    return marked;
  }, [consultations, selectedDate, colorScheme]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleFilterPress = (filter: FilterType) => {
    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);
  };

  const handleToggleFavoris = (item: Consultation) => {
    // TODO: Implémenter la sauvegarde des favoris dans Firebase
    console.log('Toggle favoris:', item.id);
  };

  const handleViewDetails = (item: Consultation) => {
    setSelectedConsultation(item);
    setShowDetailsModal(true);
  };

  const handleCancelConsultation = (item: Consultation) => {
    Alert.alert(
      'Annuler la consultation',
      `Êtes-vous sûr de vouloir annuler votre consultation du ${item.date} avec ${item.name} ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            // TODO: Implémenter l'annulation dans Firebase
            console.log('Annuler consultation:', item.id);
            Alert.alert(
              'Consultation annulée',
              'Votre consultation a été annulée. Le professionnel de santé sera notifié.',
              [{ text: 'OK' }]
            );
          },
        },
      ]
    );
  };

  const handleRescheduleConsultation = (item: Consultation) => {
    Alert.alert(
      'Reprogrammer la consultation',
      `Demande de reprogrammation pour votre consultation du ${item.date} avec ${item.name}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer la demande',
          onPress: () => {
            // TODO: Implémenter la demande de reprogrammation dans Firebase
            console.log('Reprogrammer consultation:', item.id);
            Alert.alert(
              'Demande envoyée',
              'Votre demande de reprogrammation a été envoyée. Le professionnel de santé vous contactera pour fixer un nouveau rendez-vous.',
              [{ text: 'OK' }]
            );
          },
        },
      ]
    );
  };

  const renderSection = ({ item }: { item: { date: string; consultations: Consultation[] } }) => {
    return (
      <View style={styles.section}>
        <View
          style={[
            styles.dateHeader,
            {
              backgroundColor: Colors[colorScheme].tint + '20',
              borderLeftColor: Colors[colorScheme].tint,
            },
          ]}
        >
          <ThemedText
            style={[
              styles.dateText,
              { color: Colors[colorScheme].tint },
            ]}
          >
            {formatDate(item.date)}
          </ThemedText>
        </View>
        {item.consultations.map((consultation) => (
          <ConsultationCard
            key={consultation.id}
            consultation={consultation}
            onToggleFavoris={handleToggleFavoris}
            onViewDetails={handleViewDetails}
          />
        ))}
      </View>
    );
  };

  if (loading || loadingProfessionals) {
    return (
      <ThemedView style={styles.screen}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={Colors[colorScheme].tint}
          />
          <ThemedText style={styles.loadingText}>
            {loading ? 'Chargement des consultations...' : 'Chargement des informations...'}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.screen}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors[colorScheme].error} />
          <ThemedText style={styles.errorText}>Erreur de chargement</ThemedText>
          <ThemedText style={styles.errorSubtext}>{error.message}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <View>
          {/* Filtres */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <Pressable
              onPress={() => handleFilterPress('today')}
              style={[
                styles.filterButton,
                selectedFilter === 'today' && {
                  backgroundColor: Colors[colorScheme].tint,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === 'today' && styles.filterTextActive
                ]}
              >
                Aujourd&apos;hui
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => handleFilterPress('upcoming')}
              style={[
                styles.filterButton,
                selectedFilter === 'upcoming' && {
                  backgroundColor: Colors[colorScheme].tint,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === 'upcoming' && styles.filterTextActive
                ]}
              >
                À venir
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => handleFilterPress('past')}
              style={[
                styles.filterButton,
                selectedFilter === 'past' && {
                  backgroundColor: Colors[colorScheme].tint,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === 'past' && styles.filterTextActive
                ]}
              >
                Passées
              </ThemedText>
            </Pressable>
          </ScrollView>

          {/* Calendrier */}
          {showCalendar && (
            <View style={styles.calendarContainer}>
              <Calendar
                onDayPress={handleDateSelect}
                markedDates={markedDates}
                theme={{
                  backgroundColor: Colors[colorScheme].background,
                  calendarBackground: Colors[colorScheme].background,
                  textSectionTitleColor: Colors[colorScheme].text,
                  selectedDayBackgroundColor: Colors[colorScheme].tint,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: Colors[colorScheme].tint,
                  dayTextColor: Colors[colorScheme].text,
                  textDisabledColor: Colors[colorScheme].tabIconDefault,
                  dotColor: Colors[colorScheme].tint,
                  selectedDotColor: '#ffffff',
                  arrowColor: Colors[colorScheme].tint,
                  monthTextColor: Colors[colorScheme].text,
                  indicatorColor: Colors[colorScheme].tint,
                }}
              />
            </View>
          )}
        </View>

        {/* Liste des consultations */}
        {groupedConsultations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={Colors[colorScheme].tabIconDefault} />
            <ThemedText style={styles.emptyText}>
              {consultations.length === 0
                ? 'Aucune consultation'
                : 'Aucune consultation pour ce filtre'}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={groupedConsultations}
            keyExtractor={(item) => item.date}
            contentContainerStyle={styles.listContent}
            renderItem={renderSection}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/* Modal de détails */}
      <ConsultationDetailsModal
        visible={showDetailsModal}
        consultation={selectedConsultation}
        onClose={() => setShowDetailsModal(false)}
        onCancel={handleCancelConsultation}
        onReschedule={handleRescheduleConsultation}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  loadingText: {
    paddingTop: 10,
    opacity: 0.7,
  },
  errorText: {
    paddingTop: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  errorSubtext: {
    paddingTop: 8,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    paddingTop: 16,
    fontSize: 16,
    opacity: 0.6,
  },
  section: {
    marginBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
