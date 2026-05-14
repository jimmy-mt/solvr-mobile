const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}

if (!config.resolver.assetExts.includes('onnx')) {
  config.resolver.assetExts.push('onnx');
}

// React Native Web 0.21 uses internal extensionless imports that Metro can
// mis-resolve on web when package exports are enabled.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
