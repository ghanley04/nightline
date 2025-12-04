/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(tabs)` | `/(tabs)/` | `/(tabs)/pass` | `/(tabs)/plans` | `/(tabs)/profile` | `/_sitemap` | `/auth/auth` | `/auth/login` | `/auth/signup` | `/guest/create` | `/index-inner-tab` | `/index-old` | `/interfaces/plan` | `/interfaces/profile` | `/modal` | `/onboarding` | `/pass` | `/plans` | `/profile` | `/rental/request` | `/subscription/payment` | `/subscription/rentals`;
      DynamicRoutes: never;
      DynamicRouteTemplate: never;
    }
  }
}
