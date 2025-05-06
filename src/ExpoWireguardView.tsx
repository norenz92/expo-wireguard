import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoWireguardViewProps } from './ExpoWireguard.types';

const NativeView: React.ComponentType<ExpoWireguardViewProps> =
  requireNativeView('ExpoWireguard');

export default function ExpoWireguardView(props: ExpoWireguardViewProps) {
  return <NativeView {...props} />;
}
