/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(adminTabs)` | `/(adminTabs)/` | `/(adminTabs)/profile` | `/(busTabs)` | `/(busTabs)/` | `/(busTabs)/profile` | `/(tabs)` | `/(tabs)/` | `/(tabs)/pass` | `/(tabs)/plans` | `/(tabs)/profile` | `/_sitemap` | `/auth/auth` | `/auth/login` | `/auth/signup` | `/guest/create` | `/index-inner-tab` | `/index-old` | `/interfaces/interface` | `/interfaces/plan` | `/interfaces/profile` | `/modal` | `/onboarding` | `/pass` | `/plans` | `/profile` | `/rental/request` | `/subscription/payment` | `/subscription/rentals`;
      DynamicRoutes: `/invite/${Router.SingleRoutePart<T>}` | `/payment/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/invite/[inviteCode]` | `/payment/[result]`;
    }
  }
}
