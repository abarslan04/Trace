const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLocalHttp(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = process.env.TRACE_ALLOW_LOCAL_HTTP === 'true' ? 'true' : 'false';
    return mod;
  });
};
