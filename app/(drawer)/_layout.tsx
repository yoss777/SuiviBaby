import { useNetInfo } from "@react-native-community/netinfo";
import { DrawerToggleButton } from "expo-router/drawer";
import { Drawer } from "expo-router/drawer";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { CustomDrawerContent } from "@/components/drawer/CustomDrawerContent";
import { BabySwitcherModal } from "@/components/ui/BabySwitcherModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useBaby } from "@/contexts/BabyContext";
import {
  HeaderLeftContext,
  HeaderRightContext,
  useHeaderLeft,
  useHeaderRight,
} from "@/contexts/HeaderContext";
import { DeletionRequestNotifier } from "@/components/suivibaby/DeletionRequestNotifier";
import { InfoModal } from "@/components/ui/InfoModal";
import { FAILED_WRITES_READ_ERROR, useFailedWrites } from "@/hooks/useFailedWrites";
import { onExhaustedChange, onQueueChange } from "@/services/offlineQueueService";

// Contextes du header : définis dans contexts/HeaderContext.tsx, ré-exportés ici
// pour les écrans qui importent encore depuis le layout.
export { useHeaderLeft, useHeaderRight };

function BabyHeaderTitle() {
  const { activeChild, children, setActiveChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const [showSwitcher, setShowSwitcher] = useState(false);

  const hasMultiple = children.length > 1;

  const titleContent = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          color: Colors[colorScheme].text,
          fontSize: 17,
          fontWeight: "600",
          maxWidth: 200,
        }}
      >
        {activeChild?.name || "Suivi Enfant"}
      </Text>
      {hasMultiple && (
        <FontAwesome
          name="chevron-down"
          size={10}
          color={Colors[colorScheme].tabIconDefault}
        />
      )}
    </View>
  );

  if (!hasMultiple) {
    return titleContent;
  }

  return (
    <>
      <Pressable
        onPress={() => setShowSwitcher(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Changer d'enfant"
      >
        {titleContent}
      </Pressable>
      <BabySwitcherModal
        visible={showSwitcher}
        childOptions={children}
        activeChild={activeChild}
        onSelect={(child) => {
          setActiveChild(child);
          setShowSwitcher(false);
        }}
        onClose={() => setShowSwitcher(false)}
      />
    </>
  );
}

// Écran initial du menu (le prop initialRouteName a disparu d'expo-router 58 ;
// `anchor` remplace `unstable_settings.initialRouteName`, déprécié).
export const unstable_settings = {
  anchor: "baby",
};

/** Bouton d'ouverture du menu avec un libellé français (défaut anglais « Show navigation menu »). */
function renderDrawerToggle(props: { tintColor?: ColorValue }) {
  return (
    <DrawerToggleButton tintColor={props.tintColor} accessibilityLabel="Ouvrir le menu" />
  );
}

export default function DrawerLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, loading, status: authStatus } = useAuth();
  const { status: babyStatus } = useBaby();
  const [headerRightState, setHeaderRightState] = useState<{
    component: React.ReactElement | null;
    ownerId?: string;
  }>({ component: null, ownerId: undefined });
  const [headerLeftState, setHeaderLeftState] = useState<{
    component: React.ReactElement | null;
    ownerId?: string;
  }>({ component: null, ownerId: undefined });
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  // Écritures réellement en attente d'envoi au serveur. Distinct de
  // authStatus/babyStatus, qui ne décrivent que la fraîcheur de l'affichage.
  const [pendingWrites, setPendingWrites] = useState(0);
  useEffect(() => onQueueChange(setPendingWrites), []);

  // Écritures abandonnées (refus définitif, conflit, serveur en échec répété) :
  // jamais perdues en silence, l'utilisateur peut les voir, les réessayer ou
  // les supprimer.
  const [failedWrites, setFailedWrites] = useState(0);
  const failed = useFailedWrites();
  useEffect(() => onExhaustedChange(setFailedWrites), []);
  const openFailedList = failed.open;

  const setHeaderRight = useCallback(
    (component: React.ReactElement | null, ownerId?: string) => {
      setHeaderRightState((prev) => {
        if (component === null) {
          if (!ownerId) {
            return { component: null, ownerId: undefined };
          }
          if (prev.ownerId && prev.ownerId !== ownerId) {
            return prev;
          }
          return { component: null, ownerId: undefined };
        }

        return { component, ownerId };
      });
    },
    [],
  );

  const setHeaderLeft = useCallback(
    (component: React.ReactElement | null, ownerId?: string) => {
      setHeaderLeftState((prev) => {
        if (component === null) {
          if (!ownerId) {
            return { component: null, ownerId: undefined };
          }
          if (prev.ownerId && prev.ownerId !== ownerId) {
            return prev;
          }
          return { component: null, ownerId: undefined };
        }

        return { component, ownerId };
      });
    },
    [],
  );

  // R10: Auth redirect is handled by boot.tsx — just guard against null user
  if (loading || !user) {
    return null;
  }

  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;

  // Deux conditions distinctes, longtemps confondues sous un seul bandeau
  // "Synchronisation en cours" :
  //  - des écritures attendent d'être envoyées (risque de perte réel) ;
  //  - l'affichage repose sur du cache en attendant les listeners Firestore
  //    (aucun risque, purement cosmétique).
  // Les afficher pareil laissait croire à une sync active alors que la queue
  // était vide, et surtout ne signalait RIEN quand des écritures étaient
  // réellement bloquées.
  const hasPendingWrites = pendingWrites > 0;
  const isStaleDisplay =
    !hasPendingWrites &&
    (authStatus === "degraded" || babyStatus === "degraded");
  const showSyncBanner = hasPendingWrites || isStaleDisplay;
  const syncLabel = hasPendingWrites
    ? `${pendingWrites} ${pendingWrites > 1 ? "événements en attente d'envoi" : "événement en attente d'envoi"}`
    : "Actualisation des données…";

  return (
    <HeaderRightContext.Provider value={{ setHeaderRight }}>
      <HeaderLeftContext.Provider value={{ setHeaderLeft }}>
        <View
          style={[
            styles.container,
            { backgroundColor: Colors[colorScheme].background },
          ]}
        >
          {isOffline && (
            <View style={[styles.offlineBanner, { paddingTop: insets.top, backgroundColor: colorScheme === "dark" ? "rgba(153, 27, 27, 0.3)" : "#fdecec" }]}>
              <Text style={[styles.offlineText, { color: colorScheme === "dark" ? "#fca5a5" : "#b42318" }]} accessibilityRole="alert">Hors ligne</Text>
            </View>
          )}
          {failedWrites > 0 && (
            <Pressable
              onPress={openFailedList}
              accessibilityRole="button"
              accessibilityLabel={`${failedWrites} enregistrement${failedWrites > 1 ? "s" : ""} non envoyé${failedWrites > 1 ? "s" : ""}. Appuyez pour voir le détail.`}
              style={[
                styles.syncBanner,
                {
                  paddingTop: isOffline ? 4 : insets.top + 4,
                  backgroundColor: colorScheme === "dark" ? "rgba(153, 27, 27, 0.3)" : "#fdecec",
                },
              ]}
            >
              <Text
                style={[
                  styles.syncText,
                  { color: colorScheme === "dark" ? "#fca5a5" : "#b42318" },
                ]}
              >
                {failedWrites > 1
                  ? `${failedWrites} enregistrements non envoyés · Appuyez pour voir`
                  : "1 enregistrement non envoyé · Appuyez pour voir"}
              </Text>
            </Pressable>
          )}
          {showSyncBanner && (
            <View
              style={[
                styles.syncBanner,
                {
                  paddingTop: isOffline ? 4 : insets.top + 4,
                  // Ambre quand des écritures attendent (action possible de
                  // l'utilisateur : rester connecté), bleu pour un simple
                  // rafraîchissement d'affichage.
                  backgroundColor: hasPendingWrites
                    ? colorScheme === "dark"
                      ? "rgba(245, 158, 11, 0.18)"
                      : "#fef3c7"
                    : colorScheme === "dark"
                      ? "rgba(56, 189, 248, 0.18)"
                      : "#e0f2fe",
                },
              ]}
            >
              <Text
                style={[
                  styles.syncText,
                  {
                    color: hasPendingWrites
                      ? colorScheme === "dark"
                        ? "#fcd34d"
                        : "#92400e"
                      : colorScheme === "dark"
                        ? "#7dd3fc"
                        : "#075985",
                  },
                ]}
                accessibilityLabel={syncLabel}
              >
                {syncLabel}
              </Text>
            </View>
          )}
          <InfoModal
            visible={failed.state.status !== "closed"}
            title="Enregistrements non envoyés"
            message={
              <View>
                <Text style={{ color: Colors[colorScheme].text }}>
                  {failed.state.status === "error"
                    ? FAILED_WRITES_READ_ERROR
                    : failed.state.status === "ready" && failed.state.rows.length > 0
                      ? `${failed.state.rows.map((row) => row.label).join("\n")}\n\nCes saisies n'ont pas pu être envoyées au serveur. Réessayez, ou supprimez-les si elles ne sont plus utiles.`
                      : "Aucun enregistrement en échec."}
                </Text>
                {failed.state.status === "ready" && failed.state.rows.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={failed.deleteShown}
                    style={{ marginTop: 12 }}
                  >
                    <Text style={{ color: "#b42318", fontWeight: "700" }}>Supprimer ces saisies</Text>
                  </Pressable>
                )}
              </View>
            }
            confirmText="Réessayer"
            dismissText="Fermer"
            backgroundColor={Colors[colorScheme].background}
            textColor={Colors[colorScheme].text}
            allowBackdropDismiss
            onClose={failed.close}
            onConfirm={() => void failed.retry()}
          />
          <Drawer
            backBehavior="initialRoute"
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              drawerActiveTintColor: Colors[colorScheme].tint,
              overlayAccessibilityLabel: "Fermer le menu",
              headerLeft: renderDrawerToggle,
              headerTintColor: Colors[colorScheme].text,
              headerStyle: {
                backgroundColor: Colors[colorScheme].background,
              },
              sceneStyle: {
                backgroundColor: Colors[colorScheme].background,
              },
            }}
          >
            <Drawer.Screen
              name="settings"
              options={{
                title: "Paramètres",
                drawerItemStyle: { display: "none" },
              }}
            />

            {/* Section: Suivi Bébé */}
            <Drawer.Screen
              name="baby"
              options={{
                headerTitle: () => <BabyHeaderTitle />,
                headerTitleAlign: "center",
                drawerItemStyle: { display: "none" },
                headerRight: headerRightState.component
                  ? () => headerRightState.component
                  : undefined,
                headerLeft: headerLeftState.component
                  ? () => headerLeftState.component
                  : renderDrawerToggle,
              }}
            />
            <Drawer.Screen
              name="add-baby"
              options={{
                title: "Ajouter un enfant",
                drawerItemStyle: { display: "none" },
              }}
            />
            <Drawer.Screen
              name="share-child"
              options={{
                title: "Partage",
                drawerItemStyle: { display: "none" },
                headerLeft: headerLeftState.component
                  ? () => headerLeftState.component
                  : renderDrawerToggle,
              }}
            />
          </Drawer>
          <DeletionRequestNotifier />
        </View>
      </HeaderLeftContext.Provider>
    </HeaderRightContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  offlineBanner: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 6,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  syncBanner: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  syncText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
