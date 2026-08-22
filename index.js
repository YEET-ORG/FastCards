// Polyfills first — Privy's crypto stack needs TextEncoder + getRandomValues
// before ANY route module evaluates (expo-router loads route modules in path
// order, and (tabs)/_layout.tsx pulls in @privy-io/expo before the root
// layout's own polyfill imports run).
import 'fast-text-encoding';
import 'react-native-get-random-values';

// Native entry. The web build uses index.web.js, which must load Skia's
// CanvasKit WASM before the app boots — keep that import out of native
// bundles (its canvaskit-wasm dependency requires Node's `fs`, which
// breaks Android/iOS dev bundling at resolution time).
import 'expo-router/entry';