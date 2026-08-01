// Root build script: declares the plugins the :main module applies. Versions are
// centralised in gradle/libs.versions.toml and must agree with every consuming
// app's own catalog — a composite build fails loudly when they diverge, which is
// the point.
plugins {
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
}
