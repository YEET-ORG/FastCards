// Custom entry point: react-native-skia needs its CanvasKit WASM runtime
// loaded before any module-level `Skia.*` calls execute (e.g. mesh-gradient's
// shader compilation). On native platforms Skia is ready synchronously, so
// only web needs to wait on it first.
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web/LoadSkiaWeb');
  LoadSkiaWeb().then(() => {
    require('expo-router/entry');
  });
} else {
  require('expo-router/entry');
}
