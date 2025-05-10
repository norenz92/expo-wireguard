export type OnLoadEventPayload = {
  url: string;
};

export type ExpoWireguardModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};
