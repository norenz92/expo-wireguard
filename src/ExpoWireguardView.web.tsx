import * as React from 'react';

import { ExpoWireguardViewProps } from './ExpoWireguard.types';

export default function ExpoWireguardView(props: ExpoWireguardViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
