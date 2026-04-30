# Migration `expo-av` → `expo-audio`

> S2-T4 — analyse 2026-04-29
> Statut : **planifié, exécution Sprint 4 ou plus tard**

## Contexte

`expo-av` est marqué deprecated depuis Expo SDK 53 et sera retiré dans SDK 54 (probablement Q3 2026). Expo a scindé l'API en deux packages successeurs :
- `expo-audio` — enregistrement et lecture audio
- `expo-video` — lecture vidéo

Notre seul usage est l'enregistrement audio (commandes vocales). Pas de lecture, pas de vidéo. Donc `expo-audio` couvre 100 % de notre besoin.

## Inventaire des APIs utilisées

Source unique : `services/voice/recorder.ts`. Aucune autre référence à `expo-av` dans le code applicatif (vérifié par `grep -rn "expo-av"`).

| API `expo-av` | Endroit | Rôle |
|---------------|---------|------|
| `Audio.requestPermissionsAsync()` | L:22 | Demander la permission micro |
| `Audio.setAudioModeAsync({ allowsRecordingIOS, playsInSilentModeIOS })` | L:43-46 | Configurer la session audio iOS |
| `Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)` | L:48-50 | Démarrer un enregistrement |
| `recording.stopAndUnloadAsync()` | L:71 | Arrêter |
| `recording.getURI()` | L:72 | Récupérer le fichier produit |

5 points d'API. Tous mappables 1-pour-1 vers `expo-audio`.

## Mapping `expo-av` → `expo-audio`

L'API `expo-audio` privilégie les hooks (`useAudioRecorder`) mais expose aussi une API impérative équivalente. Comme `recorder.ts` est appelé depuis un hook custom (`useVoiceCommand`), l'approche impérative reste plus simple et ne réécrit pas le call-site.

```ts
// AVANT — expo-av
import { Audio } from "expo-av";

const { status } = await Audio.requestPermissionsAsync();
await Audio.setAudioModeAsync({
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
});
const { recording } = await Audio.Recording.createAsync(
  Audio.RecordingOptionsPresets.HIGH_QUALITY,
);
// ...
await recording.stopAndUnloadAsync();
const uri = recording.getURI();
```

```ts
// APRÈS — expo-audio
import {
  AudioModule,
  AudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";

const status = await AudioModule.requestRecordingPermissionsAsync();
await setAudioModeAsync({
  allowsRecording: true,                 // nom unifié, plus de suffixe iOS
  playsInSilentMode: true,
});
const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
await recorder.prepareToRecordAsync();
recorder.record();
// ...
await recorder.stop();
const uri = recorder.uri;                // synchrone, plus de getter
```

Aucun changement côté call-site (les fonctions exportées `requestPermissions`, `startRecording`, `stopRecording` gardent leur signature). Le module local `recording` devient un `AudioRecorder` mais reste interne.

## Effort estimé

| Étape | Effort |
|-------|--------|
| `npm install expo-audio` + `npm uninstall expo-av` | 5 min |
| Réécrire `services/voice/recorder.ts` (≤ 120 LOC) | 1 h |
| Mettre à jour les permissions natives si `expo-audio` exige une plist différente | 30 min |
| Tests manuels iOS (Face ID device + simulateur) | 30 min |
| Tests manuels Android (mid-range device) | 30 min |
| Build EAS preview iOS + Android, validation transcription bout-en-bout | 1 h |

**Total : ~3 h** sur un dev senior, en supposant aucun bug bloquant côté `expo-audio`.

## Risques

- **`expo-audio` était en preview** au moment de cette analyse. Vérifier qu'il a basculé en stable avant de migrer (sinon décaler).
- **Background recording** : `expo-av` supportait `staysActiveInBackground` ; vérifier que `expo-audio` a un équivalent. Pour notre flow (enregistrement court, foreground only), pas critique.
- **Préset HIGH_QUALITY** : `expo-audio` peut avoir des paramètres légèrement différents (sample rate, codec). Comparer la sortie audio sur AssemblyAI pour confirmer que la qualité reste acceptable.

## Décision

À planifier en **Sprint 4** (polish), juste avant la prochaine soumission stores. Pas de pression à court terme tant que SDK 53 reste supporté. Re-évaluer si Expo annonce une date ferme pour SDK 54.

## Fichiers liés

- `services/voice/recorder.ts` — seul consommateur de `expo-av`
- `package.json` (deps `expo-av: ^16.0.8`)
- `__tests__/voiceModules.test.ts` — vérifier que les mocks tiennent (probable petit ajustement)
