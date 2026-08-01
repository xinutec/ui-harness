plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

// Consumed as "org.xinutec:shell", substituted to this project by each app's
// settings.gradle.kts. No version is ever declared: the build resolves by path
// against whatever is checked out, the same roll-forward stance as :latest images.
group = "org.xinutec"

android {
    namespace = "org.xinutec.shell"
    compileSdk = 36
    // Pin to the build-tools the nix SDK provides (AGP would otherwise pick a
    // version that isn't in the read-only SDK).
    buildToolsVersion = "36.0.0"

    defaultConfig {
        // The floor across the consuming apps: on Android 8+ the system WebView is
        // Chromium, so an Angular app renders as it does in Chrome.
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // ComponentActivity is the shell's superclass, so it is part of its API: an
    // app subclassing WebShellActivity compiles against it.
    api(libs.androidx.activity)
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
}
