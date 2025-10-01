/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(tabs)` | `/(tabs)/` | `/(tabs)/pass` | `/(tabs)/profile` | `/(tabs)/rentals` | `/_sitemap` | `/auth/login` | `/auth/signup` | `/guest/create` | `/index-inner-tab` | `/interfaces/profile` | `/modal` | `/onboarding` | `/pass` | `/profile` | `/rental/request` | `/rentals` | `/subscription/payment` | `/subscription/plans`;
      DynamicRoutes: never;
      DynamicRouteTemplate: never;
    }
  }
}
