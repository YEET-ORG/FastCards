// Metro config — extends Expo's default. Privy's dependency chain pulls
// `jose`, whose package exports default to the Node build (needs
// `buffer`/`crypto`). Preferring the `browser` condition makes Metro pick
// the Web-Crypto build, which runs fine in Hermes with the polyfills the
// app already loads (fast-text-encoding, react-native-get-random-values).

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

module.exports = config;
