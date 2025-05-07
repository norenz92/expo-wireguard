import ExpoWireguardModule from './ExpoWireguardModule';

export function getTheme(): string {
  return ExpoWireguardModule.getTheme();
}

export function configure(config: string): string {
  return ExpoWireguardModule.configure(config);
}