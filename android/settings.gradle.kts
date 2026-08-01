// The shared Android shell, built as its own Gradle build so it can be compiled
// and tested standalone, and included by each app as a composite build (see
// android/README.md). Repositories are declared here rather than inherited: an
// included build resolves its own dependencies.
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "shell"
include(":main")
