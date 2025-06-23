We're building a native module using Expo Modules API and Expo config plugins to add VPN support using WireGuard. The module will allow users to connect to a WireGuard VPN server, manage configurations, and handle connection states.
We should use the swift package (xcframework) from https://github.com/passepartoutvpn/wg-go-apple which provides a binary version of wg-go. WireGuard should be used in a Network Extension to ensure it runs in the background and can handle VPN connections properly.
The module should include the following features:
1. **Connect to a WireGuard VPN server**: Users should be able to initiate a connection to a WireGuard VPN server using the provided configuration.
2. **Manage configurations**: Users should be able to add, remove, and list WireGuard configurations.
3. **Handle connection states**: The module should provide methods to check the current connection state, such as connected, disconnected, and connecting.
4. **Background operation**: The module should ensure that the VPN connection can run in the background, allowing users to maintain their VPN connection even when the app is not in the foreground.
5. **Error handling**: The module should handle errors gracefully, providing meaningful error messages to users when operations fail.
6. **Documentation**: Provide clear documentation on how to use the module, including setup instructions, API usage, and examples.
The module should be compatible with iOS for now. 
The implementation should follow best practices for iOS development, including proper use of the Network Extension framework and adherence to Apple's guidelines for VPN applications. The module should also be tested thoroughly to ensure reliability and performance.
The implementation should be modular and maintainable, allowing for future enhancements and updates. The code should be well-structured, with clear separation of concerns and adherence to the principles of clean architecture.
The module should be designed to be easily integrated into existing Expo applications, providing a seamless experience for developers and users alike. It should leverage the Expo Modules API to ensure compatibility with the Expo ecosystem and provide a consistent API for developers to work with.
The implementation should also consider security best practices, ensuring that sensitive information, such as VPN credentials, is stored securely and not exposed to unauthorized access.

I've placed the xcframework in the `ios/Frameworks` directory of the module.