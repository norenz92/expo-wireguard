// Reexport the native module. On web, it will be resolved to ExpoWireguardModule.web.ts
// and on native platforms to ExpoWireguardModule.ts
export { default } from './ExpoWireguardModule';
export { default as ExpoWireguardView } from './ExpoWireguardView';
export * from  './ExpoWireguard.types';
