export type OnLoadEventPayload = {
  url: string;
};

export type ExpoWireguardModuleEvents = {
  EVT_REGULAR: { event: string };
  EVT_EXCEPTION: { error: string };
  EVT_SYSTEM: { event: string };
};

export type ChangeEventPayload = {
  value: string;
};
