import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

export default function AppLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = (url: string) => {
      console.log('Opened from URL:', url);

      // 🔥 Ignore OAuth callbacks — let Amplify handle these
      if (url.includes('code=') && url.includes('state=')) {
        console.log('OAuth callback detected, ignoring in AppLinkHandler');
        return;
      }

      // Handle nightlineapp:// deep links
      const path = url
        .replace('nightlineapp://', '')
        .replace('nightline://', '')
        .replace(/^\/--\//, ''); // strip Expo Go prefix if present

      const [route, token] = path.split('/');

      if (route === 'invite' && token) {
        router.push(`/invite/${token}`);
      }
    };

    Linking.getInitialURL().then((url) => url && handleUrl(url));
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => subscription.remove();
  }, [router]);

  return null;
}