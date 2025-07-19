// babel.config.mjs
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // No need to add '@babel/preset-env' here directly,
    // as 'babel-preset-expo' handles it.
  };
};