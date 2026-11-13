# WinLab Development Plan - Desktop Functional

## Current State Analysis (PR #34 - feat/desktop-control-center-v1)

### What Works

1. **ControlCenter Component** (`src/desktop/ControlCenter.tsx`)
   - Clean navigation menu: Home, Accounts, Apps, Internet, System, Network, Diagnostics
   - Account creation with password (LocalAccountProvisioner via NetAPI32)
   - 5 native policies implemented and applicable:
     - `personalization.wallpaper` - Block wallpaper change
     - `personalization.sounds` - Block sound scheme change
     - `personalization.mouse_pointers` - Block mouse pointer change
     - `browser.chrome.incognito` - Block incognito mode (Chrome/Edge)
     - `browser.chrome.guest` - Block guest mode (Chrome/Edge)
   - Policy application flow: query → modify → apply → verify
   - Automatic rollback on failure
   - Admin immunity (cannot apply restrictions to admin accounts)
   - Baseline capture before applying
   - Immediate verification after applying

2. **Transaction Engine** (`desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`)
   - Atomic transaction ID reservation (FileMode.CreateNew)
   - Sequential policy application
   - Immediate verification after each policy
   - Automatic rollback on failure
   - Transaction logging

3. **Policy Handlers**
   - `RegistryDWordPolicyHandler` - Applies/Probes/Reverts registry DWORD values
   - `DualBrowserPolicyHandler` - Handles Chrome and Edge policies

4. **Executor** (`desktop/src/WinLab.Executor/`)
   - Elevated process via Named Pipes
   - Mutual authentication (token + PID)
   - Parent process watchdog
   - Handles: CreateLocalAccount, ApplyTransaction, RollbackTransaction, QueryPolicyStates

5. **Desktop Integration** (`src/app/desktop/page.tsx`)
   - Uses ControlCenter as main interface
   - Passes: mode, native, inventory, config, sendIpc
   - Supports Demo and Real modes
   - WebView2 communication

6. **Web Integration** (`src/app/page.tsx`)
   - Uses ControlCenter in Demo mode
   - Persists config in localStorage
   - Advanced mode redirects to /configurador

### What Needs Improvement

1. **Separation of Concerns (P0)**
   - Current: Same ControlCenter component for Desktop and Web
   - Required: Desktop should be admin tool, Web should be configurator only
   - Solution: Create separate components with shared logic

2. **Desktop Interface (P0)**
   - Each setting should show: name, description, toggle, current state, restart requirement
   - Clear flow: Query → Select changes → Pending → Apply → Verify → Result
   - Should NOT show development panels or demo data in main interface
   - Should show real Windows state

3. **Policy Coverage (P0)**
   - Current: 5 policies
   - Need to verify: Do all 5 policies actually work end-to-end?
   - Need to add: More common policies (CMD, PowerShell, USB, etc.)

4. **Web Configurator (P1)**
   - Should ONLY generate packages (no direct application)
   - Flow: Choose environment → Select settings → Review → Generate package
   - Package: Configurar-Computador.cmd, configurar.ps1, verificar.ps1, reverter.ps1, perfil.json

5. **Code Organization**
   - Current: Mix of desktop and web code
   - Required: Clear separation between Desktop and Web projects

## Implementation Strategy

### Phase 1: Verify and Fix Current Implementation

1. **Test the current flow:**
   - Can we query policy states?
   - Can we apply a policy?
   - Does verification work?
   - Does rollback work on failure?

2. **Fix any issues found**

### Phase 2: Separate Desktop and Web Components

1. **Create DesktopControlCenter.tsx**
   - Focus on direct Windows administration
   - Remove web-specific features
   - Add real-time state display

2. **Create WebConfigurator.tsx**
   - Focus on package generation
   - Remove direct application features
   - Add package export

3. **Keep shared logic** in separate modules

### Phase 3: Enhance Desktop Interface

1. **Improve navigation**
2. **Add policy status display**
3. **Add restart requirement indicators**
4. **Improve error messages**

## Action Items

### Immediate (This Session)

1. ✅ Inspect PR #32 and PR #34
2. ✅ Identify what works and what doesn't
3. ⏳ Create development branch
4. ⏳ Test current implementation
5. ⏳ Document findings
6. ⏳ Start implementing improvements

### Short Term (Next Sessions)

1. Create DesktopControlCenter component
2. Create WebConfigurator component
3. Add more policies
4. Test on real Windows machine (if possible)

## Decisions

### Use PR #34 as Base
- PR #34 has functional code that we can build upon
- PR #32 is more basic and lacks the ControlCenter
- Decision: **Use feat/desktop-control-center-v1 as base**

### Component Strategy
- **Desktop:** Direct administration, applies policies
- **Web:** Configuration only, generates packages
- **Shared:** Policy catalog, validation, generation logic

### Priority Order
1. Desktop functional with 1-2 policies working end-to-end
2. Web configurator generating valid packages
3. Add more policies
4. Improve UI/UX
5. Add network features
6. Add update features
