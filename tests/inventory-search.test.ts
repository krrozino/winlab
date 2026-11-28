import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findPotentiallyRelevantInstalledApps } from "../src/lib/inventory";
import type { InventoryInstalledApp, PcInventory } from "../src/lib/inventory-types";

const installedApps: InventoryInstalledApp[] = [
  {
    name: "Gestão Escolar",
    version: "1.0",
    publisher: "Fundação Educação",
    installLocation: "C:\\Programas\\Gestão Escolar"
  },
  {
    name: "Relatório Fiscal",
    version: "2.0",
    publisher: "Acme",
    installLocation: "D:\\Relatórios"
  },
  {
    name: "Plain Tool",
    version: "3.0",
    publisher: "Vendor",
    installLocation: "C:\\Tools"
  }
];

const inventory = { installedApps } as PcInventory;

describe("findPotentiallyRelevantInstalledApps", () => {
  it("matches accents and case in name, publisher, and install path", () => {
    assert.deepEqual(
      findPotentiallyRelevantInstalledApps(inventory, "GESTAO"),
      [installedApps[0]]
    );
    assert.deepEqual(
      findPotentiallyRelevantInstalledApps(inventory, "GESTÃO"),
      [installedApps[0]]
    );
    assert.deepEqual(
      findPotentiallyRelevantInstalledApps(inventory, "fundacao"),
      [installedApps[0]]
    );
    assert.deepEqual(
      findPotentiallyRelevantInstalledApps(inventory, "RELATORIOS"),
      [installedApps[1]]
    );
  });

  it("preserves no-match, empty-query order, values, and the 40-result limit", () => {
    assert.deepEqual(findPotentiallyRelevantInstalledApps(inventory, "inexistente"), []);
    assert.deepEqual(findPotentiallyRelevantInstalledApps(inventory, "\u0301"), []);
    assert.deepEqual(findPotentiallyRelevantInstalledApps(inventory, "   "), installedApps);

    const manyApps = Array.from({ length: 45 }, (_, index) => ({
      ...installedApps[2],
      name: `Aplicativo ${index}`
    }));
    const result = findPotentiallyRelevantInstalledApps(
      { installedApps: manyApps } as PcInventory,
      "aplicativo"
    );

    assert.equal(result.length, 40);
    assert.deepEqual(result, manyApps.slice(0, 40));
  });
});
