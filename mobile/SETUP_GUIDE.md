# Mobile App Setup Guide

This guide will help you set up the Field Ops Pro mobile app for development and deployment.

## Quick Start (5 Minutes)

### 1. Install Expo Go on Your Phone

**iOS:**
- Open App Store
- Search for "Expo Go"
- Install the app

**Android:**
- Open Google Play Store
- Search for "Expo Go"
- Install the app

### 2. Start Development Server

```bash
cd mobile
npm install
npm start
```

### 3. Scan QR Code

- iOS: Open Camera app, scan QR code
- Android: Open Expo Go app, scan QR code

The app will load on your device instantly!

## Development Setup

### Install Node.js and Dependencies

```bash
# Verify Node.js 18+ is installed
node --version

# Install Expo CLI globally
npm install -g expo-cli

# Install EAS CLI for builds
npm install -g eas-cli

# Install project dependencies
cd mobile
npm install
```

### Configure Environment Variables

Create `mobile/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these values from:
1. Go to Supabase Dashboard
2. Project Settings → API
3. Copy Project URL and anon/public key

### Test GPS Features

GPS requires physical device (not simulator):

1. Connect iPhone via cable or use Expo Go
2. Allow location permissions when prompted
3. Go outdoors for best GPS signal
4. Test clock in/out with location tracking

## iOS Setup (macOS Required)

### Install Xcode

1. Download Xcode from Mac App Store (12GB+)
2. Open Xcode, accept license agreement
3. Install Command Line Tools:
```bash
xcode-select --install
```

### Install Simulators

```bash
# Install iOS Simulator
npx expo install ios

# Run on simulator
npm run ios
```

### Test on Physical iPhone

**Option 1: USB Cable (Recommended)**
1. Connect iPhone via USB
2. Trust computer on phone
3. Run: `npm run ios -- --device`

**Option 2: Expo Go**
1. Install Expo Go from App Store
2. Connect to same WiFi as computer
3. Scan QR code from `npm start`

## Android Setup

### Install Android Studio

1. Download from https://developer.android.com/studio
2. Install with default settings
3. Open Android Studio → More Actions → SDK Manager
4. Install SDK 33 (Android 13)

### Set Environment Variables

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Reload: `source ~/.zshrc`

### Create Virtual Device

1. Open Android Studio
2. More Actions → Virtual Device Manager
3. Create Device → Choose Pixel 6
4. Download System Image (API 33)
5. Finish setup

### Run on Emulator

```bash
# Start emulator
npx expo run:android

# Or specify device
npm run android
```

### Test on Physical Android

**Option 1: ADB (Recommended)**
1. Enable Developer Options on phone
2. Enable USB Debugging
3. Connect via USB
4. Run: `npm run android`

**Option 2: Expo Go**
1. Install Expo Go from Play Store
2. Same WiFi as computer
3. Scan QR code

## Building Production Apps

### EAS Setup (One Time)

```bash
# Login to Expo account
eas login

# Configure project
eas build:configure
```

This creates `eas.json` configuration.

### Build iOS App

```bash
# Development build (for testing)
eas build --platform ios --profile development

# Production build (for App Store)
eas build --platform ios --profile production
```

Builds take 15-30 minutes. Download .ipa file when done.

### Build Android App

```bash
# Development build
eas build --platform android --profile development

# Production build (AAB for Play Store)
eas build --platform android --profile production
```

Download .aab or .apk file when complete.

## App Store Submission

### iOS App Store

1. **Create App in App Store Connect**
   - Go to https://appstoreconnect.apple.com
   - My Apps → + → New App
   - Fill in app information

2. **Upload Build**
```bash
eas submit --platform ios
```

3. **Complete Metadata**
   - Screenshots (required sizes: 6.5", 5.5")
   - App description and keywords
   - Privacy policy URL
   - Support URL/email

4. **Submit for Review**
   - Typical review time: 24-48 hours

### Google Play Store

1. **Create App in Play Console**
   - Go to https://play.google.com/console
   - All apps → Create app
   - Fill in app details

2. **Upload Build**
```bash
eas submit --platform android
```

3. **Complete Store Listing**
   - Screenshots (phone, tablet)
   - Feature graphic (1024x500)
   - App description
   - Privacy policy URL

4. **Submit for Review**
   - Typical review time: 1-3 days

## Testing GPS Features

### Test Checklist

- [ ] Clock in captures accurate location (< 20m)
- [ ] Background tracking continues with screen locked
- [ ] App survives force quit and restarts tracking
- [ ] Geofencing triggers within 100m of job site
- [ ] Offline mode queues locations locally
- [ ] Sync works after extended offline period
- [ ] Battery drain acceptable over 8-hour shift
- [ ] Works in poor signal areas (buildings, tunnels)

### Testing Locations

Test in various environments:
- **Outdoors**: Best GPS accuracy (3-10m)
- **Urban areas**: Buildings affect signal (10-30m)
- **Indoor**: Poor GPS, uses WiFi/cell (30-100m)
- **Underground**: No GPS signal
- **Highway**: High-speed tracking

### Simulating Location (Development Only)

**iOS Simulator:**
1. Debug → Location → Custom Location
2. Enter lat/lng coordinates
3. Or choose preset (Apple, City Run, Freeway Drive)

**Android Emulator:**
1. Extended Controls (... menu)
2. Location tab
3. Enter coordinates or import GPX route

**Note:** Simulated location doesn't fully test native GPS features.

## Common Issues

### GPS Not Updating

**Check:**
1. Location permissions granted (Always)
2. GPS enabled on device
3. Device has clear view of sky
4. Not in airplane mode

**Fix:**
```bash
# Restart location services (iOS)
Settings → Privacy → Location Services → Toggle Off/On

# Reset GPS (Android)
Settings → Location → Toggle Off/On
```

### Build Failures

**Common causes:**
1. Missing dependencies: `rm -rf node_modules && npm install`
2. Outdated packages: `npm update`
3. Cache issues: `npx expo start --clear`
4. EAS config: Check `eas.json` syntax

### Expo Go Issues

**App won't load:**
1. Check same WiFi network
2. Disable VPN
3. Check firewall settings
4. Try LAN tunnel: `npx expo start --tunnel`

**Crashes on start:**
1. Update Expo Go app
2. Clear app data
3. Reinstall Expo Go

### Submission Rejections

**iOS common issues:**
- Missing purpose strings for permissions
- Background modes not justified
- Privacy policy missing/incorrect
- Screenshots don't match app

**Android common issues:**
- Target API level too old
- Permissions not declared
- Privacy policy required
- Content rating incomplete

## Performance Optimization

### Reduce App Size

```bash
# Enable Hermes (Android)
# Add to app.json:
"android": {
  "enableHermes": true
}

# Enable production mode
expo build:android --release-channel production
```

### Improve Startup Time

- Lazy load screens
- Optimize images (compress, resize)
- Remove unused dependencies
- Enable code splitting

### Battery Optimization

- Adjust GPS update frequency
- Use significant location changes
- Batch network requests
- Optimize background tasks

## Monitoring & Analytics

### Crash Reporting

Expo provides automatic crash reports:
1. Go to https://expo.dev
2. Select your project
3. View Errors & Logs

### Usage Analytics

Track app usage:
```bash
npm install expo-analytics
```

Configure in `App.tsx`:
```typescript
import * as Analytics from 'expo-analytics';

Analytics.initialize('UA-XXXXXXXX-X');
Analytics.track('Clock In', { location: 'job_site_123' });
```

### GPS Quality Monitoring

View in admin dashboard:
- Average accuracy by device
- Success rate per technician
- Battery impact statistics
- Signal quality heatmap

## Update Strategy

### Over-the-Air Updates (OTA)

Update app without store submission:

```bash
# Publish update
eas update --branch production --message "Fix GPS accuracy"

# Users receive update automatically
# Next time they open app
```

**Note:** Only works for JavaScript changes, not native code.

### Forced Updates

Require users to update:

```typescript
import * as Updates from 'expo-updates';

async function checkForUpdates() {
  const update = await Updates.checkForUpdateAsync();
  if (update.isAvailable) {
    await Updates.fetchUpdateAsync();
    Updates.reloadAsync();
  }
}
```

## Support Resources

- **Expo Docs**: https://docs.expo.dev
- **React Native Docs**: https://reactnative.dev
- **Location API**: https://docs.expo.dev/versions/latest/sdk/location/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **Community**: https://forums.expo.dev

## Next Steps

1. ✅ Complete setup above
2. 📱 Test on physical device
3. 🧪 Run through test checklist
4. 🚀 Build development version
5. 👥 Pilot with 5-10 technicians
6. 📊 Monitor GPS quality and battery
7. 🔄 Iterate based on feedback
8. 📦 Production rollout

Need help? Contact the development team or post in company Slack #tech-support channel.
