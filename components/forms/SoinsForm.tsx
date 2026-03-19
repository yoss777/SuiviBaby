import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterMedicament,
  ajouterSymptome,
  ajouterTemperature,
  ajouterVaccin,
  ajouterVitamine,
  modifierMedicament,
  modifierSymptome,
  modifierTemperature,
  modifierVaccin,
  modifierVitamine,
  supprimerMedicament,
  supprimerSymptome,
  supprimerTemperature,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
import { normalizeQuery } from "@/utils/text";

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

export type SoinsType = "temperature" | "medicament" | "symptome" | "vaccin" | "vitamine";

type ModePrise = "axillaire" | "auriculaire" | "buccale" | "frontale" | "rectale" | "autre";
type Voie = "orale" | "topique" | "inhalation" | "autre";
type Intensite = "léger" | "modéré" | "fort";

export interface SoinsEditData {
  id: string;
  type: SoinsType;
  date: Date;
  note?: string;
  // Temperature fields
  valeur?: number;
  modePrise?: ModePrise;
  // Medicament fields
  nomMedicament?: string;
  dosage?: string;
  voie?: Voie;
  // Symptome fields
  symptomes?: string[];
  intensite?: Intensite;
  // Vaccin fields
  nomVaccin?: string;
  // Vitamine fields
  nomVitamine?: string;
}

export interface SoinsFormProps {
  initialType?: SoinsType;
  onSuccess: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (isInPicker: boolean) => void;
  editData?: SoinsEditData;
  onDelete?: () => void;
}

type FormStep = "form" | "vaccinPicker" | "vitaminePicker";

// ============================================
// CONSTANTS
// ============================================

const TYPE_CONFIG: Record<SoinsType, { label: string; color: string; icon: string }> = {
  temperature: {
    label: "Température",
    color: eventColors.temperature.dark,
    icon: "temperature-half",
  },
  medicament: {
    label: "Médicament",
    color: eventColors.medicament.dark,
    icon: "pills",
  },
  symptome: {
    label: "Symptôme",
    color: eventColors.symptome.dark,
    icon: "virus",
  },
  vaccin: {
    label: "Vaccin",
    color: eventColors.vaccin.dark,
    icon: "syringe",
  },
  vitamine: {
    label: "Vitamine",
    color: eventColors.vitamine.dark,
    icon: "pills",
  },
};

const VACCINS_LIST = [
  { nomVaccin: "BCG (Tuberculose)", dosage: null },
  { nomVaccin: "Bronchiolite", dosage: null },
  { nomVaccin: "DTCaP", dosage: "rappel" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "1ère injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "2ème injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "3ème injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "rappel" },
  { nomVaccin: "Grippe saisonnière", dosage: "" },
  { nomVaccin: "Hépatite B", dosage: "" },
  { nomVaccin: "Méningocoque A,C,W,Y", dosage: "1ère injection" },
  { nomVaccin: "Méningocoque A,C,W,Y", dosage: "rappel" },
  { nomVaccin: "Méningocoque B", dosage: "1ère injection" },
  { nomVaccin: "Méningocoque B", dosage: "rappel" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "1ère injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "2ème injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "3ème injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "rappel" },
  { nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)", dosage: "1ère injection" },
  { nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)", dosage: "2ème injection" },
  { nomVaccin: "Rotavirus", dosage: "1ère injection" },
  { nomVaccin: "Rotavirus", dosage: "2ème injection" },
  { nomVaccin: "Rotavirus", dosage: "3ème injection" },
  { nomVaccin: "Varicelle", dosage: "" },
  { nomVaccin: "Autre vaccin", dosage: "" },
];

const VITAMINES_LIST = ["Vitamine D", "Vitamine K", "Autre vitamine"];

const MODE_TEMPERATURE: ModePrise[] = [
  "axillaire",
  "auriculaire",
  "buccale",
  "frontale",
  "rectale",
  "autre",
];

const VOIES_MEDICAMENT: Voie[] = ["orale", "topique", "inhalation", "autre"];

const INTENSITES: Intensite[] = ["léger", "modéré", "fort"];

const SYMPTOMES_OPTIONS = [
  "fièvre",
  "toux",
  "nez bouché",
  "vomis",
  "diarrhée",
  "dents",
  "autre",
];

// ============================================
// COMPONENT
// ============================================

export function SoinsForm({
  initialType = "temperature",
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
}: SoinsFormProps) {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  const isEditing = !!editData;

  // Form step state
  const [formStep, setFormStepInternal] = useState<FormStep>("form");
  const [searchQuery, setSearchQuery] = useState("");

  // Wrapper to notify parent of step changes
  const setFormStep = useCallback((step: FormStep) => {
    setFormStepInternal(step);
    onFormStepChange?.(step !== "form");
  }, [onFormStepChange]);

  // Type selection state
  const [selectedType, setSelectedType] = useState<SoinsType>(
    editData?.type ?? initialType
  );
  const [includeTemperature, setIncludeTemperature] = useState(
    editData?.type === "temperature" || initialType === "temperature"
  );
  const [includeSymptome, setIncludeSymptome] = useState(
    editData?.type === "symptome" || initialType === "symptome"
  );

  // Common state
  const [dateHeure, setDateHeure] = useState<Date>(editData?.date ?? new Date());
  const [note, setNote] = useState(editData?.note ?? "");

  // Temperature state
  const [temperatureValue, setTemperatureValue] = useState(editData?.valeur ?? 36.8);
  const [temperatureMode, setTemperatureMode] = useState<ModePrise>(
    editData?.modePrise ?? "axillaire"
  );

  // Medicament state
  const [medicamentName, setMedicamentName] = useState(editData?.nomMedicament ?? "");
  const [medicamentDosage, setMedicamentDosage] = useState(editData?.dosage ?? "");
  const [medicamentVoie, setMedicamentVoie] = useState<Voie | undefined>(editData?.voie);

  // Symptome state
  const [symptomes, setSymptomes] = useState<string[]>(editData?.symptomes ?? []);
  const [symptomeAutre, setSymptomeAutre] = useState("");
  const [symptomeIntensite, setSymptomeIntensite] = useState<Intensite | undefined>(
    editData?.intensite
  );

  // Vaccin state
  const [vaccinName, setVaccinName] = useState(() => {
    if (editData?.nomVaccin) {
      const isKnown = VACCINS_LIST.some(v => v.nomVaccin === editData.nomVaccin);
      return isKnown ? editData.nomVaccin : "Autre vaccin";
    }
    return "";
  });
  const [vaccinDosage, setVaccinDosage] = useState(editData?.dosage ?? "");
  const [vaccinCustomName, setVaccinCustomName] = useState(() => {
    if (editData?.nomVaccin) {
      const isKnown = VACCINS_LIST.some(v => v.nomVaccin === editData.nomVaccin);
      return isKnown ? "" : editData.nomVaccin;
    }
    return "";
  });

  // Vitamine state
  const [vitamineName, setVitamineName] = useState(() => {
    if (editData?.nomVitamine) {
      return VITAMINES_LIST.includes(editData.nomVitamine)
        ? editData.nomVitamine
        : "Autre vitamine";
    }
    return initialType === "vitamine" ? "Vitamine D" : "";
  });
  const [vitamineDosage, setVitamineDosage] = useState(editData?.dosage ?? "");
  const [vitamineCustomName, setVitamineCustomName] = useState(() => {
    if (editData?.nomVitamine && !VITAMINES_LIST.includes(editData.nomVitamine)) {
      return editData.nomVitamine;
    }
    return "";
  });
  const [gouttesCount, setGouttesCount] = useState(() => {
    if (editData?.dosage) {
      const match = editData.dosage.match(/(\d+)\s*gouttes?/i);
      return match ? parseInt(match[1], 10) : 3;
    }
    return 3;
  });

  // Long press acceleration refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback((action: () => void) => {
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 80);
    }, 400);
  }, []);

  const handlePressOut = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Filtered lists for pickers
  const filteredVaccins = useMemo(
    () =>
      VACCINS_LIST.filter((vaccin) =>
        normalizeQuery(vaccin.nomVaccin).includes(normalizeQuery(searchQuery))
      ),
    [searchQuery]
  );

  const filteredVitamines = useMemo(
    () =>
      VITAMINES_LIST.filter((vitamine) =>
        normalizeQuery(vitamine).includes(normalizeQuery(searchQuery))
      ),
    [searchQuery]
  );

  // Templates
  type TemplateItem = { label: string; onPress: () => void };
  type TemplateSection = { title?: string; items: TemplateItem[] };

  const getTemplates = useCallback((): TemplateSection[] => {
    const keepCombined = includeTemperature && includeSymptome;

    const temperatureItems = [
      {
        label: "36.8° axillaire",
        onPress: () => {
          setIncludeTemperature(true);
          setIncludeSymptome(keepCombined);
          setSelectedType("temperature");
          setTemperatureValue(36.8);
          setTemperatureMode("axillaire");
        },
      },
      {
        label: "38.5° rectale",
        onPress: () => {
          setIncludeTemperature(true);
          setIncludeSymptome(keepCombined);
          setSelectedType("temperature");
          setTemperatureValue(38.5);
          setTemperatureMode("rectale");
        },
      },
      {
        label: "37.5° frontale",
        onPress: () => {
          setIncludeTemperature(true);
          setIncludeSymptome(keepCombined);
          setSelectedType("temperature");
          setTemperatureValue(37.5);
          setTemperatureMode("frontale");
        },
      },
    ];

    const symptomeItems = [
      {
        label: "Fièvre légère",
        onPress: () => {
          setIncludeTemperature(keepCombined);
          setIncludeSymptome(true);
          setSelectedType("symptome");
          setSymptomes(["fièvre"]);
          setSymptomeIntensite("léger");
          setSymptomeAutre("");
        },
      },
      {
        label: "Rhume léger",
        onPress: () => {
          setIncludeTemperature(keepCombined);
          setIncludeSymptome(true);
          setSelectedType("symptome");
          setSymptomes(["toux", "nez bouché"]);
          setSymptomeIntensite("léger");
          setSymptomeAutre("");
        },
      },
      {
        label: "Dentition",
        onPress: () => {
          setIncludeTemperature(keepCombined);
          setIncludeSymptome(true);
          setSelectedType("symptome");
          setSymptomes(["dents"]);
          setSymptomeIntensite("modéré");
          setSymptomeAutre("");
        },
      },
    ];

    const medicamentItems = [
      {
        label: "Paracétamol 5 ml",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("medicament");
          setMedicamentName("Paracétamol");
          setMedicamentDosage("5 ml");
          setMedicamentVoie("orale");
        },
      },
      {
        label: "Ibuprofène 2.5 ml",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("medicament");
          setMedicamentName("Ibuprofène");
          setMedicamentDosage("2.5 ml");
          setMedicamentVoie("orale");
        },
      },
      {
        label: "Sérum physio",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("medicament");
          setMedicamentName("Sérum physiologique");
          setMedicamentDosage("");
          setMedicamentVoie("topique");
        },
      },
    ];

    const vaccinItems = [
      {
        label: "Rotavirus 1ère",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vaccin");
          setVaccinName("Rotavirus");
          setVaccinDosage("1ère injection");
          setVaccinCustomName("");
        },
      },
      {
        label: "ROR 1ère",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vaccin");
          setVaccinName("ROR (Rougeole, Oreillons, Rubéole)");
          setVaccinDosage("1ère injection");
          setVaccinCustomName("");
        },
      },
      {
        label: "Pneumo 1ère",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vaccin");
          setVaccinName("Pneumocoque (PCV13)");
          setVaccinDosage("1ère injection");
          setVaccinCustomName("");
        },
      },
    ];

    const vitamineItems = [
      {
        label: "Vitamine D · 3 gouttes",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vitamine");
          setVitamineName("Vitamine D");
          setVitamineCustomName("");
          setGouttesCount(3);
          setVitamineDosage("");
        },
      },
      {
        label: "Vitamine K · 2 gouttes",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vitamine");
          setVitamineName("Vitamine K");
          setVitamineCustomName("");
          setGouttesCount(2);
          setVitamineDosage("");
        },
      },
      {
        label: "Autre vitamine",
        onPress: () => {
          setIncludeTemperature(false);
          setIncludeSymptome(false);
          setSelectedType("vitamine");
          setVitamineName("Autre vitamine");
          setVitamineCustomName("");
        },
      },
    ];

    if (keepCombined) {
      return [
        { title: "Température", items: temperatureItems },
        { title: "Symptômes", items: symptomeItems },
      ];
    }

    if (selectedType === "temperature" && includeTemperature) {
      return [{ items: temperatureItems }];
    }
    if (selectedType === "symptome" && includeSymptome) {
      return [{ items: symptomeItems }];
    }
    if (selectedType === "medicament") {
      return [{ items: medicamentItems }];
    }
    if (selectedType === "vaccin") {
      return [{ items: vaccinItems }];
    }
    if (selectedType === "vitamine") {
      return [{ items: vitamineItems }];
    }
    return [];
  }, [includeTemperature, includeSymptome, selectedType]);

  // ============================================
  // SUBMIT / DELETE
  // ============================================
  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const common = {
        date: dateHeure,
        note: note.trim() ? note.trim() : undefined,
      };

      if (selectedType === "temperature" || selectedType === "symptome") {
        if (isEditing) {
          if (selectedType === "temperature") {
            const valeur = Number(temperatureValue);
            if (Number.isNaN(valeur) || valeur < 34 || valeur > 45) {
              showAlert("Erreur", "Indiquez une température valide.");
              setIsSubmitting(false);
              return;
            }
            if (!temperatureMode) {
              showAlert("Erreur", "Sélectionnez un mode de prise.");
              setIsSubmitting(false);
              return;
            }
            await modifierTemperature(activeChild.id, editData!.id, removeUndefined({
              ...common,
              valeur,
              modePrise: temperatureMode,
            }));
            showSuccess("temperature", "Température modifiée");
          } else {
            const list = [...symptomes];
            if (symptomeAutre.trim()) list.push(symptomeAutre.trim());
            if (list.length === 0) {
              showAlert("Erreur", "Sélectionnez au moins un symptôme.");
              setIsSubmitting(false);
              return;
            }
            await modifierSymptome(activeChild.id, editData!.id, removeUndefined({
              ...common,
              symptomes: list,
              intensite: symptomeIntensite,
            }));
            showSuccess("symptome", "Symptôme modifié");
          }
        } else {
          if (!includeTemperature && !includeSymptome) {
            showAlert("Erreur", "Sélectionnez au moins Température ou Symptôme.");
            setIsSubmitting(false);
            return;
          }
          if (includeTemperature) {
            const valeur = Number(temperatureValue);
            if (Number.isNaN(valeur) || valeur < 34 || valeur > 45) {
              showAlert("Erreur", "Indiquez une température valide.");
              setIsSubmitting(false);
              return;
            }
            if (!temperatureMode) {
              showAlert("Erreur", "Sélectionnez un mode de prise.");
              setIsSubmitting(false);
              return;
            }
            await ajouterTemperature(activeChild.id, removeUndefined({
              ...common,
              valeur,
              modePrise: temperatureMode,
            }));
            showSuccess("temperature", "Température enregistrée");
          }
          if (includeSymptome) {
            const list = [...symptomes];
            if (symptomeAutre.trim()) list.push(symptomeAutre.trim());
            if (list.length === 0) {
              showAlert("Erreur", "Sélectionnez au moins un symptôme.");
              setIsSubmitting(false);
              return;
            }
            await ajouterSymptome(activeChild.id, removeUndefined({
              ...common,
              symptomes: list,
              intensite: symptomeIntensite,
            }));
            showSuccess("symptome", "Symptôme enregistré");
          }
        }
      } else if (selectedType === "medicament") {
        if (!medicamentName.trim()) {
          showAlert("Erreur", "Indiquez un médicament.");
          setIsSubmitting(false);
          return;
        }
        if (isEditing) {
          await modifierMedicament(activeChild.id, editData!.id, removeUndefined({
            ...common,
            nomMedicament: medicamentName.trim(),
            dosage: medicamentDosage.trim() || undefined,
            voie: medicamentVoie,
          }));
          showSuccess("medicament", "Médicament modifié");
        } else {
          await ajouterMedicament(activeChild.id, removeUndefined({
            ...common,
            nomMedicament: medicamentName.trim(),
            dosage: medicamentDosage.trim() || undefined,
            voie: medicamentVoie,
          }));
          showSuccess("medicament", "Médicament enregistré");
        }
      } else if (selectedType === "vaccin") {
        const normalizedVaccinName =
          vaccinName === "Autre vaccin" ? vaccinCustomName : vaccinName;
        if (!normalizedVaccinName.trim()) {
          showAlert("Erreur", "Indiquez un vaccin.");
          setIsSubmitting(false);
          return;
        }
        const finalDosage = vaccinDosage.trim() || undefined;
        if (isEditing) {
          await modifierVaccin(activeChild.id, editData!.id, removeUndefined({
            ...common,
            nomVaccin: normalizedVaccinName.trim(),
            dosage: finalDosage,
          }));
          showSuccess("vaccine", "Vaccin modifié");
        } else {
          await ajouterVaccin(activeChild.id, removeUndefined({
            ...common,
            nomVaccin: normalizedVaccinName.trim(),
            dosage: finalDosage,
          }));
          showSuccess("vaccine", "Vaccin enregistré");
        }
      } else if (selectedType === "vitamine") {
        const normalizedVitamineName =
          vitamineName === "Autre vitamine" ? vitamineCustomName : vitamineName;
        if (!normalizedVitamineName.trim()) {
          showAlert("Erreur", "Indiquez une vitamine.");
          setIsSubmitting(false);
          return;
        }
        const computedDosage =
          vitamineName === "Vitamine D" || vitamineName === "Vitamine K"
            ? `${gouttesCount} gouttes`
            : vitamineDosage.trim() || undefined;
        if (isEditing) {
          await modifierVitamine(activeChild.id, editData!.id, removeUndefined({
            ...common,
            nomVitamine: normalizedVitamineName.trim(),
            dosage: computedDosage,
          }));
          showSuccess("vitamin", "Vitamine modifiée");
        } else {
          await ajouterVitamine(activeChild.id, removeUndefined({
            ...common,
            nomVitamine: normalizedVitamineName.trim(),
            dosage: computedDosage,
          }));
          showSuccess("vitamin", "Vitamine enregistrée");
        }
      }

      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cet élément ?",
      async () => {
        try {
          setIsSubmitting(true);
          if (editData.type === "temperature") {
            await supprimerTemperature(activeChild.id, editData.id);
            showToast("Température supprimée");
          } else if (editData.type === "medicament") {
            await supprimerMedicament(activeChild.id, editData.id);
            showToast("Médicament supprimé");
          } else if (editData.type === "symptome") {
            await supprimerSymptome(activeChild.id, editData.id);
            showToast("Symptôme supprimé");
          } else if (editData.type === "vaccin") {
            await supprimerVaccin(activeChild.id, editData.id);
            showToast("Vaccin supprimé");
          } else if (editData.type === "vitamine") {
            await supprimerVitamine(activeChild.id, editData.id);
            showToast("Vitamine supprimée");
          }
          onDelete?.();
        } catch (error) {
          console.error("Erreur suppression:", error);
          showAlert("Erreur", "Impossible de supprimer.");
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  const getVaccinDisplay = (nomVaccin: string, dosage?: string | null) =>
    dosage ? `${nomVaccin} - ${dosage}` : nomVaccin;

  // ============================================
  // RENDER - VACCIN PICKER
  // ============================================
  if (formStep === "vaccinPicker") {
    return (
      <View style={styles.container}>
        <View style={styles.breadcrumb}>
          <Pressable
            style={styles.backButton}
            onPress={() => setFormStep("form")}
            accessibilityLabel="Retour"
          >
            <FontAwesome5 name="chevron-left" size={14} color={nc.textLight} />
            <Text style={[styles.backText, { color: nc.textLight }]}>Retour</Text>
          </Pressable>
          <Text style={[styles.breadcrumbText, { color: nc.textMuted }]}>Soins / Vaccins / Choisir</Text>
        </View>
        <View style={[styles.searchContainer, { backgroundColor: nc.background, borderColor: nc.border }]}>
          <FontAwesome5
            name="search"
            size={16}
            color={nc.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: nc.textStrong }]}
            placeholder="Rechercher un vaccin..."
            placeholderTextColor={nc.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={true}
          />
          {searchQuery && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
              accessibilityLabel="Effacer la recherche"
            >
              <FontAwesome5 name="times-circle" size={16} color={nc.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView style={styles.pickerList}>
          {filteredVaccins.length > 0 ? (
            filteredVaccins.map((vaccin, index) => {
              const isSelected =
                vaccinName === vaccin.nomVaccin &&
                (vaccinDosage || "") === (vaccin.dosage ?? "");
              return (
                <TouchableOpacity
                  key={`${vaccin.nomVaccin}-${index}`}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: nc.backgroundPressed },
                    isSelected && {
                      backgroundColor: Colors[colorScheme].tint + "20",
                    },
                  ]}
                  onPress={() => {
                    setVaccinName(vaccin.nomVaccin);
                    setVaccinDosage(vaccin.dosage ?? "");
                    if (vaccin.nomVaccin !== "Autre vaccin") {
                      setVaccinCustomName("");
                    }
                    setFormStep("form");
                    setSearchQuery("");
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={getVaccinDisplay(vaccin.nomVaccin, vaccin.dosage)}
                >
                  <FontAwesome5
                    name="syringe"
                    size={16}
                    color={isSelected ? Colors[colorScheme].tint : nc.textLight}
                    style={styles.pickerItemIcon}
                  />
                  <View style={styles.pickerItemTextWrap}>
                    <Text
                      style={[
                        styles.pickerItemText,
                        { color: nc.textStrong },
                        isSelected && { fontWeight: "600" },
                      ]}
                    >
                      {vaccin.nomVaccin}
                    </Text>
                    {!!vaccin.dosage && (
                      <Text style={[styles.pickerItemSubtext, { color: nc.textLight }]}>
                        Dose : {vaccin.dosage}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <FontAwesome5
                      name="check"
                      size={16}
                      color={Colors[colorScheme].tint}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={[styles.noResultsText, { color: nc.textLight }]}>Aucun vaccin trouvé</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============================================
  // RENDER - VITAMINE PICKER
  // ============================================
  if (formStep === "vitaminePicker") {
    return (
      <View style={styles.container}>
        <View style={styles.breadcrumb}>
          <Pressable
            style={styles.backButton}
            onPress={() => setFormStep("form")}
            accessibilityLabel="Retour"
          >
            <FontAwesome5 name="chevron-left" size={14} color={nc.textLight} />
            <Text style={[styles.backText, { color: nc.textLight }]}>Retour</Text>
          </Pressable>
          <Text style={[styles.breadcrumbText, { color: nc.textMuted }]}>Soins / Vitamines / Choisir</Text>
        </View>
        <View style={[styles.searchContainer, { backgroundColor: nc.background, borderColor: nc.border }]}>
          <FontAwesome5
            name="search"
            size={16}
            color={nc.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: nc.textStrong }]}
            placeholder="Rechercher une vitamine..."
            placeholderTextColor={nc.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={true}
          />
          {searchQuery && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
              accessibilityLabel="Effacer la recherche"
            >
              <FontAwesome5 name="times-circle" size={16} color={nc.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView style={styles.pickerList}>
          {filteredVitamines.length > 0 ? (
            filteredVitamines.map((vitamine) => (
              <TouchableOpacity
                key={vitamine}
                style={[
                  styles.pickerItem,
                  { borderBottomColor: nc.backgroundPressed },
                  vitamineName === vitamine && {
                    backgroundColor: Colors[colorScheme].tint + "20",
                  },
                ]}
                onPress={() => {
                  setVitamineName(vitamine);
                  if (vitamine !== "Autre vitamine") {
                    setVitamineCustomName("");
                  }
                  setFormStep("form");
                  setSearchQuery("");
                }}
                activeOpacity={0.7}
                accessibilityLabel={vitamine}
              >
                <FontAwesome5
                  name="pills"
                  size={16}
                  color={
                    vitamineName === vitamine
                      ? Colors[colorScheme].tint
                      : nc.textLight
                  }
                  style={styles.pickerItemIcon}
                />
                <Text
                  style={[
                    styles.pickerItemText,
                    { color: nc.textStrong },
                    vitamineName === vitamine && { fontWeight: "600" },
                  ]}
                >
                  {vitamine}
                </Text>
                {vitamineName === vitamine && (
                  <FontAwesome5
                    name="check"
                    size={16}
                    color={Colors[colorScheme].tint}
                  />
                )}
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.noResultsText, { color: nc.textLight }]}>Aucune vitamine trouvée</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============================================
  // RENDER - MAIN FORM
  // ============================================
  const templates = getTemplates();

  return (
    <View style={styles.container}>
      {/* Type selector */}
      <View style={styles.typeRow}>
        {(["temperature", "symptome", "medicament", "vaccin", "vitamine"] as SoinsType[]).map((type) => {
          const isTempSymptome = type === "temperature" || type === "symptome";
          const active = isEditing
            ? selectedType === type
            : isTempSymptome
              ? type === "temperature"
                ? includeTemperature
                : includeSymptome
              : selectedType === type;
          const isDisabled = isEditing && !active;
          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeChip,
                { borderColor: nc.border, backgroundColor: nc.background },
                active && styles.typeChipActive,
                isDisabled && styles.typeChipDisabled,
              ]}
              disabled={isDisabled}
              activeOpacity={1}
              accessibilityLabel={`Type ${TYPE_CONFIG[type].label}`}
              hitSlop={8}
              onPress={() => {
                if (isEditing) return;
                if (type === "temperature") {
                  const nextIncludeTemperature =
                    includeTemperature && !includeSymptome
                      ? true
                      : !includeTemperature;
                  setIncludeTemperature(nextIncludeTemperature);
                  if (!nextIncludeTemperature && includeSymptome) {
                    setSelectedType("symptome");
                  } else {
                    setSelectedType("temperature");
                  }
                  return;
                }
                if (type === "symptome") {
                  const nextIncludeSymptome =
                    includeSymptome && !includeTemperature
                      ? true
                      : !includeSymptome;
                  setIncludeSymptome(nextIncludeSymptome);
                  if (!nextIncludeSymptome && includeTemperature) {
                    setSelectedType("temperature");
                  } else {
                    setSelectedType("symptome");
                  }
                  return;
                }
                setIncludeTemperature(false);
                setIncludeSymptome(false);
                setSelectedType(type);
                if (type === "vitamine" && !vitamineName) {
                  setVitamineName("Vitamine D");
                }
              }}
            >
              <Text
                style={[
                  styles.typeChipText,
                  { color: nc.textLight },
                  active && styles.typeChipTextActive,
                ]}
              >
                {TYPE_CONFIG[type].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hint for combined temp/symptome */}
      {!isEditing &&
        (includeTemperature || includeSymptome) &&
        includeTemperature !== includeSymptome && (
          <Text style={[styles.toggleHint, { color: Colors[colorScheme].tint }]}>
            Vous pouvez sélectionner Température et Symptôme ensemble
          </Text>
        )}

      {/* Templates */}
      {templates.length > 0 && (
        <View style={styles.templatesSection}>
          <Text style={[styles.templatesTitle, { color: nc.textNormal }]}>Templates rapides</Text>
          {templates.map((section, index) => (
            <View key={`${section.title ?? "default"}-${index}`} style={styles.templatesGroup}>
              {section.title && (
                <Text style={[styles.templatesSubtitle, { color: nc.textLight }]}>{section.title}</Text>
              )}
              <View style={styles.templatesRow}>
                {section.items.map((template) => (
                  <TouchableOpacity
                    key={template.label}
                    style={[styles.templateChip, { backgroundColor: nc.backgroundPressed }]}
                    onPress={template.onPress}
                    activeOpacity={0.8}
                    accessibilityLabel={`Template ${template.label}`}
                    hitSlop={8}
                  >
                    <Text style={[styles.templateChipText, { color: nc.textNormal }]}>{template.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Temperature form */}
      {includeTemperature && (
        <>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: nc.textLight }]}>Température (°C)</Text>
            <View style={styles.quantityPickerRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  { backgroundColor: nc.backgroundPressed },
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() =>
                    setTemperatureValue((value) =>
                      Math.max(34, Math.round((value - 0.1) * 10) / 10)
                    )
                  )
                }
                onPressOut={handlePressOut}
                disabled={isSubmitting || temperatureValue <= 34}
                accessibilityLabel="Diminuer la température"
              >
                <Text
                  style={[
                    styles.quantityButtonText,
                    { color: nc.textStrong },
                    isSubmitting && styles.quantityButtonTextDisabled,
                  ]}
                >
                  -
                </Text>
              </TouchableOpacity>
              <Text style={[styles.quantityPickerValue, { color: nc.textStrong }]}>
                {temperatureValue.toFixed(1)}°C
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  { backgroundColor: nc.backgroundPressed },
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() =>
                    setTemperatureValue((value) =>
                      Math.min(45, Math.round((value + 0.1) * 10) / 10)
                    )
                  )
                }
                onPressOut={handlePressOut}
                disabled={isSubmitting || temperatureValue >= 45}
                accessibilityLabel="Augmenter la température"
              >
                <Text
                  style={[
                    styles.quantityButtonText,
                    { color: nc.textStrong },
                    isSubmitting && styles.quantityButtonTextDisabled,
                  ]}
                >
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.chipSection}>
            <Text style={[styles.chipLabel, { color: nc.textLight }]}>Mode de prise</Text>
            <View style={styles.chipRow}>
              {MODE_TEMPERATURE.map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.chip,
                    { borderColor: nc.border, backgroundColor: nc.background },
                    temperatureMode === mode && styles.chipActive,
                  ]}
                  onPress={() => setTemperatureMode(mode)}
                  accessibilityLabel={`Mode ${mode}`}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: nc.textLight },
                      temperatureMode === mode && styles.chipTextActive,
                    ]}
                  >
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Medicament form */}
      {selectedType === "medicament" && (
        <>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: nc.textLight }]}>Médicament</Text>
            <TextInput
              value={medicamentName}
              onChangeText={setMedicamentName}
              placeholder="Paracétamol"
              placeholderTextColor={nc.textMuted}
              style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: nc.textLight }]}>Dosage</Text>
            <TextInput
              value={medicamentDosage}
              onChangeText={setMedicamentDosage}
              placeholder="5 ml"
              placeholderTextColor={nc.textMuted}
              style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
            />
          </View>
          <View style={styles.chipSection}>
            <Text style={[styles.chipLabel, { color: nc.textLight }]}>Voie</Text>
            <View style={styles.chipRow}>
              {VOIES_MEDICAMENT.map((voie) => (
                <TouchableOpacity
                  key={voie}
                  style={[
                    styles.chip,
                    { borderColor: nc.border, backgroundColor: nc.background },
                    medicamentVoie === voie && styles.chipActive,
                  ]}
                  onPress={() =>
                    setMedicamentVoie(medicamentVoie === voie ? undefined : voie)
                  }
                  accessibilityLabel={`Voie ${voie}`}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: nc.textLight },
                      medicamentVoie === voie && styles.chipTextActive,
                    ]}
                  >
                    {voie}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Symptome form */}
      {includeSymptome && (
        <>
          <View style={[styles.chipSection, { marginTop: 6 }]}>
            <Text style={[styles.chipLabel, { color: nc.textLight }]}>Symptômes</Text>
            <View style={styles.chipRow}>
              {SYMPTOMES_OPTIONS.map((symptome) => {
                const active = symptomes.includes(symptome);
                return (
                  <TouchableOpacity
                    key={symptome}
                    style={[styles.chip, { borderColor: nc.border, backgroundColor: nc.background }, active && styles.chipActive]}
                    accessibilityLabel={`Symptôme ${symptome}`}
                    hitSlop={8}
                    onPress={() => {
                      setSymptomes((prev) => {
                        const next = prev.includes(symptome)
                          ? prev.filter((item) => item !== symptome)
                          : [...prev, symptome];
                        if (next.length === 0) {
                          setSymptomeIntensite(undefined);
                        }
                        return next;
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: nc.textLight },
                        active && styles.chipTextActive,
                      ]}
                    >
                      {symptome}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {symptomes.includes("autre") && (
            <View style={[styles.inputGroup, { marginTop: 6 }]}>
              <Text style={[styles.inputLabel, { color: nc.textLight }]}>Autre(s) symptôme(s)</Text>
              <TextInput
                value={symptomeAutre}
                onChangeText={setSymptomeAutre}
                placeholder="Préciser"
                placeholderTextColor={nc.textMuted}
                style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
              />
            </View>
          )}
          <View style={[styles.chipSection, { marginTop: 6 }]}>
            <Text style={[styles.chipLabel, { color: nc.textLight }]}>Intensité</Text>
            <View style={styles.chipRow}>
              {INTENSITES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    { borderColor: nc.border, backgroundColor: nc.background },
                    symptomeIntensite === item && styles.chipActive,
                  ]}
                  onPress={() =>
                    setSymptomeIntensite(
                      symptomes.length === 0
                        ? undefined
                        : symptomeIntensite === item
                          ? undefined
                          : item
                    )
                  }
                  disabled={symptomes.length === 0}
                  activeOpacity={symptomes.length === 0 ? 1 : 0.7}
                  accessibilityLabel={`Intensité ${item}`}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: nc.textLight },
                      symptomeIntensite === item && styles.chipTextActive,
                      symptomes.length === 0 && styles.chipTextDisabled,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Vaccin form */}
      {selectedType === "vaccin" && (
        <>
          <TouchableOpacity
            style={[
              styles.selectorButton,
              { backgroundColor: nc.background, borderColor: nc.border },
              isSubmitting && styles.selectorButtonDisabled,
            ]}
            onPress={() => {
              if (isSubmitting) return;
              setSearchQuery("");
              setFormStep("vaccinPicker");
            }}
            activeOpacity={0.7}
            accessibilityLabel="Sélectionner un vaccin"
          >
            <FontAwesome5
              name="syringe"
              size={16}
              color={nc.textLight}
              style={styles.selectorIcon}
            />
            <Text
              style={[
                styles.selectorText,
                { color: nc.textMuted },
                vaccinName && { color: nc.textStrong, fontWeight: "500" as const },
                isSubmitting && styles.selectorTextDisabled,
              ]}
            >
              {vaccinName ? vaccinName : "Sélectionner un vaccin"}
            </Text>
            <FontAwesome5 name="chevron-right" size={14} color={nc.textMuted} />
          </TouchableOpacity>
          {vaccinName === "Autre vaccin" && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: nc.textLight }]}>Nom du vaccin</Text>
              <TextInput
                value={vaccinCustomName}
                onChangeText={setVaccinCustomName}
                placeholder="Nom du vaccin"
                placeholderTextColor={nc.textMuted}
                style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
              />
            </View>
          )}
          {vaccinName ? (
            vaccinName === "Autre vaccin" ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: nc.textLight }]}>Dose</Text>
                <TextInput
                  value={vaccinDosage}
                  onChangeText={setVaccinDosage}
                  placeholder="1ère injection"
                  placeholderTextColor={nc.textMuted}
                  style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
                />
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: nc.textLight }]}>Dose</Text>
                <Text style={[styles.readOnlyValue, { borderColor: nc.border, color: nc.textNormal, backgroundColor: nc.background }]}>{vaccinDosage || "—"}</Text>
              </View>
            )
          ) : null}
        </>
      )}

      {/* Vitamine form */}
      {selectedType === "vitamine" && (
        <>
          <TouchableOpacity
            style={[
              styles.selectorButton,
              { backgroundColor: nc.background, borderColor: nc.border },
              isSubmitting && styles.selectorButtonDisabled,
            ]}
            onPress={() => {
              if (isSubmitting) return;
              setSearchQuery("");
              setFormStep("vitaminePicker");
            }}
            activeOpacity={0.7}
            accessibilityLabel="Sélectionner une vitamine"
          >
            <FontAwesome5
              name="pills"
              size={16}
              color={nc.textLight}
              style={styles.selectorIcon}
            />
            <Text
              style={[
                styles.selectorText,
                { color: nc.textMuted },
                vitamineName && { color: nc.textStrong, fontWeight: "500" as const },
                isSubmitting && styles.selectorTextDisabled,
              ]}
            >
              {vitamineName ? vitamineName : "Sélectionner une vitamine"}
            </Text>
            <FontAwesome5 name="chevron-right" size={14} color={nc.textMuted} />
          </TouchableOpacity>
          {vitamineName === "Autre vitamine" && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: nc.textLight }]}>Nom de la vitamine</Text>
              <TextInput
                value={vitamineCustomName}
                onChangeText={setVitamineCustomName}
                placeholder="Nom de la vitamine"
                placeholderTextColor={nc.textMuted}
                style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
              />
            </View>
          )}
          {(vitamineName === "Vitamine D" || vitamineName === "Vitamine K") && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: nc.textLight }]}>Quantité</Text>
              <View style={styles.quantityPickerRow}>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    { backgroundColor: nc.backgroundPressed },
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() =>
                      setGouttesCount((value) => Math.max(0, value - 1))
                    )
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting}
                  accessibilityLabel="Diminuer les gouttes"
                >
                  <Text
                    style={[
                      styles.quantityButtonText,
                      { color: nc.textStrong },
                      isSubmitting && styles.quantityButtonTextDisabled,
                    ]}
                  >
                    -
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.quantityPickerValue, { color: nc.textStrong }]}>
                  {gouttesCount} gouttes
                </Text>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    { backgroundColor: nc.backgroundPressed },
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() => setGouttesCount((value) => value + 1))
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting}
                  accessibilityLabel="Augmenter les gouttes"
                >
                  <Text
                    style={[
                      styles.quantityButtonText,
                      { color: nc.textStrong },
                      isSubmitting && styles.quantityButtonTextDisabled,
                    ]}
                  >
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {vitamineName !== "Vitamine D" && vitamineName !== "Vitamine K" && vitamineName && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: nc.textLight }]}>Dosage</Text>
              <TextInput
                value={vitamineDosage}
                onChangeText={setVitamineDosage}
                placeholder="1 goutte"
                placeholderTextColor={nc.textMuted}
                style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
              />
            </View>
          )}
        </>
      )}

      {/* Note */}
      <View style={[styles.inputGroup, { marginTop: 12 }]}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ajouter une note"
          placeholderTextColor={nc.textMuted}
          style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
        />
      </View>

      {/* Date/Time */}
      <DateTimeSectionRow
        value={dateHeure}
        onChange={setDateHeure}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        <View style={styles.primaryRow}>
          <TouchableOpacity
            style={[
              styles.cancelButton,
              { backgroundColor: nc.background, borderColor: nc.border },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={onCancel}
            disabled={isSubmitting}
            accessibilityLabel="Annuler"
          >
            <Text style={[styles.cancelText, { color: nc.textNormal }]}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.validateButton,
              { backgroundColor: Colors[colorScheme].tint },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel={isEditing ? "Enregistrer" : "Ajouter"}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colorScheme === "dark" ? Colors[colorScheme].background : nc.white} />
            ) : (
              <Text style={[styles.validateText, { color: colorScheme === "dark" ? Colors[colorScheme].background : nc.white }]}>
                {isEditing ? "Enregistrer" : "Ajouter"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isEditing && onDelete && (
          <TouchableOpacity
            style={[
              styles.deleteButton,
              { borderColor: "#f1b1b1", backgroundColor: nc.errorBg },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleDelete}
            disabled={isSubmitting}
            accessibilityLabel="Supprimer"
          >
            <FontAwesome5 name="trash" size={14} color="#dc3545" />
            <Text style={styles.deleteText}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  // Breadcrumb / Navigation
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
  breadcrumbText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginVertical: 12,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  clearButton: {
    padding: 8,
  },
  // Picker list
  pickerList: {
    paddingBottom: 8,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderRadius: 12,
  },
  pickerItemIcon: {
    width: 18,
    textAlign: "center",
  },
  pickerItemSelected: {
    backgroundColor: "transparent",
  },
  pickerItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  pickerItemText: {
    fontSize: 16,
  },
  pickerItemTextSelected: {
    fontWeight: "600",
  },
  pickerItemSubtext: {
    fontSize: 12,
  },
  noResultsText: {
    fontSize: 16,
    textAlign: "center",
    padding: 20,
  },
  // Type selector
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipActive: {
    backgroundColor: "#ede7f6",
    borderColor: "#6f42c1",
  },
  typeChipDisabled: {
    opacity: 0.4,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typeChipTextActive: {
    color: "#4c2c79",
    fontWeight: "700",
  },
  toggleHint: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  // Templates
  templatesSection: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  templatesTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  templatesGroup: {
    marginBottom: 8,
  },
  templatesSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  templatesRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  templateChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  templateChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Input groups
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readOnlyValue: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Chips
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: "#6f42c1",
    backgroundColor: "#ede7f6",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#4c2c79",
  },
  chipTextDisabled: {
    opacity: 0.5,
  },
  // Quantity picker
  quantityPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.6,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: "700",
  },
  quantityButtonTextDisabled: {
    opacity: 0.5,
  },
  quantityPickerValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Selector button (for vaccin/vitamine)
  selectorButton: {
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  selectorButtonDisabled: {
    opacity: 0.5,
  },
  selectorIcon: {
    // gap is handled by parent
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
  },
  selectorTextDisabled: {
    opacity: 0.5,
  },
  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
  },
  dateTimeContainerWithPadding: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
    paddingTop: 20,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    fontWeight: "600",
  },
  // Action buttons
  buttonsContainer: {
    gap: 12,
    marginTop: 16,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  validateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  validateText: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    color: "#dc3545",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
