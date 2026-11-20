// Style unique des fenêtres de l'app (information, confirmation, choix) et de
// leurs boutons, calqués sur le pied des formulaires : même hauteur (52), mêmes
// arrondis (14), « Annuler » en contour, action principale pleine. Une fenêtre
// ouverte depuis un formulaire a ainsi les mêmes boutons que lui.
import React, { useCallback, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  type TextLayoutEvent,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { radius, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "./pressFeedback";

/** Rouge destructif unique de l'app (token `destructive`, comme DESTRUCTIVE_COLOR). */
const DESTRUCTIVE = neutralColors.destructive;

export type DialogButtonVariant = "primary" | "secondary" | "destructive";

/** Hauteur et arrondis des boutons de pied de formulaire, repris tels quels. */
export const DIALOG_BUTTON_MIN_HEIGHT = 52;
export const DIALOG_BUTTON_RADIUS = 14;

export function DialogButton({
  text,
  variant,
  onPress,
  layout,
  color,
  textColor,
  disabled = false,
  testID,
  onTextLayout,
}: {
  text: string;
  variant: DialogButtonVariant;
  onPress: () => void;
  /** "row" : partage la ligne ; "stack" : pleine largeur. */
  layout: "row" | "stack";
  /** Couleur imposée par l'appelant (ex. bouton d'une fenêtre existante). */
  color?: string;
  textColor?: string;
  disabled?: boolean;
  testID?: string;
  /** Lignes réellement rendues (la fenêtre empile les boutons si un libellé passe à la ligne). */
  onTextLayout?: (event: TextLayoutEvent) => void;
}) {
  const scheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(scheme);
  const theme = Colors[scheme];
  const ripple = usePressRipple();

  const filled = variant !== "secondary";
  const bg =
    color ?? (variant === "destructive" ? DESTRUCTIVE : variant === "primary" ? theme.tint : nc.background);
  const ink =
    textColor ?? (variant === "destructive" ? "#fff" : variant === "primary" ? theme.onTint : nc.textNormal);
  const box: ViewStyle = filled
    ? { backgroundColor: bg }
    : { backgroundColor: bg, borderWidth: 1, borderColor: nc.border };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        layout === "row" ? styles.row : styles.stack,
        box,
        disabled && styles.disabled,
        pressedOpacity(pressed),
      ]}
      android_ripple={ripple}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={text}
      accessibilityHint={variant === "destructive" ? "Action définitive" : undefined}
      testID={testID}
    >
      {/* Plafond ×2 : en très grande police, les boutons restent à l'écran. */}
      <Text
        style={[filled ? styles.strong : styles.normal, { color: ink }]}
        maxFontSizeMultiplier={2}
        onTextLayout={onTextLayout}
      >
        {text}
      </Text>
    </Pressable>
  );
}

/**
 * Largeur approchée d'un texte gras (pt), lettre par lettre : les lettres
 * étroites (i, l, r, t…) et larges (m, w, majuscules) pèsent très différemment
 * (« Déconnexion » est plus large que sa longueur ne le laisse croire).
 */
export function estimateBoldTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    if ("il.,:;'’!|".includes(ch)) units += 0.28;
    else if ("rtfj ".includes(ch)) units += 0.38;
    else if ("mwMW".includes(ch)) units += 0.88;
    else if (ch >= "A" && ch <= "Z") units += 0.7;
    else units += 0.58;
  }
  return units * fontSize;
}

const TITLE_FONT_SIZE = 20;
/** Largeur du texte dans la boîte (marges de l'écran 20, boîte ≤ 400, intérieur 24). */
export function dialogTextWidth(windowWidth: number): number {
  return Math.min(windowWidth - 2 * space.lg, 400) - 2 * space.xl;
}

/**
 * Agrandissement maximal du titre : son mot le plus long doit tenir sur une
 * ligne, sinon le système le coupe au milieu (« Déconne/xion », recette
 * 1.0.23, test 28). Jamais moins que la taille normale, ×3 au plus.
 */
export function titleMaxFontSizeMultiplier(title: string, windowWidth: number): number {
  const longestWord = title
    .split(/\s+/)
    .reduce((widest, word) => Math.max(widest, estimateBoldTextWidth(word, TITLE_FONT_SIZE)), 0);
  if (longestWord === 0) return 3;
  // 10 % de marge : l'estimation n'est qu'approchée.
  const fit = (dialogTextWidth(windowWidth) * 0.9) / longestWord;
  return Math.max(1, Math.min(3, Math.floor(fit * 10) / 10));
}

/** Titre des fenêtres : grandit avec la police sans couper un mot. */
export function DialogTitle({ title, color }: { title: string; color: string }) {
  const { width } = useWindowDimensions();
  return (
    <Text
      style={[dialogStyles.title, { color }]}
      accessibilityRole="header"
      maxFontSizeMultiplier={titleMaxFontSizeMultiplier(title, width)}
    >
      {title}
    </Text>
  );
}

/**
 * Zone qui défile (titre et texte) quand la fenêtre atteint sa hauteur
 * maximale. La barre de défilement reste visible (Android) ou clignote à
 * l'ouverture (iPhone) : sans elle, rien n'indiquait qu'il restait du texte
 * sous les boutons (recette 1.0.23, test 28).
 */
export function DialogScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<ScrollViewInstance>(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const flashed = useRef(false);
  // Les deux mesures arrivent dans un ordre variable : on vérifie à chacune.
  const maybeFlash = useCallback(() => {
    if (flashed.current || Platform.OS !== "ios") return;
    if (viewportHeight.current > 0 && contentHeight.current > viewportHeight.current + 1) {
      flashed.current = true;
      ref.current?.flashScrollIndicators();
    }
  }, []);
  const onContentSizeChange = useCallback(
    (_w: number, height: number) => {
      contentHeight.current = height;
      maybeFlash();
    },
    [maybeFlash],
  );
  return (
    <ScrollView
      ref={ref}
      style={styles.scroll}
      bounces={false}
      keyboardShouldPersistTaps="handled"
      persistentScrollbar
      onLayout={(e) => {
        viewportHeight.current = e.nativeEvent.layout.height;
        maybeFlash();
      }}
      onContentSizeChange={onContentSizeChange}
    >
      {children}
    </ScrollView>
  );
}

/** Boîte, titre et message communs aux trois fenêtres. */
export const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    // Jamais plus haute que l'écran (très grande police) : le contenu défile,
    // les boutons restent visibles (recette 1.0.22, test 22).
    maxHeight: "88%",
    borderRadius: radius.xl,
    padding: space.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: space.xs,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: space.lg,
    textAlign: "center",
  },
  messageContainer: {
    marginBottom: space.lg,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  buttonsStack: {
    flexDirection: "column",
    gap: space.sm,
  },
});

const styles = StyleSheet.create({
  // Se réduit quand la boîte atteint sa hauteur maximale (flexGrow 0 : pas
  // d'espace vide quand le texte est court).
  scroll: { flexGrow: 0, flexShrink: 1 },
  button: {
    ...RIPPLE_CLIP,
    minHeight: DIALOG_BUTTON_MIN_HEIGHT,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderRadius: DIALOG_BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flex: 1 },
  disabled: { opacity: 0.5 },
  stack: { alignSelf: "stretch" },
  strong: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  normal: { fontSize: 16, fontWeight: "600", textAlign: "center" },
});
