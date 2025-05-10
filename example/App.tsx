
import { Button, Text, View } from 'react-native';
import { configure } from 'expo-wireguard'

export default function App() {

  const handleConfigure = () => {
    const config = ``
    // Example configuration
    configure(config)
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Hej</Text>
      <Button title='Configure' onPress={handleConfigure} />
    </View>
  );
}