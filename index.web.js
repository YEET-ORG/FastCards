// Web entry: react-native-skia needs its CanvasKit WASM runtime loaded
// before any module-level `Skia.*` calls execute (e.g. mesh-gradient's
// shader compilation). Native platforms use index.js, where Skia is
// ready synchronously.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb';

LoadSkiaWeb().then(() => {
  require('expo-router/entry');
});
