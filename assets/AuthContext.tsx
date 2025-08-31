// // AuthContext.tsx
// import React, { createContext, useContext, useState, useEffect } from "react";
// import * as AuthSession from "expo-auth-session";
// import * as SecureStore from "expo-secure-store";
// import { Platform } from "react-native";

// type AuthContextType = {
//     user: any;
//     token: string | null;
//     login: () => Promise<void>;
//     logout: () => Promise<void>;
// };

// const AuthContext = createContext<AuthContextType>({
//     user: null,
//     token: null,
//     login: async () => { },
//     logout: async () => { },
// });

// export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//     const [user, setUser] = useState<any>(null);
//     const [token, setToken] = useState<string | null>(null);

//     const CLIENT_ID = "<YOUR_CLIENT_ID>";
//     const REDIRECT_URI = AuthSession.makeRedirectUri({ useProxy: true });
//     const AUTH_URL = `https://your-auth-server.com/authorize?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid profile email`;

//     useEffect(() => {
//         // Load token from secure storage on app start
//         (async () => {
//             const savedToken = await SecureStore.getItemAsync("authToken");
//             if (savedToken) setToken(savedToken);
//         })();
//     }, []);

//     const login = async () => {
//         try {
//             // Generate the correct redirect URI for each platform
//             const redirectUri = AuthSession.makeRedirectUri({
//                 useProxy: Platform.select({ web: false, default: true }),
//             });

//             // Build auth URL with redirect
//             const authUrl = `${AUTH_URL}?redirect_uri=${encodeURIComponent(redirectUri)}`;

//             let result;

//             if (Platform.OS === "web") {
//                 // On web, we redirect to authUrl
//                 window.location.href = authUrl;
//                 return; // result will come back via URL params
//             } else {
//                 // On native, start the auth session
//                 result = await AuthSession.startAsync({ authUrl });
//             }

//             // Only process if we have a successful result on native
//             if (result?.type === "success" && result.params?.access_token) {
//                 const accessToken = result.params.access_token;

//                 // Save token securely
//                 await SecureStore.setItemAsync("authToken", accessToken);
//                 setToken(accessToken);

//                 // Fetch user info from your backend
//                 const response = await fetch("https://your-api.com/userinfo", {
//                     headers: { Authorization: `Bearer ${accessToken}` },
//                 });
//                 const userInfo = await response.json();
//                 setUser(userInfo);
//             }
//         } catch (error) {
//             console.error("Login failed:", error);
//         }
//     };

//     const logout = async () => {
//         setToken(null);
//         setUser(null);
//         await SecureStore.deleteItemAsync("authToken");
//     };

//     return (
//         <AuthContext.Provider value={{ user, token, login, logout }}>
//             {children}
//         </AuthContext.Provider>
//     );
// };

// export const useAuth = () => useContext(AuthContext);
