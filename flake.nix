{
  description = "@xinutec/ui-harness — shared phone-width layout checks for the fleet's Angular frontends";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [
            # TS build (tsc) + the harness's own Playwright fixture specs (tests/).
            # Playwright's Chromium comes from its own cache (npx playwright install),
            # same as the consuming apps — not a Nix dependency.
            pkgs.nodejs_24
          ];
        };
      });
    };
}
