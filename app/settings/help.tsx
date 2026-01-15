import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InfoModal } from '@/components/ui/InfoModal';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface FAQItem {
  question: string;
  answer: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export default function HelpScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
  });

  const faqs: FAQItem[] = [
    {
      question: 'Comment enregistrer un événement pour mon bébé ?',
      answer:
        'Ouvrez le bébé concerné puis choisissez le type d\'événement (biberon, tétée, sommeil, etc.) et validez.',
      icon: 'add-circle',
    },
    {
      question: 'Comment partager un bébé avec un autre parent ?',
      answer:
        'Allez dans la section de partage et envoyez une invitation ou un code à l\'autre parent.',
      icon: 'share-social',
    },
    {
      question: 'Comment exporter mes données ?',
      answer:
        'Allez dans Paramètres > Exporter les données. Sélectionnez les enfants et les types d\'événements à inclure.',
      icon: 'cloud-download',
    },
    {
      question: 'Comment ajouter un bébé au suivi ?',
      answer:
        'Allez dans le menu principal et sélectionnez "Ajouter un bébé". Remplissez les informations et validez.',
      icon: 'baby',
    },
    {
      question: 'Comment changer mon mot de passe ?',
      answer:
        'Allez dans Paramètres > Mot de passe. Entrez votre mot de passe actuel, puis le nouveau mot de passe deux fois.',
      icon: 'lock-closed',
    },
    {
      question: 'Mes données sont-elles sécurisées ?',
      answer:
        'Oui, vos données sont sécurisées et stockées dans le cloud. Consultez notre politique de confidentialité pour plus de détails.',
      icon: 'shield-checkmark',
    },
  ];

  const supportOptions = [
    {
      id: 'email',
      icon: 'mail' as keyof typeof Ionicons.glyphMap,
      title: 'Email',
      description: 'support@suivibaby.com',
      action: () => setModalConfig({
        visible: true,
        title: 'Email',
        message: 'support@suivibaby.com',
      }),
    },
  ];

  const handleSendMessage = () => {
    if (!subject || !message) {
      setModalConfig({
        visible: true,
        title: 'Erreur',
        message: 'Veuillez remplir tous les champs',
      });
      return;
    }

    setModalConfig({
      visible: true,
      title: 'Message envoye',
      message: 'Nous vous repondrons dans les plus brefs delais.',
    });
    setSubject('');
    setMessage('');
  };

  const renderFAQItem = (item: FAQItem, index: number) => {
    const isExpanded = expandedIndex === index;

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.faqItem,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + '20' },
        ]}
        onPress={() => setExpandedIndex(isExpanded ? null : index)}
        activeOpacity={0.7}
      >
        <View style={styles.faqHeader}>
          <View
            style={[
              styles.faqIcon,
              { backgroundColor: Colors[colorScheme].tint + '15' },
            ]}
          >
            <Ionicons name={item.icon} size={20} color={Colors[colorScheme].tint} />
          </View>
          <ThemedText style={styles.faqQuestion}>
            {item.question}
          </ThemedText>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors[colorScheme].tabIconDefault}
          />
        </View>
        {isExpanded && (
          <Text style={[styles.faqAnswer, { color: Colors[colorScheme].tabIconDefault }]}>
            {item.answer}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderSupportOption = (option: typeof supportOptions[0]) => (
    <TouchableOpacity
      key={option.id}
      style={[
        styles.supportOption,
        { borderColor: Colors[colorScheme].tabIconDefault + '20' },
      ]}
      // onPress={option.action}
      // activeOpacity={0.7}
      activeOpacity={1}
    >
      <View
        style={[
          styles.supportIcon,
          { backgroundColor: Colors[colorScheme].tint + '15' },
        ]}
      >
        <Ionicons name={option.icon} size={24} color={Colors[colorScheme].tint} />
      </View>
      <View style={styles.supportContent}>
        <ThemedText style={styles.supportTitle}>
          {option.title}
        </ThemedText>
        <Text style={[styles.supportDescription, { color: Colors[colorScheme].tabIconDefault }]}>
          {option.description}
        </Text>
      </View>
      {/* <Ionicons
        name="chevron-forward"
        size={20}
        color={Colors[colorScheme].tabIconDefault}
      /> */}
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Aide & Support',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            QUESTIONS FRÉQUENTES
          </ThemedText>
          <View style={styles.faqContainer}>
            {faqs.map(renderFAQItem)}
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            NOUS CONTACTER
          </ThemedText>
          <View style={styles.supportContainer}>
            {supportOptions.map(renderSupportOption)}
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            ENVOYER UN MESSAGE
          </ThemedText>
          <View style={styles.contactForm}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Sujet</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Colors[colorScheme].background,
                    color: Colors[colorScheme].text,
                    borderColor: Colors[colorScheme].tabIconDefault + '30',
                  },
                ]}
                value={subject}
                onChangeText={setSubject}
                placeholder="Quel est le sujet de votre message ?"
                placeholderTextColor={Colors[colorScheme].tabIconDefault}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Message</ThemedText>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: Colors[colorScheme].background,
                    color: Colors[colorScheme].text,
                    borderColor: Colors[colorScheme].tabIconDefault + '30',
                  },
                ]}
                value={message}
                onChangeText={setMessage}
                placeholder="Décrivez votre problème ou question..."
                placeholderTextColor={Colors[colorScheme].tabIconDefault}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors[colorScheme].tint }]}
              onPress={handleSendMessage}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Envoyer le message</Text>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="time-outline" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Notre equipe de support repond generalement sous 24 heures les jours ouvres.
          </ThemedText>
        </ThemedView>
      </ScrollView>
      <InfoModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onClose={() => setModalConfig((prev) => ({ ...prev, visible: false }))}
      />
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
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  faqContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  faqItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  faqIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  faqAnswer: {
    marginTop: 12,
    marginLeft: 48,
    fontSize: 14,
    lineHeight: 20,
  },
  supportContainer: {
    gap: 12,
  },
  supportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    // borderWidth: 1,
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportContent: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  supportDescription: {
    fontSize: 14,
  },
  contactForm: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
