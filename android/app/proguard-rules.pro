# Firestore maps documents onto model classes reflectively, so the models and
# their constructors must survive shrinking. Losing them fails at runtime with an
# empty object rather than at build time, which is the worst kind of failure.
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses
-keepclassmembers class com.updatenotify.core.network.dto.** { *; }
-keep class com.updatenotify.core.network.dto.** { *; }

# Kotlin metadata, needed for reflection-based mapping.
-keep class kotlin.Metadata { *; }

# Firebase / Play Services
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Room generated implementations
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Coroutines internals referenced only from generated code
-dontwarn kotlinx.coroutines.**
