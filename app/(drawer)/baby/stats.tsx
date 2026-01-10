import PompagesChart from '@/components/suivibaby/PompagesChart';
import TeteesChart from '@/components/suivibaby/TeteesChart';
import { useBaby } from '@/contexts/BabyContext';
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterPompagesHybrid as ecouterPompages,
  ecouterTeteesHybrid as ecouterTetees,
} from '@/migration/eventsHybridService';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function StatsScreen() {
  const { activeChild } = useBaby();
  const [tetees, setTetees] = useState<any[]>([]);
  const [pompages, setPompages] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState<'tetees' | 'pompages'>('tetees');
  
  // Récupérer les paramètres de l'URL
  const { tab } = useLocalSearchParams();

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === 'pompages') {
      setSelectedTab('pompages');
    } else {
      setSelectedTab('tetees'); // Par défaut, ou si tab === 'tetees'
    }
  }, [tab]);

  // écoute en temps réel des tetees ET biberons
  useEffect(() => {
    if (!activeChild?.id) return;

    let teteesData: any[] = [];
    let biberonsData: any[] = [];

    const mergeTeteesAndBiberons = () => {
      // Merger les deux listes et trier par date
      const merged = [...teteesData, ...biberonsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
      );
      setTetees(merged);
    };

    const unsubscribeTetees = ecouterTetees(activeChild.id, (tetees) => {
      teteesData = tetees;
      mergeTeteesAndBiberons();
    });

    const unsubscribeBiberons = ecouterBiberons(activeChild.id, (biberons) => {
      biberonsData = biberons;
      mergeTeteesAndBiberons();
    });

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
    };
  }, [activeChild]);

  // écoute en temps réel des pompages
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribePompages = ecouterPompages(activeChild.id, setPompages);
    return () => unsubscribePompages();
  }, [activeChild]);

  return (
    <View style={{ flex: 1 }}>
      {/* BOUTONS DE SÉLECTION */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'tetees' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('tetees')}
        >
          <Text style={[styles.tabText, selectedTab === 'tetees' && styles.tabTextActive]}>
            Tétées
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'pompages' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('pompages')}
        >
          <Text style={[styles.tabText, selectedTab === 'pompages' && styles.tabTextActive]}>
            Pompages
          </Text>
        </TouchableOpacity>
      </View>

      {/* SCROLLVIEW DES CHARTS */}
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {selectedTab === 'tetees' ? (
          <TeteesChart tetees={tetees} />
        ) : (
          <PompagesChart pompages={pompages} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 10,
    gap: 10,
        backgroundColor: "#f8f9fa",

  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#eee',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#4A90E2',
  },
  tabText: {
    fontSize: 16,
    color: '#333',
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: 'white',
  },
  scrollContainer: {
    // paddingBottom: 20,
    alignItems: 'center',
  },
});