// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { routesFrom, screens } from "./routes.js";

describe("screens", () => {
  it("fills each parameter from the samples, encoded", () => {
    expect(screens(["/", "/s/:id/w/:run"], { id: "a b", run: "r1" })).toEqual([
      { route: "/", url: "/" },
      { route: "/s/:id/w/:run", url: "/s/a%20b/w/r1" },
    ]);
  });

  it("refuses a route whose parameter has no sample, naming every one", () => {
    expect(() => screens(["/s/:id", "/s/:id/a/:agent", "/m/:name"], { id: "x" })).toThrow(
      "no sample for :agent, :name",
    );
  });
});

describe("routesFrom", () => {
  const dir = mkdtempSync(join(tmpdir(), "routes-"));

  it("reads the list ui-routes writes", () => {
    const file = join(dir, "routes.json");
    writeFileSync(file, '{ "routes": ["/", "/s/:id"] }\n');
    expect(routesFrom(file)).toEqual(["/", "/s/:id"]);
  });

  it("refuses any other shape", () => {
    const file = join(dir, "bad.json");
    writeFileSync(file, '{ "screens": ["/"] }');
    expect(() => routesFrom(file)).toThrow("want {\"routes\"");
  });
});
