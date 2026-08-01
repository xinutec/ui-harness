{
  description = "@xinutec/ui-harness — shared phone-width layout checks for the fleet's Angular frontends";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});

      # The Android SDK is unfree, so it gets its own pkgs import — keeping that
      # licence exception scoped to the shell that needs it. Versions track
      # android/main/build.gradle.kts (compileSdk 36, buildTools 36.0.0, JDK 17)
      # and must stay in step with the consuming apps' own android shells.
      androidShell = system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
            config.android_sdk.accept_license = true;
          };
          sdk = (pkgs.androidenv.composeAndroidPackages {
            cmdLineToolsVersion = "13.0";
            platformToolsVersion = "35.0.2"; # adb
            buildToolsVersions = [ "36.0.0" ];
            platformVersions = [ "36" ];
            abiVersions = [ ];
            includeNDK = false;
            includeSystemImages = false;
            includeEmulator = false;
          }).androidsdk;
          home = "${sdk}/libexec/android-sdk";
        in
        pkgs.mkShell {
          packages = [ pkgs.jdk17 sdk pkgs.ktlint ];
          shellHook = ''
            export ANDROID_HOME="${home}"
            export ANDROID_SDK_ROOT="${home}"
            export JAVA_HOME="${pkgs.jdk17.home}"
            echo "ui-harness android devshell — sdk: $ANDROID_HOME"
          '';
        };
    in {
      devShells = nixpkgs.lib.genAttrs systems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in {
        default = pkgs.mkShell {
          packages = [
            # TS build (tsc) + the harness's own Playwright fixture specs (tests/).
            # Playwright's Chromium comes from its own cache (npx playwright install),
            # same as the consuming apps — not a Nix dependency.
            pkgs.nodejs_24
          ];
        };

        # The shared WebView shell (android/). Build + test it standalone with:
        #   nix develop .#android --command ./android/gradlew -p android :main:test
        android = androidShell system;
      });
    };
}
