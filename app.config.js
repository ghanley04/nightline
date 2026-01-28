import 'dotenv/config';

export default {
  "expo": {
    "name": "nightline-app",
    "slug": "nightline-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "nightlineapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": false,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.anonymous.nightline-app",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      },
      "config": {
        "googleMapsApiKey": process.env.GOOGLE_MAPS_IOS_API_KEY
      }
    },
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": process.env.GOOGLE_MAPS_ANDROID_API_KEY
        }
      },
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.gghanley04.nightlineapp"
    },
    "web": {
      "bundler": "metro",
      "output": "server",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      "expo-secure-store",
      "expo-font"
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "router": {
        "origin": false
      },
      "googleMapsApiKey": process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      "eas": {
        "projectId": "8b818781-5d85-485b-a845-a9928d2d7f8c"
      }
    }
  }
}