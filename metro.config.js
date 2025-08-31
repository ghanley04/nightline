const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Add support for "@/..." imports
config.resolver.alias = {
  "@": path.resolve(__dirname),
};

module.exports = config;
