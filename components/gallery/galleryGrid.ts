// Dimensions de la grille de la galerie, partagées par les vignettes et le
// squelette de chargement pour qu'ils aient exactement la même disposition.
import { Dimensions } from "react-native";

export const GRID_GAP = 2;
export const NUM_COLUMNS = 3;

export function getThumbSize(screenWidth: number = Dimensions.get("window").width) {
  return (screenWidth - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
}

export const THUMB_SIZE = getThumbSize();

export type GalleryViewState = "loading" | "error" | "empty" | "grid";

/**
 * Ce que la galerie affiche : le message « aucun souvenir » n'apparaît qu'une
 * fois la première page chargée et sans photo. Tant qu'il reste des pages à lire
 * pour trouver les premières photos (page de jalons sans photo), on garde le
 * squelette plutôt que de montrer un vide trompeur.
 */
export function getGalleryViewState({
  loaded,
  loadError,
  eventCount,
  photoCount,
  hasMore,
  loadMoreFailed = false,
}: {
  loaded: boolean;
  loadError: boolean;
  eventCount: number;
  photoCount: number;
  hasMore: boolean;
  loadMoreFailed?: boolean;
}): GalleryViewState {
  if (!loaded) return "loading";
  if (loadError && eventCount === 0) return "error";
  if (photoCount > 0) return "grid";
  if (hasMore && !loadMoreFailed) return "loading";
  return "empty";
}
