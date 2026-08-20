// Native entry. The web build uses index.web.js, which must load Skia's
// CanvasKit WASM before the app boots — keep that import out of native
// bundles (its canvaskit-wasm dependency requires Node's `fs`, which
// breaks Android/iOS dev bundling at resolution time).
import 'expo-router/entry';
