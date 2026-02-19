import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

export default function AppLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = (url: string) => {
      console.log('Opened from URL:', url);
      const path = url.replace('nightline://', '');
      const [route, token] = path.split('/'); // ["invite", "2bdf3f029a43"]

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
