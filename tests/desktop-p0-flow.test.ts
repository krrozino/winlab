import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Test 1: Verify ACTION_QUERY_POLICY_STATE is properly handled
const realAgentService = readFileSync(
  fileURLToPath(new URL("../desktop/src/WinLab.Desktop/Services/RealAgentService.cs", import.meta.url)),
  "utf8"
);

test("ACTION_QUERY_POLICY_STATE delegates to ACTION_QUERY_POLICY_STATES on Windows", () => {
  // Verify that ActionQueryPolicyState case exists and delegates to executor
  assert.match(realAgentService, /case IpcConstants\.ActionQueryPolicyState:/, "ActionQueryPolicyState case must exist");
  assert.match(realAgentService, /OperatingSystem\.IsWindows\(\)/, "Must check for Windows OS");
  assert.match(realAgentService, /ModifyActionInJson.*ActionQueryPolicyStates/, "Must convert to ActionQueryPolicyStates");
  assert.match(realAgentService, /_executorClient\.HandleRequestAsync/, "Must delegate to executor");
});

test("ACTION_QUERY_POLICY_STATE returns catalog policies in non-Windows", () => {
  // Verify fallback to catalog in non-Windows
  assert.match(realAgentService, /PolicyCatalog\(\)/, "Must create PolicyCatalog");
  assert.match(realAgentService, /PolicyStateSummaryDto/, "Must return PolicyStateSummaryDto");
  assert.match(realAgentService, /PolicyState\.NotConfigured/, "Must set default state");
});

// Test 2: Verify ACTION_QUERY_PREFLIGHT delegates to executor
test("ACTION_QUERY_PREFLIGHT delegates to executor on Windows", () => {
  assert.match(realAgentService, /case IpcConstants\.ActionQueryPreflight:/, "ActionQueryPreflight case must exist");
  assert.match(realAgentService, /OperatingSystem\.IsWindows\(\)/, "Must check for Windows OS");
  assert.match(realAgentService, /_executorClient\.HandleRequestAsync/, "Must delegate to executor");
});

// Test 3: Verify ModifyActionInJson helper exists
test("ModifyActionInJson helper method exists", () => {
  assert.match(realAgentService, /private static string ModifyActionInJson/, "ModifyActionInJson must exist");
  assert.match(realAgentService, /JsonDocument\.Parse/, "Must parse JSON");
  assert.match(realAgentService, /JsonSerializer\.Serialize/, "Must serialize JSON");
});

// Test 4: Verify DesktopControlCenter toggle logic
const desktopControlCenter = readFileSync(
  fileURLToPath(new URL("../src/desktop/DesktopControlCenter.tsx", import.meta.url)),
  "utf8"
);

test("DesktopControlCenter toggle stores both Blocked and NotConfigured states", () => {
  // Verify that toggle doesn't just delete on false
  assert.match(desktopControlCenter, /newPending\[policyId\] = enabled/, "Must store enabled state");
  // Verify that it removes only if same state is toggled again
  assert.match(desktopControlCenter, /if \(newPending\[policyId\] === enabled\)/, "Must check if same state");
  assert.match(desktopControlCenter, /delete newPending\[policyId\]/, "Must delete if toggled back");
});

test("DesktopControlCenter applies correct desiredState", () => {
  // Verify that Blocked and NotConfigured are sent correctly
  assert.match(desktopControlCenter, /desiredState: enabled \? "Blocked" : "NotConfigured"/, "Must map to Blocked/NotConfigured");
});

// Test 5: Verify user selection for user-scoped policies
test("DesktopControlCenter has user selection for user-scoped policies", () => {
  assert.match(desktopControlCenter, /selectedUserSid/, "Must have selectedUserSid state");
  assert.match(desktopControlCenter, /nonAdminUsers/, "Must filter non-admin users");
  assert.match(desktopControlCenter, /hasUserScopedPolicies/, "Must track user-scoped policies");
  assert.match(desktopControlCenter, /canApply/, "Must check if can apply");
});

test("DesktopControlCenter sends targetUserSid in transaction", () => {
  assert.match(desktopControlCenter, /targetUserSid: selectedUserSid/, "Must send targetUserSid in payload");
});

test("DesktopControlCenter prevents applying user policies without selection", () => {
  assert.match(desktopControlCenter, /hasUserScopedPolicies && !selectedUserSid/, "Must check for user selection");
  assert.match(desktopControlCenter, /Selecione um usuário/, "Must show error message");
});

// Test 6: Verify review modal exists
test("DesktopControlCenter has review modal", () => {
  assert.match(desktopControlCenter, /showReviewModal/, "Must have showReviewModal state");
  assert.match(desktopControlCenter, /wl-modal-overlay/, "Must have modal overlay");
  assert.match(desktopControlCenter, /Revisar Alterações/, "Must have review title");
  assert.match(desktopControlCenter, /Confirmar e aplicar/, "Must have confirm button");
});

test("DesktopControlCenter shows requirements in review modal", () => {
  assert.match(desktopControlCenter, /requiresRestart/, "Must check restart requirement");
  assert.match(desktopControlCenter, /requiresLogoff/, "Must check logoff requirement");
  assert.match(desktopControlCenter, /requiresAppRestart/, "Must check app restart requirement");
});

test("DesktopControlCenter refreshes after apply", () => {
  assert.match(desktopControlCenter, /await onRefresh\(\)/, "Must refresh after apply");
});

// Test 7: Verify CSS styles for new components
test("CSS has styles for user selector", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../src/desktop/control-center.css", import.meta.url)),
    "utf8"
  );
  assert.match(css, /\.wl-user-selector/, "Must have wl-user-selector style");
  assert.match(css, /\.wl-user-selector select/, "Must have select style");
});

test("CSS has styles for modal", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../src/desktop/control-center.css", import.meta.url)),
    "utf8"
  );
  assert.match(css, /\.wl-modal-overlay/, "Must have wl-modal-overlay style");
  assert.match(css, /\.wl-modal/, "Must have wl-modal style");
  assert.match(css, /\.wl-review-item/, "Must have wl-review-item style");
});

// Test 8: Verify contracts have both singular and plural actions
test("Contracts have both QUERY_POLICY_STATE and QUERY_POLICY_STATES", () => {
  const contracts = readFileSync(
    fileURLToPath(new URL("../src/desktop/contracts.ts", import.meta.url)),
    "utf8"
  );
  assert.match(contracts, /ACTION_QUERY_POLICY_STATE/, "Must have singular action");
  assert.match(contracts, /ACTION_QUERY_POLICY_STATES/, "Must have plural action");
});
