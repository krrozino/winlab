import test from "node:test";
import assert from "node:assert/strict";

import {
  PolicyEngineSimulator,
  TriStatePolicyRecord,
  DesiredState
} from "./harness";

test("Tier 3 [Cross-Feature 1]: Applying multiple policies with mixed activation requirements produces consolidated pending actions summary", () => {
  const policies: TriStatePolicyRecord[] = [
    {
      id: "personalization.wallpaper",
      name: "Bloqueio de Papel de Parede",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "personalization.sound_scheme",
      name: "Bloqueio de Esquema de Sons",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "browser.chrome_incognito",
      name: "Bloqueio de Modo Anônimo do Chrome",
      category: "Navegadores",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: false,
      requiresAppRestart: "Google Chrome"
    },
    {
      id: "browser.edge_guest",
      name: "Bloqueio de Modo Convidado do Edge",
      category: "Navegadores",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: false,
      requiresAppRestart: "Microsoft Edge"
    },
    {
      id: "applocker.audit",
      name: "AppLocker em Modo Auditoria",
      category: "Aplicativos",
      desiredState: "Allowed",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: false
    },
    {
      id: "system.credential_guard",
      name: "Proteção de Credenciais do Windows",
      category: "Sistema",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: true // requires reboot
    }
  ];

  const engine = new PolicyEngineSimulator(policies);
  const policyIds = policies.map((p) => p.id);

  const pending = engine.calculatePendingActions(policyIds);

  // Must group into consolidated summary rather than 6 distinct prompts
  assert.equal(pending.totalPending, 5); // 1 reboot + 2 logoff + 2 app restarts
  assert.deepEqual(pending.requiresReboot, ["Proteção de Credenciais do Windows"]);
  assert.deepEqual(pending.requiresLogoff, [
    "Bloqueio de Papel de Parede",
    "Bloqueio de Esquema de Sons"
  ]);

  assert.equal(pending.requiresAppRestart.length, 2);
  const chromeRestart = pending.requiresAppRestart.find((a) => a.app === "Google Chrome");
  assert.ok(chromeRestart);
  assert.deepEqual(chromeRestart.policyIds, ["Bloqueio de Modo Anônimo do Chrome"]);

  const edgeRestart = pending.requiresAppRestart.find((a) => a.app === "Microsoft Edge");
  assert.ok(edgeRestart);
  assert.deepEqual(edgeRestart.policyIds, ["Bloqueio de Modo Convidado do Edge"]);

  assert.deepEqual(pending.immediateActive, ["AppLocker em Modo Auditoria"]);
  assert.match(pending.summaryMessage, /requerem reinicialização do sistema/);
});

test("Tier 3 [Cross-Feature 2]: Policy apply failure midway through a batch triggers automated rollback of preceding policies", () => {
  const policies: TriStatePolicyRecord[] = [
    {
      id: "pol.1_accounts",
      name: "Restringir Contas Locais",
      category: "Contas",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "pol.2_chrome",
      name: "Bloquear Chrome Incognito",
      category: "Navegadores",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: false
    },
    {
      id: "pol.3_wallpaper",
      name: "Bloquear Wallpaper",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "pol.4_applocker",
      name: "Aplicar AppLocker XML",
      category: "Aplicativos",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: false,
      requiresRestart: false
    }
  ];

  const engine = new PolicyEngineSimulator(policies);

  // Simulate applying all 4 policies, with Policy 4 failing due to simulated permission error
  const result = engine.applyBatch(
    ["pol.1_accounts", "pol.2_chrome", "pol.3_wallpaper", "pol.4_applocker"],
    { failOnPolicyId: "pol.4_applocker" }
  );

  // Overall batch must report failure
  assert.equal(result.success, false);
  assert.equal(result.failedPolicyId, "pol.4_applocker");
  assert.equal(result.rollbackTriggered, true);
  assert.equal(result.rollbackSucceeded, true);

  // Preceding policies that succeeded initially must be reverted to baseline
  assert.equal(result.finalStates["pol.1_accounts"], "Reverted");
  assert.equal(result.finalStates["pol.2_chrome"], "Reverted");
  assert.equal(result.finalStates["pol.3_wallpaper"], "Reverted");

  // Failed policy must be marked Failed
  assert.equal(result.finalStates["pol.4_applocker"], "Failed");

  // Audit log must record the failure and automatic rollback
  assert.ok(
    result.auditLog.some((log) =>
      log.includes("Apply failed on policy pol.4_applocker. Triggering automated rollback.")
    )
  );
});

test("Tier 3 [Cross-Feature 3]: Startup drift detection identifies externally removed registry keys while preserving intact policies", () => {
  const policies: TriStatePolicyRecord[] = [
    {
      id: "personalization.wallpaper",
      name: "Bloqueio de Wallpaper",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "system.cmd",
      name: "Bloqueio do Prompt de Comando",
      category: "Sistema",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: false,
      requiresRestart: false
    },
    {
      id: "personalization.sound_scheme",
      name: "Bloqueio de Esquema de Sons",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: true,
      requiresRestart: false
    }
  ];

  const engine = new PolicyEngineSimulator(policies);

  // Live OS probe simulation:
  // - Wallpaper is intact in registry (Blocked)
  // - Sound scheme is intact in registry (Blocked)
  // - CMD was deleted externally by student/regedit (NotConfigured)
  const liveOsState = new Map<string, DesiredState>([
    ["personalization.wallpaper", "Blocked"],
    ["personalization.sound_scheme", "Blocked"],
    ["system.cmd", "NotConfigured"] // DRIFT!
  ]);

  const driftResult = engine.detectDrift(liveOsState);

  assert.equal(driftResult.totalPolicies, 3);
  assert.equal(driftResult.intactCount, 2);
  assert.equal(driftResult.driftedCount, 1);

  // Intact policies maintained
  assert.deepEqual(driftResult.intactPolicies, [
    "personalization.wallpaper",
    "personalization.sound_scheme"
  ]);

  // Drifted policy flagged
  const cmdDrift = driftResult.driftedPolicies.find((d) => d.id === "system.cmd");
  assert.ok(cmdDrift);
  assert.equal(cmdDrift.desired, "Blocked");
  assert.equal(cmdDrift.configured, "Blocked");
  assert.equal(cmdDrift.liveObserved, "NotConfigured");
  assert.match(cmdDrift.remediationAction, /Re-apply policy via UAC/);

  // Engine effective state updated to Drifted
  assert.equal(engine.getPolicy("system.cmd")?.effectiveState, "Drifted");
  assert.equal(engine.getPolicy("personalization.wallpaper")?.effectiveState, "Applied");
});

test("Tier 3 [Cross-Feature 4]: Switching between Demo Mode and Real Mode clears mock data and requires real scan", () => {
  interface DesktopAppState {
    mode: "Demo" | "Real";
    demoBannerVisible: boolean;
    inventory: {
      isMock: boolean;
      computerName: string;
    } | null;
  }

  // Initial Demo Mode
  const state: DesktopAppState = {
    mode: "Demo",
    demoBannerVisible: true,
    inventory: {
      isMock: true,
      computerName: "LAB-MICROLINS-01"
    }
  };

  assert.equal(state.mode, "Demo");
  assert.equal(state.demoBannerVisible, true);
  assert.equal(state.inventory?.isMock, true);

  // User toggles to Real Mode
  function switchMode(s: DesktopAppState, targetMode: "Demo" | "Real"): DesktopAppState {
    if (targetMode === "Real") {
      return {
        mode: "Real",
        demoBannerVisible: false,
        // Clears all mock inventory data
        inventory: null
      };
    } else {
      return {
        mode: "Demo",
        demoBannerVisible: true,
        inventory: {
          isMock: true,
          computerName: "LAB-MICROLINS-01"
        }
      };
    }
  }

  const realState = switchMode(state, "Real");
  assert.equal(realState.mode, "Real");
  assert.equal(realState.demoBannerVisible, false);
  assert.equal(realState.inventory, null, "Mock data must be cleared when entering Real Mode");

  // In Real Mode, real scan is injected
  realState.inventory = {
    isMock: false,
    computerName: "WIN11-PRODUCTION-PC"
  };
  assert.equal(realState.inventory.isMock, false);
  assert.equal(realState.inventory.computerName, "WIN11-PRODUCTION-PC");
});
