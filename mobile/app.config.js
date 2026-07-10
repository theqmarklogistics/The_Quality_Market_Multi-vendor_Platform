// Dynamic config layered on top of app.json. Expo passes the static app.json content
// in as `config`; here we inject the Android Google Maps key from the environment
// (so it isn't committed) and register expo-notifications.
//
// Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env before building a dev/preview client —
// react-native-maps needs it to render Google Maps on Android.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      },
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    'expo-asset',
    [
      'expo-notifications',
      {
        color: '#111111',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow The Quality Market to use the camera to scan package QR codes.',
      },
    ],
  ],
});
