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

      // Invite links no longer auto-join. The user experience is now:
      //   - tap the link (or open the app some other way)
      //   - go to the Plans tab
      //   - tap "Have an invite code?" and type the code
      // So any deep link beginning with /invite/... simply drops the user on
      // the Plans tab. The `token` from the URL is intentionally ignored —
      // we want the user to type it in explicitly.
      if (route === 'invite' && token) {
        router.push('/(tabs)/plans');
      }
    };

    Linking.getInitialURL().then((url) => url && handleUrl(url));
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => subscription.remove();
  }, [router]);

  return null;
}