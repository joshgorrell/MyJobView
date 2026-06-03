# Mobile App Assets

Place your app icons and splash screens in this directory.

## Required Assets

### App Icon
- `icon.png` - 1024x1024 pixels
  - Used for iOS App Store and Android Play Store
  - Must be a square image

### Adaptive Icon (Android)
- `adaptive-icon.png` - 1024x1024 pixels
  - Foreground layer for Android adaptive icons
  - Should have safe area in center (inner 66%)

### Splash Screen
- `splash.png` - 1284x2778 pixels (recommended)
  - Shown while app is loading
  - Will be resized for different screen sizes

### Favicon (Web)
- `favicon.png` - 48x48 pixels
  - Used for web version

### Notification Icon (Android)
- `notification-icon.png` - 96x96 pixels
  - Monochrome icon for push notifications
  - Should be white with transparent background

## Creating Assets

You can use the following tools to create your app assets:

1. **Icon Generator**: https://icon.kitchen
2. **Figma Template**: https://www.figma.com/community/file/1155362909441341285
3. **Expo Icon Template**: https://docs.expo.dev/develop/user-interface/app-icons/

## Temporary Placeholders

For development, you can create simple placeholder images:

```bash
# Create a simple icon (requires ImageMagick)
convert -size 1024x1024 xc:blue -pointsize 200 -fill white -gravity center -annotate +0+0 "FO" icon.png

# Or use emoji as temporary icon
# On macOS, you can screenshot an emoji at large size
```

## After Creating Assets

1. Place all assets in this directory
2. Update `app.json` paths if needed
3. Run `npx expo prebuild` to generate native assets
4. Test on both iOS and Android devices

## Important Notes

- Icons should have no transparency (use solid background)
- Splash screens should work on both light and dark modes
- Test icons at small sizes (they appear tiny on home screens)
- Follow platform guidelines:
  - iOS: https://developer.apple.com/design/human-interface-guidelines/app-icons
  - Android: https://developer.android.com/develop/ui/views/launch/icon_design_adaptive
