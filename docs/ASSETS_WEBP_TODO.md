# PNG → WebP conversion (S4-T1, partial)

## Status

The dead `assets/bootsplash2.mp4` (471 KB, never referenced) was deleted in
Sprint 4. The PNG → WebP conversion of the four icon files was *not*
completed in that sprint because the required tooling was not present on
the dev machine.

## Pending work

`assets/images/{icon,adaptive-icon,notification-icon,splash-icon}.png` are
each 141 KB. Converting to WebP at quality 85 typically yields ~25 % of
the original size (≈35 KB each, **−420 KB total bundle**).

## How to do it

```bash
brew install webp                         # one-time tooling
cd assets/images
for f in icon adaptive-icon notification-icon splash-icon; do
  cwebp -q 85 "$f.png" -o "$f.webp"
done
```

## Caveats

- **iOS app icon**: must remain PNG. Apple's App Store / iOS launcher
  pipelines reject WebP for the primary app icon. `icon.png` stays.
- **Android adaptive icon**: must remain PNG (adaptive icon spec).
- **Notification icon**: Android requires PNG for `expo-notifications`.
- **Splash icon**: Expo splash plugin accepts both, but document the
  switch in `app.json` if you change the path.

So the realistic conversion is **only on `splash-icon.png`** (web) and
any other purely in-app images we add later. The four canonical icons
stay PNG.

## Recommendation

Defer until there are larger image assets in the bundle that aren't
locked into PNG by platform requirements. Current win from icon
conversion alone is marginal (~30 KB).
