import * as Wireguard from 'expo-wireguard';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Config: {Wireguard.configure(['test'])}</Text>
    </View>
  );
}