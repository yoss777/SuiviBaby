import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  mettreAJourPreferencesNotifications,
  obtenirPreferencesNotifications,
} from "@/services/userPreferencesService";
import * as Notifications from "expo-notifications";

export default function NotificationsScreen() {
  const colorScheme = useColorScheme() ?? "light";

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const [marketing, setMarketing] = useState(false);
  const [updates, setUpdates] = useState(true);
  const [tips, setTips] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderThresholds, setReminderThresholds] = useState({
    repas: 0,
    pompages: 0,
    mictions: 0,
    selles: 0,
    vitamines: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
    confirmText: undefined as undefined | string,
    onConfirm: undefined as undefined | (() => void),
  });

  useEffect(() => {
    let isMounted = true;
    const loadPreferences = async () => {
      try {
        const preferences = await obtenirPreferencesNotifications();
        if (!isMounted) return;
        setPushEnabled(preferences.push);
        setEmailEnabled(preferences.email);
        setMarketing(preferences.marketing);
        setUpdates(preferences.updates);
        setTips(preferences.tips);
        const loadedThresholds = {
          repas: preferences.reminders?.thresholds?.repas ?? 0,
          pompages: preferences.reminders?.thresholds?.pompages ?? 0,
          mictions: preferences.reminders?.thresholds?.mictions ?? 0,
          selles: preferences.reminders?.thresholds?.selles ?? 0,
          vitamines: preferences.reminders?.thresholds?.vitamines ?? 0,
        };
        const allDisabled = Object.values(loadedThresholds).every((value) => value === 0);
        setRemindersEnabled(allDisabled ? false : preferences.reminders?.enabled ?? true);
        setReminderThresholds(loadedThresholds);
      } catch (error) {
        if (!isMounted) return;
        setModalConfig({
          visible: true,
          title: "Erreur",
          message: "Impossible de charger les preferences de notifications.",
        });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPreferences();
    return () => {
      isMounted = false;
    };
  }, []);

  const closeModal = () => {
    setModalConfig((prev) => ({
      ...prev,
      visible: false,
      confirmText: undefined,
      onConfirm: undefined,
    }));
  };

  const ensurePushPermission = async () => {
    if (Platform.OS === "web") {
      setModalConfig({
        visible: true,
        title: "Non disponible",
        message: "Les notifications push ne sont pas disponibles sur le web.",
      });
      return false;
    }

    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "granted") return true;

      const requested = await Notifications.requestPermissionsAsync();
      if (requested.status === "granted") return true;

      setModalConfig({
        visible: true,
        title: "Autorisation requise",
        message:
          "Pour activer les notifications push, autorisez-les dans les reglages du systeme.",
        confirmText: "Ouvrir les reglages",
        onConfirm: () => {
          Linking.openSettings();
        },
      });
    } catch (error) {
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de verifier les autorisations de notifications.",
      });
    }

    return false;
  };

  const handleToggle = async (
    key: "push" | "email" | "marketing" | "updates" | "tips",
    value: boolean
  ) => {
    if (isLoading) return;
    const previousValue = {
      push: pushEnabled,
      email: emailEnabled,
      marketing,
      updates,
      tips,
    }[key];

    const setters = {
      push: setPushEnabled,
      email: setEmailEnabled,
      marketing: setMarketing,
      updates: setUpdates,
      tips: setTips,
    };

    if (key === "push" && value) {
      const allowed = await ensurePushPermission();
      if (!allowed) return;
    }

    setters[key](value);

    try {
      await mettreAJourPreferencesNotifications({ [key]: value });
    } catch (error) {
      setters[key](previousValue);
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de mettre a jour les notifications.",
      });
    }
  };

  const renderSwitch = (
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={isLoading}
      trackColor={{
        false: Colors[colorScheme].tabIconDefault + "30",
        true: Colors[colorScheme].tint + "50",
      }}
      thumbColor={value ? Colors[colorScheme].tint : "#f4f3f4"}
      ios_backgroundColor={Colors[colorScheme].tabIconDefault + "30"}
    />
  );

  const renderSettingItem = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <ThemedText style={styles.settingTitle}>{title}</ThemedText>
        <Text
          style={[
            styles.settingDescription,
            { color: Colors[colorScheme].tabIconDefault },
          ]}
        >
          {description}
        </Text>
      </View>
      {renderSwitch(value, onValueChange)}
    </View>
  );

  const updateReminders = async (
    next: Partial<typeof reminderThresholds> | { enabled: boolean }
  ) => {
    const previousEnabled = remindersEnabled;
    const previousThresholds = reminderThresholds;

    const nextThresholds =
      "enabled" in next ? reminderThresholds : { ...reminderThresholds, ...next };
    const allDisabled = Object.values(nextThresholds).every((value) => value === 0);
    const nextEnabled =
      allDisabled ? false : "enabled" in next ? next.enabled : remindersEnabled;

    setRemindersEnabled(nextEnabled);
    setReminderThresholds(nextThresholds);

    try {
      await mettreAJourPreferencesNotifications({
        reminders: {
          enabled: nextEnabled,
          thresholds: nextThresholds,
        },
      });
    } catch (error) {
      setRemindersEnabled(previousEnabled);
      setReminderThresholds(previousThresholds);
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de mettre a jour les rappels.",
      });
    }
  };

  const renderReminderItem = (
    label: string,
    description: string,
    value: number,
    maxHours: number,
    onChange: (nextValue: number) => void
  ) => {
    const isDisabled = !remindersEnabled;
    const isRowMuted = remindersEnabled && value === 0;
    return (
    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <ThemedText
          style={[styles.settingTitle, (isDisabled || isRowMuted) && styles.settingTitleDisabled]}
        >
          {label}
        </ThemedText>
        <Text
          style={[
            styles.settingDescription,
            { color: Colors[colorScheme].tabIconDefault },
            (isDisabled || isRowMuted) && styles.settingDescriptionDisabled,
          ]}
        >
          {description}
        </Text>
      </View>
      <View
        style={[
          styles.pickerContainer,
          {
            borderColor: Colors[colorScheme].tabIconDefault + "30",
            backgroundColor: Colors[colorScheme].background,
          },
          isDisabled && styles.pickerContainerDisabled,
        ]}
      >
        <Picker
          selectedValue={value}
          onValueChange={(itemValue) => onChange(Number(itemValue))}
          enabled={!isLoading && remindersEnabled}
          mode={Platform.OS === "android" ? "dropdown" : "dialog"}
          style={[
            styles.picker,
            {
              color: isDisabled
                ? Colors[colorScheme].tabIconDefault
                : Colors[colorScheme].text,
              backgroundColor: Colors[colorScheme].background,
              height: Platform.OS === "ios" ? 60 : 54,
            },
          ]}
          itemStyle={{
            color: isDisabled
              ? Colors[colorScheme].tabIconDefault
              : Colors[colorScheme].text,
            fontSize: 13,
          }}
          dropdownIconColor={Colors[colorScheme].tabIconDefault}
        >
          <Picker.Item label="Aucun" value={0} />
          {Array.from({ length: maxHours }, (_, index) => index + 1).map(
            (hour) => (
              <Picker.Item key={hour} label={`${hour} h`} value={hour} />
            )
          )}
        </Picker>
      </View>
    </View>
  );
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["top", "bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Notifications",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.section}>
            <ThemedText
              style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}
            >
              Canaux
            </ThemedText>
            {renderSettingItem(
              "Notifications push",
              "Recevoir des notifications sur votre appareil",
              pushEnabled,
              (value) => handleToggle("push", value)
            )}
            {renderSettingItem(
              "Notifications par email",
              "Recevoir des notifications par email",
              emailEnabled,
              (value) => handleToggle("email", value)
            )}
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText
              style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}
            >
              Rappels de suivi
            </ThemedText>
            {renderSettingItem(
              "Activer les rappels",
              "Recevoir une alerte si un suivi dépasse le délai choisi",
              remindersEnabled,
              (value) => updateReminders({ enabled: value })
            )}
            {renderReminderItem(
              "Repas",
              "Délai maximum avant rappel",
              reminderThresholds.repas,
              12,
              (value) => updateReminders({ repas: value })
            )}
            {renderReminderItem(
              "Pompages",
              "Délai maximum avant rappel",
              reminderThresholds.pompages,
              12,
              (value) => updateReminders({ pompages: value })
            )}
            {renderReminderItem(
              "Mictions",
              "Délai maximum avant rappel",
              reminderThresholds.mictions,
              12,
              (value) => updateReminders({ mictions: value })
            )}
            {renderReminderItem(
              "Selles",
              "Délai maximum avant rappel",
              reminderThresholds.selles,
              12,
              (value) => updateReminders({ selles: value })
            )}
            {renderReminderItem(
              "Vitamines",
              "Délai maximum avant rappel (24h max)",
              reminderThresholds.vitamines,
              24,
              (value) => updateReminders({ vitamines: value })
            )}
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText
              style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}
            >
              Infos
            </ThemedText>
            {renderSettingItem(
              "Actualités et mises à jour",
              "Nouvelles fonctionnalités et améliorations",
              updates,
              (value) => handleToggle("updates", value)
            )}
            {renderSettingItem(
              "Conseils santé",
              "Conseils et astuces pour votre santé",
              tips,
              (value) => handleToggle("tips", value)
            )}
            {renderSettingItem(
              "Offres promotionnelles",
              "Informations sur les offres et promotions",
              marketing,
              (value) => handleToggle("marketing", value)
            )}
          </ThemedView>

          <ThemedView style={styles.infoBox}>
            <Ionicons
              name="information-circle"
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.infoText}>
              Vous pouvez modifier vos préférences a tout moment. Les
              notifications critiques relatives a la securite ne peuvent pas
              etre desactivees.
            </ThemedText>
          </ThemedView>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          confirmText={modalConfig.confirmText}
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onClose={closeModal}
          onConfirm={modalConfig.onConfirm}
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
    fontWeight: "600",
    marginBottom: 16,
    // fontSize: 12,
    // fontWeight: '700',
    // textTransform: 'uppercase',
    // letterSpacing: 1,
    // marginBottom: 16,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  settingTitleDisabled: {
    opacity: 0.5,
  },
  settingDescriptionDisabled: {
    opacity: 0.5,
  },
  pickerContainer: {
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  pickerContainerDisabled: {
    opacity: 0.6,
  },
  picker: {
    width: 120,
    height: 54,
  },
  infoBox: {
    flexDirection: "row",
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
