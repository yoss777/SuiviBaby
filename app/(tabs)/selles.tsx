import { ajouterSelle, ecouterSelles } from "@/services/sellesService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModernActionButtons from "../components/ModernActionsButton";

export default function MictionsScreen() {
  const [selles, setSelles] = useState<any[]>([]);
  const [showModal, setShowModal] = useState<boolean>(false);

  // date + heure de la tétée
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // écoute en temps réel
  useEffect(() => {
    const unsubscribe = ecouterSelles(setSelles);
    return () => unsubscribe();
  }, []);

  const toggleModal = () => {
    setShowModal(!showModal);
  };

  const cancelForm = useCallback(() => {
    setDateHeure(new Date());
    toggleModal();
  }, [toggleModal]);

  const handleAddSelle = async () => {
    await ajouterSelle({
      date: dateHeure,
    });
    toggleModal();
  };

  // Handlers pour date & heure
  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDate(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate()
        );
        return newDate;
      });
    }
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTime(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setHours(selectedDate.getHours());
        newDate.setMinutes(selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.item}>
      {/* Date & Heure */}
      <View style={styles.itemRowData}>
        <View style={styles.itemCategory}>
          <FontAwesome name="calendar-alt" size={24} color="black" />
          {/* Date seule */}
          <Text style={styles.subtitle}>
            {new Date(item.date?.seconds * 1000).toLocaleString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <View style={styles.itemCategory}>
          <FontAwesome name="clock" size={24} color="black" />
          {/* Heure seule */}
          <Text style={styles.subtitle}>
            {new Date(item.date?.seconds * 1000).toLocaleString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
      {/* Séparateur */}
      {/* <View
        style={{
          borderBottomColor: "#cccccc",
          borderBottomWidth: 1,
          marginVertical: 5,
        }}
      />
      <View style={styles.itemRowData}>
        <View style={styles.itemCategory}>
          <FontAwesome name="toilet" size={24} color="black" />
          <Text style={styles.title}>Miction</Text>
        </View>
      </View> */}
    </View>
  );

  return (
    <View style={styles.container}>
      <Button title="Ajouter une selle" onPress={toggleModal} />

      <FlatList
        data={selles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderItem({ item })}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 20 }}>
            <Text>Aucune selle enregistrée.</Text>
          </View>
        }
      />

      {/* MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showModal}
        onRequestClose={toggleModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalCategoryLabel}>Ajouter une selle</Text>
            {/* Date & Heure */}
            <Text style={styles.modalCategoryLabel}>Date & Heure</Text>

            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                marginBottom: 10,
                justifyContent: "center",
                gap: 10,
              }}
            >
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDate(true)}
              >
                <Text style={styles.dateButtonText}>Choisir la Date</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowTime(true)}
              >
                <Text style={styles.dateButtonText}>Choisir l’Heure</Text>
              </TouchableOpacity>
            </View>

            <View
              style={{
                alignItems: "center",
                marginBottom: 10,
                justifyContent: "space-around",
              }}
            >
              {/* Date seule */}
              <Text style={styles.subtitle}>
                {dateHeure.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>

              {/* Heure seule */}
              <Text style={styles.subtitle}>
                {dateHeure.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>

            {showDate && (
              <DateTimePicker
                value={dateHeure}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeDate}
              />
            )}
            {showTime && (
              <DateTimePicker
                value={dateHeure}
                mode="time"
                is24Hour={true}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeTime}
              />
            )}
            {/* Boutons Annuler / Ajouter */}
            <View style={styles.actionButtonsContainer}>
              <ModernActionButtons
                onCancel={cancelForm}
                onValidate={handleAddSelle}
                cancelText="Annuler"
                validateText="Ajouter"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  item: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "white",
  },
  itemCategory: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    // paddingBottom: 10,
  },
  itemRowData: {
    alignItems: "center",
    marginVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  title: { fontSize: 16, fontWeight: "bold" },
  subtitle: { fontSize: 14, color: "#004cdaff", },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "90%",
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "white",
    borderRadius: 10,
  },
  modalCategoryLabel: {
    fontSize: 18,
    alignSelf: "center",
    fontWeight: "bold",
    paddingVertical: 10,
  },
  dateButton: {
    backgroundColor: "#eee",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
  },
  dateButtonText: { fontSize: 16 },
});
// Note: Le style des boutons Annuler / Ajouter est dans ModernActionsButton.js
