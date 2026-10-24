# Safe Orbit for Satellites (SOS)
### Space Situational Awareness (SSA) & Conjunction Operations Console

Safe Orbit for Satellites (**SOS**) is an aerospace-grade Space Situational Awareness and Collision Avoidance Maneuver (CAM) operations console designed for Low Earth Orbit (LEO) satellite constellation management. It bridges real-time orbital tracking, conjunction risk analysis, optimal avoidance maneuver planning, AI-assisted flight direction, and a mandatory human-in-the-loop (HITL) execution pipeline.

---

## 1. System Architecture & Module Map

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                 SOS OPERATOR CONSOLE (UI)               │
                     │  Mission Control | Fleet Tracking | Conjunction Analysis │
                     │   Maneuver Planner | AI Flight Director | Audit Ledger  │
                     └────────────────────────────┬────────────────────────────┘
                                                  │ REST API / JSON
                     ┌────────────────────────────▼────────────────────────────┐
                     │           EXPRESS / TYPESCRIPT APPLICATION SERVER       │
                     │                                                         │
                     │  ┌──────────────────────┐    ┌───────────────────────┐  │
                     │  │ Scenario Repository  │    │  Workflow Engine      │  │
                     │  │ (Demo & Live-Sim)    │    │  (8-Stage State Mach) │  │
                     │  └──────────┬───────────┘    └───────────┬───────────┘  │
                     │             │                            │              │
                     │  ┌──────────▼───────────┐    ┌───────────▼───────────┐  │
                     │  │ Maneuver Engine      │    │ Flight Director Assist│  │
                     │  │ (Tsiolkovsky + CW)   │    │ (Gemini/OpenAI + Rule)│  │
                     │  └──────────────────────┘    └───────────────────────┘  │
                     └─────────────────────────────────────────────────────────┘
```

### Module Breakdown
- **Orbital 3D Digital Twin (`public/js/scene/orbital-scene.js`)**: Interactive Three.js Earth renderer featuring NASA Blue Marble day/night textures, normal/specular maps, cloud animation, graticule grid, Keplerian orbits, and dynamic camera controls.
- **Flight Director Engine (`server/src/services/FlightDirectorService.ts`)**: Structured AI decision support engine using Zod-validated JSON contracts with a deterministic rule-based fallback when external API keys are unavailable.
- **Maneuver Calculation Engine (`server/src/services/ManeuverService.ts`)**: Tsiolkovsky monopropellant fuel estimation and Clohessy-Wiltshire (Hill frame) relative encounter drift solver.
- **Workflow State Machine (`server/src/services/WorkflowService.ts`)**: 8-stage state machine enforcing legal transitions:
  $$\text{TRACK} \to \text{DETECT} \to \text{ASSESS} \to \text{PLAN} \to \text{APPROVE} \to \text{BURN} \to \text{VERIFY} \to \text{CLOSE}$$
- **State Store (`public/js/state.js`)**: Single source of truth across browser pages with `localStorage` and `sessionStorage` synchronization.

---

## 2. Prerequisites

- **Node.js**: `v18.0.0` or higher (Node 20+ recommended).
- **Package Manager**: `npm` (v9 or v10).
- **Web Browser**: Any modern browser supporting WebGL (Chrome, Edge, Firefox, Safari).

---

## 3. Installation & Startup

```bash
# 1. Clone repository
git clone https://github.com/vineetm1204-m/SOS-Nakshastra.git
cd SOS

# 2. Install dependencies
npm install

# 3. Build TypeScript server bundle
npm run build

# 4. Start production server
npm start
```

The application is served at **`http://localhost:3001`**.

For development with hot-reloading:
```bash
npm run dev
```

---

## 4. Environment Variables & Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

```bash
# Server Port
PORT=3001

# Operational Mode: 'DEMO' (reproducible deterministic scenario) or 'LIVE_SIMULATED'
DATA_MODE=DEMO

# Node Environment
NODE_ENV=production

# Optional: AI Flight Director LLM Keys (Deterministic fallback activates if omitted)
# GEMINI_API_KEY=your_gemini_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
```

> **Security Note:** Never commit live API keys. If keys are omitted or invalid, the console automatically engages its deterministic aerospace rule engine.

---

## 5. Verification & Test Commands

The project includes unit, integration, and end-to-end acceptance test suites powered by **Vitest**:

```bash
# Run the complete test suite (62 tests across 8 suites)
npm test

# Run TypeScript typecheck without emitting files
npm run typecheck

# Run code check (verifies type contracts and schema integrity)
npm run lint

# Build the production server bundle
npm run build

# Run specific 15-step demo path acceptance test
npx vitest run tests/e2e-demo-journey.test.ts
```

---

## 6. Primary 15-Step Operator Demo Journey

1. **Mission Control (`index.html`)**: Observe fleet overview, active conjunction banner, and 3D Earth digital twin.
2. **Inspect Provenance**: Notice data label `DEMO DATA (SSN-SIM)` indicating deterministic baseline.
3. **Select Asset**: Select primary satellite `SENTINEL-X (SAT-LEO-02)`.
4. **Open Conjunction (`conjunction.html`)**: Observe `CONJ-2026-084` with Cosmos 1408 debris fragment.
5. **Analyze Encounter**: Review TCA ($T-03\text{h } 28\text{m}$), critical miss distance ($184\text{ m} < 500\text{ m}$ threshold), and covariance ellipse.
6. **Request Assessment (`autopilot.html`)**: Flight Director evaluates orbital geometry and covariance.
7. **Audit Evidence**: Review supporting factual claims and operational assumptions.
8. **Plan Avoidance (`maneuvers.html`)**: Open CAM workspace with Tsiolkovsky rocket equation solver.
9. **Adjust Parameters**: Set along-track $\Delta V = 0.85\text{ m/s}$ ($2.5\text{ h}$ lead time); recalculate impact ($23,115\text{ m}$ projected clearance).
10. **Save Candidate**: Persist maneuver candidate; workflow transitions to `MANEUVER_CANDIDATE_CREATED`.
11. **Gate 5 Sign-Off**: Mandatory human-in-the-loop authorization barrier arms (`AWAITING_OPERATOR_APPROVAL`).
12. **Execute Simulated Burn**: Operator executes burn (`SIMULATED_MANEUVER_EXECUTING`); anti-duplicate lock engages.
13. **Post-Burn Verification**: Telemetry confirms thruster pulse; separation expands to $>23\text{ km}$; marked as **Illustrative verification**.
14. **Audit History (`history.html`)**: Verify event logged in immutable mission operations ledger.
15. **Return to Mission Control**: Observe consistent updated state and cleared encounter badge.

---

## 7. Scientific Assumptions & Engineering Limitations

1. **Thruster Model**: Assumes impulsive velocity increment approximation ($\Delta V$ instantaneous relative to orbital period).
2. **Propellant Calculation**: Solved using the ideal Tsiolkovsky equation:
   $$\Delta m = m_0 \cdot \left(1 - \exp\left(-\frac{\Delta v}{I_{sp} \cdot g_0}\right)\right)$$
   *Limitations*: Excludes finite burn cosine canting losses and propellant ullage settling delays.
3. **Relative Encounter Dynamics**: Estimated via linearized Clohessy-Wiltshire (CW / Hill frame) along-track drift equations. In adherence to flight doctrine, all post-burn clearances using linear models are labeled **"Illustrative verification (linearized relative encounter model)"**.
4. **Collision Probability**: Estimated using 2D B-plane encounter integration with Gaussian position covariance.
5. **Simulation Isolation**: Simulated burn executions are strictly local and isolated from live telemetry hardware.

---

## 8. Production Deployment

### Option A: Node.js System Service (Direct)
```bash
npm install --omit=dev
npm run build
NODE_ENV=production PORT=80 node dist/index.js
```

### Option B: Docker Container
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

---

## 9. License

Proprietary — Developed for SIH Safe Orbit for Satellites (SOS) Mission Operations.
