import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const { user } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const handleSave = () => {
    Alert.alert('Succès', 'Profil mis à jour avec succès');
  };

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Profil',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            INFORMATIONS PERSONNELLES
          </ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Prénom</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Entrez votre prénom"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Nom</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Entrez votre nom"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Téléphone</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={phone}
              onChangeText={setPhone}
              placeholder="+33 6 12 34 56 78"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Date de naissance</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="JJ/MM/AAAA"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
            />
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            ADRESSE
          </ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Rue</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={address}
              onChangeText={setAddress}
              placeholder="Numéro et nom de rue"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Ville</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={city}
              onChangeText={setCity}
              placeholder="Ville"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Code postal</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: Colors[colorScheme].background,
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].tabIconDefault + '30',
                },
              ]}
              value={postalCode}
              onChangeText={setPostalCode}
              placeholder="Code postal"
              placeholderTextColor={Colors[colorScheme].tabIconDefault}
              keyboardType="number-pad"
            />
          </View>
        </ThemedView>

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: Colors[colorScheme].tint }]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>Enregistrer les modifications</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
