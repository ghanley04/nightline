// babel.config.js
module.exports = function(api) {
    api.cache(true); // You can keep this
    return {
      presets: ['babel-preset-expo'],
      plugins: [
        // This line is CRUCIAL for Expo Router
        'expo-router/babel',
      ],
    };
  };