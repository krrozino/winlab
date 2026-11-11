# Adversarial Challenger Report: Milestone 1 Iteration 3 (IPC Layer Boundary & Stress Verification)

**Agent ID:** `challenger_m1_iter3_2`  
**Milestone:** 1 — Desktop Foundation (ADR-001)  
**Iteration:** 3 — Edge-case Verification & Adversarial Stress Testing  
**Verdict:** **`DEFECT_FOUND`**  

---

## 1. Observation

### 1.1 Desktop IPC Unit Test Suite (`desktop-ipc.test.ts`)
- **Command:** `npx tsx --test tests/desktop-ipc.test.ts`
- **Output:**
  ```text
  ✔ IPC constants define strictly required pipe name and protocol version (3.992471ms)
  ✔ security validator blocks arbitrary shell execution strings (0.346618ms)
  ✔ security validator rejects empty or unlisted IPC actions (0.172764ms)
  ✔ security validator blocks privileged mutating actions in foundation desktop stage (0.132909ms)
  ✔ security validator allows valid read-only query and preview actions (3.343126ms)
  ✔ MockDesktopAgent returns structured read-only inventory conforming to schema (2.773163ms)
  ✔ MockDesktopAgent returns policy state summary with unconfigured initial state (0.294905ms)
  ✔ MockDesktopAgent rejects malicious payload containing shell injection (1.620482ms)
  ✔ MockDesktopAgent rejects attempt to invoke apply policies in foundation stage (0.277503ms)
  ✔ validateEnvelopeSchema enforces structural typing and rejects command fields (19.142247ms)
  ✔ WebViewIpcBridge detects environment and handles missing WebView2 runtime gracefully (27.59401ms)
  ℹ tests 11
  ℹ suites 0
  ℹ pass 11
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 589.795909
  ```
- **Exit Code:** `0` (11 passed, 0 failed).

---

### 1.2 Tier 2 Boundary Cases Test Suite (`tier2-boundary-cases.test.ts`)
- **Command:** `npx tsx --test tests/e2e/tier2-boundary-cases.test.ts`
- **Output:**
  ```text
  ✔ Tier 2 [Boundary 1]: Shell injection attempts in IPC payload are strictly blocked across varied attack vectors (7.524158ms)
  ✔ Tier 2 [Boundary 2]: Unauthorized web origins posting to WebView2 bridge are rejected (1.266815ms)
  ✔ Tier 2 [Boundary 3]: Target student account identical to administrator account triggers immediate BLOCK (11.24624ms)
  ✔ Tier 2 [Boundary 4]: Missing wwwroot directory in Release mode displays graceful fatal error dialog rather than fallback to localhost (0.394049ms)
  ✔ Tier 2 [Boundary 5]: Low free disk space (< 5%) triggers explicit storage warning and threshold verification (0.435975ms)
  ✔ Tier 2 [Boundary 6]: Student account with unmounted NTUSER.DAT defers user policies to scheduled task (1.184755ms)
  ✔ Tier 2 [Boundary 7]: Multiple consecutive policy applies maintain idempotent state without overwriting initial baseline (1.117533ms)
  ✔ Tier 2 [Boundary 8]: Corrupted state.json and package manifests are safely detected and quarantined without crashing (27.802077ms)
  ℹ tests 8
  ℹ suites 0
  ℹ pass 8
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 251.10217
  ```
- **Exit Code:** `0` (8 passed, 0 failed).

---

### 1.3 C# `MockAgentService` Boundary & Stress Verification (.NET 10)
- **Command:** `/home/antigravity/.dotnet/dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release`
- **Output:**
  ```text
  Passed!  - Failed:     0, Passed:   126, Skipped:     0, Total:   126, Duration: 982 ms - WinLab.Tests.dll (net10.0)
  ```
- **Exit Code:** `0` (126 passed, 0 failed, 0 skipped).
- **Sub-results on C# `MockAgentService`:**
  - Non-object tokens (`null`, `true`, `false`, `0`, `12345`, `[1, 2, 3]`, etc.): 100% returned structured `INVALID_ENVELOPE_SCHEMA` with non-empty string `ReplyToId`.
  - Empty and whitespace payloads: 100% caught and returned `MALFORMED_JSON` with non-empty string `ReplyToId`.
  - Empty, non-string, or whitespace `id` fields: 100% returned `INVALID_ENVELOPE_ID` with non-empty string `ReplyToId` (generated UUID).
  - Oversized payloads (100 KB, 1 MB, 5 MB, and 10,000 array elements): Handled gracefully, returning 100% schema-conforming responses.
  - Deeply nested structures: Handled cleanly up to 30 levels; structures exceeding max parser depth returned `MALFORMED_JSON` without unhandled exceptions.
  - Extreme field lengths (50,000 char ID): Preserved and returned in `ReplyToId`.
  - Malformed UTF-8, null bytes (`\u0000`), RTL overrides (`\u202E`), zero-width characters (`\u200B\u200C\u200D`), emoji sequences, and BOM prefixes: 100% handled without crash.
  - Shell injection patterns (12 vectors) and disallowed command properties (7 fields): 100% rejected with conforming failure responses.
  - High concurrency stress: 500 concurrent asynchronous tasks executed in 876 ms (570 req/sec) with 0 failures and 100% schema conformance.
  - Solution build: `dotnet build desktop/WinLab.sln -c Release -p:EnableWindowsTargeting=true` succeeded with 0 warnings and 0 errors.

---

### 1.4 Empirical Reproduction of Defect: Contract Violation in TypeScript `MockDesktopAgent`
While C# `MockAgentService` guarantees that `ReplyToId` is always a string, TypeScript's `MockDesktopAgent` (`src/desktop/mock-agent.ts`) violates the `IpcResponse<T>` schema when the envelope contains a non-string `id`.

- **Contract Definition (`src/desktop/contracts.ts:49-56`):**
  ```typescript
  export interface IpcResponse<T = unknown> {
    id: string;
    replyToId: string; // <-- MUST BE A STRING
    success: boolean;
    error?: string;
    errorCode?: string;
    data?: T;
  }
  ```

- **Faulty Code in `src/desktop/mock-agent.ts`:**
  Line 132:
  ```typescript
  public async handleRequest<T = unknown>(envelope: IpcEnvelope): Promise<IpcResponse<T>> {
    const schemaCheck = validateEnvelopeSchema(envelope);
    if (!schemaCheck.isValid) {
      return {
        id: crypto.randomUUID(),
        replyToId: envelope?.id || "", // <-- BUG: Non-string values (number, boolean, object) leak through
        success: false,
        error: schemaCheck.error,
        errorCode: schemaCheck.errorCode
      };
    }
  ```
  Lines 144 and 155 also contain the identical flaw:
  ```typescript
  replyToId: envelope.id || "",
  ```

- **Empirical Reproduction Command:**
  ```bash
  npx tsx -e '
  import { MockDesktopAgent } from "./src/desktop/mock-agent";
  async function test() {
    const agent = new MockDesktopAgent();
    const r1 = await agent.handleRequest({ id: 12345, type: "query", action: "inventory.query" } as any);
    console.log("Integer ID replyToId type:", typeof r1.replyToId, "value:", r1.replyToId);
    const r2 = await agent.handleRequest({ id: true, type: "query", action: "inventory.query" } as any);
    console.log("Boolean ID replyToId type:", typeof r2.replyToId, "value:", r2.replyToId);
    const r3 = await agent.handleRequest({ id: { tenant: "lab" }, type: "query", action: "inventory.query" } as any);
    console.log("Object ID replyToId type:", typeof r3.replyToId, "value:", r3.replyToId);
    const r4 = await agent.handleRequest({ id: [1, 2, 3], type: "query", action: "inventory.query" } as any);
    console.log("Array ID replyToId type:", typeof r4.replyToId, "value:", r4.replyToId);
  }
  test();
  '
  ```

- **Empirical Reproduction Output:**
  ```text
  Integer ID replyToId type: number value: 12345
  Boolean ID replyToId type: boolean value: true
  Object ID replyToId type: object value: { tenant: 'lab' }
  Array ID replyToId type: object value: [ 1, 2, 3 ]
  ```

In all cases, `typeof response.replyToId !== "string"`, directly violating the `IpcResponse<T>` interface contract.

---

## 2. Logic Chain

1. **Premise 1: IPC Contract Mandates Typed Response Fields:**
   - Both C# and TypeScript define the canonical IPC response envelope where `replyToId` is defined as a `string` (`src/desktop/contracts.ts:51` and `WinLab.Contracts/IpcEnvelope.cs:55`).
   - Consumers such as `WebViewIpcBridge` (`src/desktop/ipc-bridge.ts:127`) use `response.replyToId` as a lookup key in `pendingRequests` (`Map<string, PendingRequest<any>>`).
   - If `replyToId` is not a string (e.g. number, boolean, or object), key lookup fails or behaves unpredictably in strict runtime environments.

2. **Premise 2: Iteration 3 Fixed C# but Omitted TypeScript Parity:**
   - In Iteration 3, `worker_m1_iter3` addressed unhandled exceptions in C# `MockAgentService.cs` when non-string IDs were supplied. Line 43 in `MockAgentService.cs` was updated to:
     ```csharp
     string id = envelopeId ?? (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String ? idProp.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString());
     ```
     This strictly guarantees that in C#, `ReplyToId` is always a valid string (the request ID if string, or a generated GUID if not).
   - In TypeScript `src/desktop/mock-agent.ts`, the expression `envelope?.id || ""` uses JavaScript logical OR (`||`). When `envelope.id` is truthy (e.g., `12345`, `true`, `{}`), it does NOT evaluate to `""`; it evaluates directly to the truthy non-string operand.
   - Consequently, the response envelope returns `{ replyToId: 12345 }`, breaking runtime contract conformity.

3. **Conclusion:**
   - An adversarial input containing a non-string `id` token produces a response that violates the structural typing of `IpcResponse<T>`.
   - Therefore, a reproducible contract defect exists in `src/desktop/mock-agent.ts`.

---

## 3. Caveats

1. **Scope of Defect:**
   - The defect is confined to `src/desktop/mock-agent.ts` in lines 132, 144, and 155.
   - C# `MockAgentService` is **100% robust and conforming** across all 126 test cases.
2. **Standard Test Suite Masking:**
   - The existing test suite (`npm test`, 85 tests) passes because existing tests only pass valid string IDs or test `validateEnvelopeSchema` in isolation, without asserting `typeof response.replyToId === "string"` on the returned response from `handleRequest`.
3. **No Code Modification Constraint:**
   - Per Challenger role constraints, the challenger does not modify production code. The empirical reproduction is documented here for the worker agent to remediate.

---

## 4. Conclusion

- **Tests Checked:**
  - `desktop-ipc.test.ts`: 11/11 passed.
  - `tier2-boundary-cases.test.ts`: 8/8 passed.
  - `npm test`: 85/85 passed.
  - `WinLab.Tests` (C# .NET 10): 126/126 passed.
- **C# MockAgentService:** Conforms 100% to `IpcResponse<T>` schema.
- **TypeScript MockDesktopAgent:** **Defect Found** — contract violation when `envelope.id` is a non-string token (number, boolean, array, object). `replyToId` returns non-string values violating `IpcResponse<T>` schema.

**`VERDICT: DEFECT_FOUND`**

---

## 5. Verification Method

To reproduce the defect empirically:

```bash
# 1. Run the defect reproduction one-liner
npx tsx -e '
import { MockDesktopAgent } from "./src/desktop/mock-agent";
const agent = new MockDesktopAgent();
agent.handleRequest({ id: 12345, type: "query", action: "inventory.query" } as any).then(r => {
  console.log("Observed typeof replyToId:", typeof r.replyToId);
  console.assert(typeof r.replyToId === "string", "CONTRACT VIOLATION: replyToId must be string!");
});
'
```

Expected failure output:
```text
Observed typeof replyToId: number
Assertion failed: CONTRACT VIOLATION: replyToId must be string!
```

Recommended remediation for `worker`:
In `src/desktop/mock-agent.ts`, ensure `replyToId` is always sanitized to a string on all error returns (e.g. `typeof envelope?.id === "string" ? envelope.id : ""` or `String(envelope?.id || "")`), mirroring the C# behavior in `MockAgentService.cs:43`.
