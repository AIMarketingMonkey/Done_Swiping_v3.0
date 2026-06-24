// Default Expo Metro config. Kept explicit so platform-specific resolution
// (voice.web.tsx / voice.native.tsx) and the web export behave predictably.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js has a guarded optional `import('@opentelemetry/api')`
// for tracing. We don't use it, and it isn't installed. Metro can't see that the
// import is wrapped in a try/catch, so it fails to bundle. Stub it to an empty
// module — supabase-js already handles the missing package gracefully.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api') {
    return { type: 'empty' };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
