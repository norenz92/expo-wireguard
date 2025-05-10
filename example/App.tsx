
import { Button, Text, View } from 'react-native';
import WireGuard from 'expo-wireguard'

export default function App() {

  const handleConfigure = async () => {
    const config = `
    [Interface]
Address = 192.168.6.129/32
DNS = 1.1.1.1,8.8.8.8
PrivateKey = WF/knPx7fXQIZGSofC3ZD/1+fIVLn8K1FO91j0q8cHc=
[Peer]
publickey=/UfEhhMgTeIPWu96ODEMU9oO4/7UKA6G8b5b33vKLH4=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = premiusa1.vpnjantit.com:1024`
    // Example configuration
    const status = await WireGuard.Connect(config, 'MyVPN', {
      title: 'VPN Connected',
      text: 'You are now connected to the VPN',
    });
    console.log('Status:', status)
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Hej</Text>
      <Button title='Configure' onPress={handleConfigure} />
      <Button title='Status' onPress={async () => {

        const status = await WireGuard.Status();
        console.log('Status:', status)
      }} />
    </View>
  );
}