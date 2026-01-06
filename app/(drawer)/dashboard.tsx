import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LineChart, PieChart } from "react-native-chart-kit";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width, height } = Dimensions.get("window");
const av_size = 40;
const topCtnrHeight = height * 0.3;
const topCtnrWidth = width * 0.9;
const midCtnrHeight = height * 0.28;
const midCtnrWidth = width * 0.42;

interface VaccinItem {
  id: number;
  name: string;
  state: "ok" | "ko";
}

interface VisiteItem {
  id: number;
  name: string;
  specialite: string;
  tel: string;
  img: string;
  favoris: boolean;
  date: string;
}

interface RepartitionItem {
  name: string;
  population: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme() ?? "light";

  const dataDerniersVaccins: VaccinItem[] = [
    { id: 1, name: "Pfizer", state: "ok" },
    { id: 2, name: "Tétanos", state: "ko" },
    { id: 3, name: "Diphtérie", state: "ko" },
    { id: 4, name: "Poliomyélite", state: "ok" },
    { id: 5, name: "Rougeole", state: "ok" },
    { id: 6, name: "Hépatite B", state: "ko" },
    { id: 7, name: "Rubéole", state: "ok" },
    { id: 8, name: "Oreillons", state: "ok" },
    { id: 9, name: "Pneumocoque", state: "ok" },
  ];

  const initialDernieresVisites: VisiteItem[] = [
    {
      id: 1,
      name: "Famayo Hospital",
      specialite: "Radiologie",
      tel: "+33168012345",
      img: "../images/b.png",
      favoris: true,
      date: "**/*1/2021",
    },
    {
      id: 2,
      name: "Dr Fatou",
      specialite: "Medecine générale",
      tel: "+33168012345",
      img: "../images/Logo.jpg",
      favoris: true,
      date: "**/*1/2021",
    },
    {
      id: 3,
      name: "Cabinet Po",
      specialite: "Stomatologie",
      tel: "+33168012345",
      img: "../images/Logo.jpg",
      favoris: true,
      date: "**/*1/2021",
    },
    {
      id: 4,
      name: "Eden's Relief",
      specialite: "Physiothérapie",
      tel: "+33168012345",
      img: "../images/b.png",
      favoris: false,
      date: "**/*1/2021",
    },
    {
      id: 5,
      name: "Pharma Touba",
      specialite: "Pharmacie",
      tel: "+33168012345",
      img: "../images/Logo.jpg",
      favoris: true,
      date: "**/*1/2021",
    },
  ];

  const dataDerniersActes = {
    labels: ["Jan", "Fev", "Mars", "Avril", "Mai", "Juin"],
    datasets: [
      {
        data: [
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
        ],
      },
    ],
  };

  const dataRepartition: RepartitionItem[] = [
    {
      name: "Ordonnances",
      population: 7,
      color: "rgba(131, 167, 234, 1)",
      legendFontColor: "rgba(131, 167, 234, 1)",
      legendFontSize: 15,
    },
    {
      name: "Consultations",
      population: 20,
      color: "#448d88",
      legendFontColor: "#448d88",
      legendFontSize: 15,
    },
    {
      name: "Achats pharmacies",
      population: 35,
      color: "#08d4c4",
      legendFontColor: "#08d4c4",
      legendFontSize: 15,
    },
  ];

  const [isLoaded, setIsLoaded] = useState(false);
  const [dernieresVisites, setDernieresVisites] = useState<VisiteItem[]>([]);

  useEffect(() => {
    setDernieresVisites(initialDernieresVisites);
  }, []);

  useEffect(() => {
    if (dernieresVisites.length > 0) {
      setIsLoaded(true);
    }
  }, [dernieresVisites]);

  const LoadDerniersActes = () => {
    const gradientFrom = colorScheme === "dark" ? "#1e3a8a" : "#0a7ea4";
    const gradientTo = colorScheme === "dark" ? "#7c3aed" : "#06b6d4";

    return (
      <LineChart
        data={dataDerniersActes}
        width={topCtnrWidth * 0.935}
        height={topCtnrHeight * 0.8}
        yAxisInterval={1}
        chartConfig={{
          backgroundColor: gradientFrom,
          backgroundGradientFrom: gradientFrom,
          backgroundGradientTo: gradientTo,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.9})`,
          style: {
            borderRadius: 16,
          },
          propsForDots: {
            r: "6",
            strokeWidth: "2",
            stroke: "#ffa726",
          },
        }}
        bezier
        style={{
          borderRadius: 16,
          marginHorizontal: 10,
        }}
      />
    );
  };

  const LoadRepartition = () => {
    const chartColors =
      colorScheme === "dark"
        ? ["#60a5fa", "#34d399", "#fbbf24"] // Couleurs plus vives pour le mode sombre
        : ["rgba(131, 167, 234, 1)", "#448d88", "#08d4c4"]; // Couleurs originales pour le mode clair

    const dataRepartitionThemed = dataRepartition.map((item, index) => ({
      ...item,
      color: chartColors[index],
      legendFontColor: chartColors[index],
    }));

    return (
      <ScrollView
        style={{ flex: 1, marginBottom: 10 }}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            alignItems: "flex-start",
          }}
        >
          <PieChart
            data={dataRepartitionThemed}
            width={midCtnrWidth}
            height={topCtnrHeight * 0.4}
            chartConfig={{
              color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            }}
            accessor={"population"}
            backgroundColor={"transparent"}
            hasLegend={false}
            paddingLeft={"38"}
            absolute
          />
          {dataRepartitionThemed.map((item, index) => (
            <View
              key={index}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 10,
                paddingBottom: 5,
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: item.color,
                  marginRight: 6,
                }}
              />
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {item.population} {item.name}
              </ThemedText>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const LoadDernieresVisites = () => {
    if (isLoaded) {
      return (
        <ScrollView
          style={{ flex: 1, marginBottom: 10 }}
          nestedScrollEnabled={true}
        >
          <View style={{ paddingVertical: 10 }}>
            {dernieresVisites.map((item) => (
              <View
                key={item.id}
                style={{
                  marginHorizontal: 10,
                  paddingBottom: 10,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    flex: 1,
                  }}
                >
                  <View style={styles.avatarPlaceholder}>
                    <ThemedText style={{ fontSize: 20 }}>👤</ThemedText>
                  </View>
                  <View
                    style={{
                      justifyContent: "center",
                      paddingLeft: 10,
                      flex: 1,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontWeight: "bold",
                      }}
                    >
                      {item.name}
                    </ThemedText>
                    <ThemedText>{item.specialite}</ThemedText>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 15,
                  }}
                >
                  <Pressable
                    onPress={() =>
                      Alert.alert("Appeler", item.tel, [
                        {
                          text: "Annuler",
                          onPress: () => console.log("Cancel Pressed"),
                        },
                        {
                          text: "OK",
                          onPress: () => console.log("OK Pressed"),
                        },
                      ])
                    }
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <ThemedText style={{ fontSize: 20 }}>📞</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      console.log("OK Pressed");
                      const updatedVisites = dernieresVisites.map((v) =>
                        v.id === item.id ? { ...v, favoris: !v.favoris } : v
                      );
                      setDernieresVisites(updatedVisites);
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Ionicons
                      name={item.favoris ? "star" : "star-outline"}
                      size={26}
                      color={item.favoris ? "#FFD700" : borderColor}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      );
    } else {
      return (
        <View
          style={{
            flex: 1,
            paddingBottom: 100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ThemedText style={{ paddingBottom: 10 }}>Chargement...</ThemedText>
          <ActivityIndicator
            size="large"
            color={Colors[colorScheme].tint}
            animating={true}
          />
        </View>
      );
    }
  };

  const LoadDerniersVaccins = () => {
    return (
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true}>
        <View style={{ paddingVertical: 10 }}>
          {dataDerniersVaccins.map((item) => (
            <View
              key={item.id}
              style={{
                marginHorizontal: 10,
                paddingBottom: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {item.name}
              </ThemedText>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    item.state === "ok"
                      ? "Vaccin à jour"
                      : " Vaccin à renouveler",
                    "",
                    item.state === "ok"
                      ? [
                          {
                            text: "OK",
                            onPress: () => console.log("OK Pressed"),
                          },
                        ]
                      : [
                          {
                            text: "Trouver un RDV",
                            onPress: () => console.log("OK Pressed"),
                          },
                          {
                            text: "Annuler",
                            onPress: () => console.log("Cancel Pressed"),
                          },
                        ]
                  )
                }
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons
                  name={
                    item.state === "ok" ? "checkmark-circle" : "time-outline"
                  }
                  size={20}
                  color={item.state === "ok" ? "#22c55e" : "#f59e0b"}
                />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };


  const styles = StyleSheet.create({
    screen: {
      flex: 1,
    },
    topContainer: {
      height: topCtnrHeight,
      width: topCtnrWidth,
      marginTop: 20,
      marginLeft: 20,
      marginRight: 20,
      borderWidth: 1,
      borderColor: Colors[colorScheme].tabIconDefault,
      borderRadius: 12,
      backgroundColor: colorScheme === "dark" ? "#1f2937" : "#fff",
      shadowColor: colorScheme === "dark" ? "#000" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      shadowOpacity: colorScheme === "dark" ? 0.3 : 0.1,
      elevation: 3,
    },
    middleContainer: {
      height: midCtnrHeight,
      width: midCtnrWidth,
      marginTop: 20,
      borderWidth: 1,
      borderColor: Colors[colorScheme].tabIconDefault,
      borderRadius: 12,
      backgroundColor: colorScheme === "dark" ? "#1f2937" : "#fff",
      shadowColor: colorScheme === "dark" ? "#000" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      shadowOpacity: colorScheme === "dark" ? 0.3 : 0.1,
      elevation: 3,
    },
    topContainerText: {
      margin: 10,
      fontWeight: "bold",
      fontSize: 16,
    },
    avatarPlaceholder: {
      width: av_size,
      height: av_size,
      borderWidth: 1,
      borderRadius: av_size,
      borderColor: Colors[colorScheme].tabIconDefault,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: Colors[colorScheme].background,
    },
  });

  const borderColor = Colors[colorScheme].tabIconDefault;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <ScrollView>
          <View style={{ flex: 1, marginBottom: 20 }}>
            <ThemedView style={styles.topContainer}>
              <ThemedText style={styles.topContainerText}>
                Derniers actes générés par SIM
              </ThemedText>
              <LoadDerniersActes />
            </ThemedView>
            <View
              style={{
                flexDirection: "row",
                marginHorizontal: 20,
                justifyContent: "space-between",
              }}
            >
              <ThemedView style={styles.middleContainer}>
                <ThemedText style={styles.topContainerText}>
                  Derniers vaccins
                </ThemedText>
                <LoadDerniersVaccins />
              </ThemedView>
              <ThemedView style={styles.middleContainer}>
                <ThemedText style={styles.topContainerText}>
                  Répartition
                </ThemedText>
                <LoadRepartition />
              </ThemedView>
            </View>
            <ThemedView style={styles.topContainer}>
              <ThemedText style={styles.topContainerText}>
                Dernières visites
              </ThemedText>
              <LoadDernieresVisites />
            </ThemedView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
