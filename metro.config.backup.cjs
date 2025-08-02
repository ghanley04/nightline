// metro.config.cjs
//const { getDefaultConfig } = require("expo/metro-config");

// module.exports = {
//   resolver: {
//     unstable_conditionNames: ['browser', 'require', 'react-native'],
//   },
// };

const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package exports for better module resolution with modern libraries
config.resolver.unstable_enablePackageExports = true;

module.exports = config;

// import { getDefaultConfig } from '@expo/metro-config';

// const config = getDefaultConfig(__dirname);

// // Enable package exports for better module resolution with modern libraries
// config.resolver.unstable_enablePackageExports = true;

// export default config;