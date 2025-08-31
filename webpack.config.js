const { createWebpackConfigAsync } = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createWebpackConfigAsync(env, argv);

  // Make any import of react-native-maps use the web version
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native-maps': '@teovilla/react-native-web-maps',
  };

  return config;
};
