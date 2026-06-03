# Field Ops Pro - Native Mobile App

A professional-grade native mobile application for field technician time tracking with advanced GPS features, built with React Native and Expo.

## 🚀 Key Features

### Advanced GPS Tracking
- **High Precision**: 3-10 meter accuracy using native location services (vs 50-100m on web)
- **Background Tracking**: Continuous GPS tracking even with phone locked or app in background
- **Battery Optimized**: Adaptive tracking frequency based on battery level and movement
- **Offline Support**: Queues location data locally and syncs when connection returns

### Automatic Features
- **Geofencing**: Automatic detection when entering/exiting job sites
- **Smart Clock-In**: Option to auto-clock into jobs when arriving at location
- **Route Tracking**: Complete breadcrumb trail for mileage calculation
- **Quality Monitoring**: Tracks GPS accuracy and signal quality

### Security
- **Biometric Authentication**: Face ID, Touch ID, or fingerprint for clock in/out
- **Encrypted Storage**: All data encrypted at rest using device-level encryption
- **Secure Sync**: Certificate pinning prevents man-in-the-middle attacks

### Offline First
- **Local Database**: Full SQLite database for offline operation
- **Smart Sync**: Intelligent queue prioritizes critical data
- **Conflict Resolution**: Handles simultaneous web and mobile updates

## 📱 Prerequisites

- Node.js 18+ and npm
- iOS development: macOS with Xcode 14+
- Android development: Android Studio with SDK 33+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI (for building): `npm install -g eas-cli`

## 🛠 Installation

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Start Development Server

```bash
# Start Expo development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

## 🏗 Building for Production

### iOS

1. Configure EAS Build:
```bash
eas build:configure
```

2. Build for iOS:
```bash
# Development build
eas build --platform ios --profile development

# Production build
eas build --platform ios --profile production
```

3. Submit to App Store:
```bash
eas submit --platform ios
```

### Android

1. Build for Android:
```bash
# Development build
eas build --platform android --profile development

# Production build (AAB for Play Store)
eas build --platform android --profile production
```

2. Submit to Play Store:
```bash
eas submit --platform android
```

## 📐 Architecture

### Core Services

#### LocationTrackingService
- Manages background location updates
- Handles geofencing and job site detection
- Adapts tracking frequency based on battery
- Captures high-accuracy locations on demand

#### OfflineStorage
- Local SQLite database for offline operation
- Intelligent sync queue with conflict resolution
- Caches work orders for offline access
- Batches GPS breadcrumbs for efficient upload

### Context Providers

- **AuthContext**: User authentication and session management
- **LocationContext**: Real-time location state and permissions
- **OfflineContext**: Network status and sync management

## 🗄 Database Schema

The mobile app uses enhanced tables for GPS tracking:

### enhanced_gps_breadcrumbs
High-precision GPS points with rich metadata:
- Location: lat/lng, altitude, accuracy
- Movement: speed, heading
- Device: model, OS version, battery level
- Quality: capture method, signal strength

### geofence_events
Automatic job site arrival/departure:
- Technician and job site IDs
- Entry/exit timestamps
- Location where event occurred

### trip_segments
Route analysis for mileage:
- Start/end locations and times
- Total distance and duration
- Average and max speed

## 📱 Using the App

### First Launch

1. **Grant Permissions**
   - Location: Always (required for background tracking)
   - Camera: For job site photos
   - Biometric: Optional but recommended

2. **Login**
   - Use your company email and password
   - Biometric authentication will be available after first login

### Daily Clock

1. **Clock In**
   - Tap "CLOCK IN" button
   - Authenticate with biometric if enabled
   - GPS tracking starts automatically
   - High-accuracy location captured (may take 5-15 seconds)

2. **Take Breaks**
   - Tap "Start Break" to pause time tracking
   - Select break type: Lunch, Personal, Other
   - GPS tracking pauses during breaks
   - Tap "End Break" to resume

3. **Clock Out**
   - End all breaks first
   - Tap "Clock Out"
   - Add optional notes about your day
   - GPS tracking stops automatically
   - Final location captured

### Work Orders

- View assigned work orders for the day
- Tap to see details and customer information
- Clock into specific jobs
- Upload completion photos
- Mark as complete

### Offline Mode

The app works fully offline:
- Clock in/out saved locally
- GPS breadcrumbs queued
- Work orders cached
- Auto-syncs when connection returns
- Yellow banner shows pending sync count

## 🔧 Configuration

### Tracking Settings

Adjust in app settings:
- **Accuracy Mode**: High, Balanced, or Low
- **Update Interval**: 30-120 seconds
- **Distance Interval**: 25-100 meters
- **Battery Save**: Enable below threshold

### Geofencing

Configure job site geofences:
- Radius: 50-500 meters (default 100m)
- Auto notifications on arrival
- Optional auto clock-in

## 🐛 Troubleshooting

### GPS Not Working

1. **Check Permissions**
   - Settings → App → Location → Always
   - iOS: Must allow "Always" not just "While Using"

2. **Enable High Accuracy**
   - Android: Settings → Location → Mode → High Accuracy
   - iOS: Settings → Privacy → Location Services → On

3. **Disable Battery Optimization**
   - Android: Settings → Battery → Battery Optimization → App → Don't Optimize

### Poor GPS Accuracy

- Move to open area away from buildings
- Wait 15-30 seconds for GPS lock
- Check that airplane mode is off
- Restart device if persistent

### Battery Drain

- Check tracking frequency in settings
- Enable battery save mode
- Ensure app isn't updating when clocked out
- Update to latest version

### Sync Issues

- Check internet connection
- View pending sync count in time clock
- Pull to refresh in work orders
- Contact admin if persists

## 📊 For Managers/Dispatchers

### Real-Time Dashboard

Access on web app:
- Live map showing all active technicians
- Location updates every 10 seconds
- GPS accuracy and battery status
- Time worked and clock-in time

### Route History

View complete routes:
- Breadcrumb trail for entire day
- Calculate mileage for reimbursement
- Verify job site visits
- Export for reporting

### GPS Quality Reports

Monitor tracking performance:
- Accuracy statistics by technician
- Device capabilities and issues
- Battery impact analysis
- Signal quality trends

## 🔐 Privacy & Security

### Data Collection
- Location tracked only while clocked in
- Automatic deletion after 90 days
- Encrypted in transit and at rest
- No tracking during breaks or after clock out

### Employee Rights
- View all your location data
- Delete specific location points
- Disable tracking (will notify manager)
- Audit log of who accessed your data

### Manager Access
- Real-time location during work hours
- Historical routes for completed days
- Cannot view location outside work hours
- All access logged for audit

## 🚀 Deployment Checklist

### Pre-Launch
- [ ] Test on multiple device models
- [ ] Verify GPS accuracy across locations
- [ ] Test offline operation for full day
- [ ] Validate sync after extended offline
- [ ] Check battery usage over 8-hour shift
- [ ] Test geofencing at actual job sites
- [ ] Verify biometric authentication
- [ ] Load test real-time dashboard

### App Store Submission
- [ ] Screenshots for all device sizes
- [ ] App description and keywords
- [ ] Privacy policy URL
- [ ] Support email/URL
- [ ] Age rating and content warnings
- [ ] Test build with TestFlight/Internal Testing

### Post-Launch
- [ ] Monitor crash reports
- [ ] Track GPS success rate
- [ ] Survey user feedback
- [ ] Analyze battery impact
- [ ] Optimize based on usage patterns

## 📈 Performance Optimization

### GPS Tracking
- Adaptive frequency based on movement
- Significant location change monitoring
- Deferred updates for battery savings
- High-accuracy only when needed

### Data Sync
- Batch operations (100 breadcrumbs at once)
- Compress location data
- Sync during charging when possible
- Prioritize critical data

### Battery Optimization
- Reduce updates when stationary
- Lower accuracy on low battery
- Background fetch only when needed
- Efficient local database queries

## 🔄 Migration from Web App

### Transition Plan
1. **Pilot Phase** (Week 1-2)
   - 5-10 technicians test mobile app
   - Identify issues and gather feedback
   - Technicians can use web as backup

2. **Staged Rollout** (Week 3-6)
   - 25% of technicians (Week 3)
   - 50% of technicians (Week 4)
   - 75% of technicians (Week 5)
   - 100% rollout (Week 6)

3. **Web App Coexistence**
   - Both apps work simultaneously
   - Data syncs between platforms
   - Web app available for 2-3 months
   - Gradual deprecation of web features

### Data Compatibility
- Same database backend
- Clock entries work on both platforms
- Location data enhanced on mobile
- Work orders accessible on both

## 📞 Support

For technical issues:
- Email: support@yourcompany.com
- In-app: Help → Contact Support
- Admin: Access admin dashboard for device status

## 📄 License

Proprietary - Internal use only
© 2025 Your Company Name

## 🔮 Future Enhancements

### Planned Features
- Voice commands for hands-free operation
- Barcode scanning for inventory
- AR for equipment identification
- Vehicle telematics integration
- Offline maps for job sites
- Team messaging
- Digital forms and checklists
- Customer signature capture
- Photo annotations
- Route optimization
