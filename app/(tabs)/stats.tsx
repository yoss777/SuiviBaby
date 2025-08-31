import { ecouterPompages } from '@/services/pompagesService';
import { ecouterTetees } from '@/services/teteesService';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PompagesChart from '../components/PompagesChart';
import TeteesChart from '../components/TeteesChart';

export default function HomeScreen() {
  const [tetees, setTetees] = useState<any[]>([]);
  const [pompages, setPompages] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState<'tetees' | 'pompages'>('tetees');

  // écoute en temps réel des tetees
  useEffect(() => {
    const unsubscribeTetees = ecouterTetees(setTetees);
    return () => unsubscribeTetees();
  }, []);

  // écoute en temps réel des pompages
  useEffect(() => {
    const unsubscribePompages = ecouterPompages(setPompages);
    return () => unsubscribePompages();
  }, []);

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
    marginVertical: 10,
    gap: 10,
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
    paddingBottom: 20,
    alignItems: 'center',
  },
});
