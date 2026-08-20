# ==============================================================================
# R8 / ProGuard Optimization & Shrinking Configuration for Kanelflow (Zenza)
# ==============================================================================

# Bytecode optimization & repackaging
-repackageclasses ''
-allowaccessmodification

# React Native TurboModules, NativeModules & JNI Entry Points
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.bridge.JavaScriptModule { *; }
-keep class com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * extends com.facebook.react.uimanager.ViewManager {
    public <methods>;
}
-keepclassmembers class * extends com.facebook.react.uimanager.ReactShadowNode {
    public <methods>;
}
-keep class com.facebook.react.uimanager.annotations.ReactProp { *; }
-keep class com.facebook.react.uimanager.annotations.ReactPropGroup { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }

# React Native Gesture Handler & Screens
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# React Native Razorpay
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-dontwarn com.google.android.gms.auth.api.phone.SmsRetrieverClient

# React Native Video & ExoPlayer
-keep class com.brentvatne.react.** { *; }
-keep class androidx.media3.** { *; }

# React Native Maps
-keep class com.rnmaps.** { *; }

# React Native SVG & Lottie
-keep class com.horcrux.svg.** { *; }
-keep class com.airbnb.lottie.** { *; }

# React Native Blob Util & PDF
-keep class com.ReactNativeBlobUtil.** { *; }
-dontwarn com.ReactNativeBlobUtil.**

# Strip Debug Logging in Release Builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
}

# Silence harmless warnings from third-party libraries
-dontwarn com.facebook.react.**
-dontwarn expo.modules.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.bouncycastle.**
