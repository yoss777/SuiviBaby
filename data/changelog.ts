// data/changelog.ts
// Changelog entries for the "What's new" modal

import type { ChangelogEntry } from "@/types/content";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.4.0",
    date: "Mars 2026",
    title: "Intelligence parentale",
    features: [
      {
        icon: "lightbulb",
        text: "Conseils personnalisés selon l'âge de bébé, sourcés OMS et HAS",
      },
      {
        icon: "chart-line",
        text: "Insights intelligents : détection automatique des tendances (sommeil, alimentation, santé)",
      },
      {
        icon: "flag-checkered",
        text: "Timeline des jalons : suivez les prochaines étapes de développement de bébé",
      },
      {
        icon: "arrows-rotate",
        text: "Corrélations cross-données : découvrez les liens entre repas, bain et qualité de sommeil",
      },
      {
        icon: "bed",
        text: "Statistiques sommeil enrichies avec PagerView et navigation par swipe",
      },
    ],
  },
  {
    version: "2.3.0",
    date: "Février 2026",
    title: "Statistiques enrichies",
    features: [
      {
        icon: "chart-bar",
        text: "Graphique sommeil avec analyse des lieux et moments de sommeil",
      },
      {
        icon: "utensils",
        text: "Détail des solides par type (purée, compote, céréales, etc.)",
      },
      {
        icon: "file-pdf",
        text: "Export PDF des statistiques pour les rendez-vous pédiatriques",
      },
      {
        icon: "bell",
        text: "Notifications intelligentes et rappels personnalisables",
      },
    ],
  },
];
