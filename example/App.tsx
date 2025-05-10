
import { Button, Text, View } from 'react-native';
import WireGuard from 'expo-wireguard'

export default function App() {

  const handleConfigure = async () => {
    const config = ``
    // Example configuration
    const status = await WireGuard.getStatus()
    console.log('Status:', status)
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Hej</Text>
      <Button title='Configure' onPress={handleConfigure} />
    </View>
  );
}