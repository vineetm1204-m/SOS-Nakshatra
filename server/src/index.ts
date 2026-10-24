import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { scenarioRepository } from './services/ScenarioRepository.js';
import { ManeuverService } from './services/ManeuverService.js';
import { FlightDirectorService } from './services/FlightDirectorService.js';
import { workflowService } from './services/WorkflowService.js';
import { DEFAULT_SETTINGS } from './data/seedData.js';
import { FleetSummary, SystemSettings } from './types.js';

const app = express();
const PORT = process.env.PORT || 3001;
const flightDirectorService = new FlightDirectorService();

// In-memory operational settings
let settings: SystemSettings = { ...DEFAULT_SETTINGS };

// Security and middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json());

// Request logger for aerospace audit trail
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Serve frontend static files from public/
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir));

// --- API ROUTES (Consumed via ScenarioRepository) ---

// 1. Health check & Scenario Integrity
app.get('/api/v1/health', (_req: Request, res: Response) => {
  const integrity = scenarioRepository.validateIntegrity();
  res.json({
    status: integrity.isValid ? 'OK' : 'DEGRADED',
    system: 'Safe Orbit for Satellites (SOS) Backend',
    version: '1.0.0',
    mode: settings.dataMode,
    integrityValidation: integrity,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// 2. Complete Deterministic Scenario
app.get('/api/v1/scenarios/featured', async (_req: Request, res: Response) => {
  const scenario = await scenarioRepository.getDeterministicScenario();
  res.json({ data: scenario });
});

// 3. Fleet Summary
app.get('/api/v1/fleet/summary', async (_req: Request, res: Response) => {
  const [satellites, conjunctions] = await Promise.all([
    scenarioRepository.getSatellites(),
    scenarioRepository.getConjunctions()
  ]);

  const summary: FleetSummary = {
    totalSatellites: satellites.length,
    operationalCount: satellites.filter(s => s.operationalStatus === 'OPERATIONAL').length,
    criticalRiskCount: satellites.filter(s => s.operationalStatus === 'CRITICAL_RISK').length,
    warningCount: satellites.filter(s => s.operationalStatus === 'DEGRADED').length,
    fuelNominalCount: satellites.filter(s => (s.remainingFuelKg / s.fuelCapacityKg) >= 0.2).length,
    pendingManeuversCount: conjunctions.filter(c => c.status === 'UNDER_REVIEW' || c.status === 'MANEUVER_PLANNED').length,
    activeConjunctionsCount: conjunctions.filter(c => c.status !== 'CLEARED').length,
    lastUpdated: new Date().toISOString(),
    dataMode: settings.dataMode
  };
  res.json({ data: summary });
});

// 4. Satellites
app.get('/api/v1/satellites', async (req: Request, res: Response) => {
  let result = await scenarioRepository.getSatellites();
  const { status, orbitClass } = req.query;

  if (typeof status === 'string') {
    result = result.filter(s => s.operationalStatus.toLowerCase() === status.toLowerCase());
  }
  if (typeof orbitClass === 'string') {
    result = result.filter(s => s.orbitClass.toLowerCase() === orbitClass.toLowerCase());
  }

  res.json({ data: result, total: result.length });
});

app.get('/api/v1/satellites/:id', async (req: Request, res: Response) => {
  const sat = await scenarioRepository.getSatelliteById(req.params.id);
  if (!sat) {
    res.status(404).json({ error: `Satellite '${req.params.id}' not found in fleet registry.` });
    return;
  }
  res.json({ data: sat });
});

// 5. Conjunctions
app.get('/api/v1/conjunctions', async (req: Request, res: Response) => {
  let result = await scenarioRepository.getConjunctions();
  const { riskLevel, status } = req.query;

  if (typeof riskLevel === 'string') {
    result = result.filter(c => c.riskLevel.toLowerCase() === riskLevel.toLowerCase());
  }
  if (typeof status === 'string') {
    result = result.filter(c => c.status.toLowerCase() === status.toLowerCase());
  }

  res.json({ data: result, total: result.length });
});

app.get('/api/v1/conjunctions/featured', async (_req: Request, res: Response) => {
  const featured = await scenarioRepository.getFeaturedConjunction();
  res.json({ data: featured });
});

app.get('/api/v1/conjunctions/:id', async (req: Request, res: Response) => {
  const conj = await scenarioRepository.getConjunctionById(req.params.id);
  if (!conj) {
    res.status(404).json({ error: `Conjunction '${req.params.id}' not found.` });
    return;
  }
  res.json({ data: conj });
});

// 6. Candidate Maneuver & Post-Maneuver Projection
app.get('/api/v1/maneuvers/candidate/:conjunctionId', async (req: Request, res: Response) => {
  const maneuver = await scenarioRepository.getCandidateManeuver(req.params.conjunctionId);
  const projection = await scenarioRepository.getPostManeuverProjection(req.params.conjunctionId);
  if (!maneuver) {
    res.status(404).json({ error: `Candidate maneuver for conjunction '${req.params.conjunctionId}' not found.` });
    return;
  }
  res.json({ data: { candidate: maneuver, projection } });
});

app.post('/api/v1/maneuvers/calculate', async (req: Request, res: Response) => {
  try {
    const { 
      spacecraftMassKg, 
      fuelCapacityKg, 
      remainingFuelKg, 
      specificImpulseSeconds, 
      deltaVMagnitudeMps, 
      burnDirection, 
      timeBeforeTcaSeconds, 
      baselineMissDistanceKm, 
      baselinePc 
    } = req.body;

    const evaluation = ManeuverService.evaluateManeuverCandidate({
      spacecraftMassKg: typeof spacecraftMassKg === 'number' ? spacecraftMassKg : 1250,
      fuelCapacityKg: typeof fuelCapacityKg === 'number' ? fuelCapacityKg : 200,
      remainingFuelKg: typeof remainingFuelKg === 'number' ? remainingFuelKg : 128.5,
      specificImpulseSeconds: typeof specificImpulseSeconds === 'number' ? specificImpulseSeconds : 220,
      deltaVMagnitudeMps: typeof deltaVMagnitudeMps === 'number' ? deltaVMagnitudeMps : 0.85,
      burnDirection: burnDirection || 'ALONG_TRACK_POS',
      timeBeforeTcaSeconds: typeof timeBeforeTcaSeconds === 'number' ? timeBeforeTcaSeconds : 9000,
      baselineMissDistanceKm: baselineMissDistanceKm || { total: 0.184, radial: -0.042, inTrack: 0.165, crossTrack: 0.071 },
      baselinePc: typeof baselinePc === 'number' ? baselinePc : 0.00482
    });

    res.json({ data: evaluation });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Maneuver evaluation failed.' });
  }
});

app.post('/api/v1/maneuvers/save', async (req: Request, res: Response) => {
  try {
    const { candidate, projection } = req.body;
    if (!candidate || !candidate.id) {
      res.status(400).json({ error: 'Invalid candidate payload.' });
      return;
    }
    const saved = await scenarioRepository.saveCandidateManeuver(candidate, projection);
    res.json({ data: saved, message: 'Candidate maneuver successfully persisted.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to save candidate.' });
  }
});

app.post('/api/v1/maneuvers/reset', async (_req: Request, res: Response) => {
  try {
    const resetCandidate = await scenarioRepository.resetCandidateManeuver();
    res.json({ data: resetCandidate, message: 'Candidate maneuver reset to default baseline.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reset candidate.' });
  }
});

// 7. Flight Director Assessment & AI Evaluation Engine
app.get('/api/v1/flight-director/assessment/:conjunctionId', async (req: Request, res: Response) => {
  try {
    const conjId = req.params.conjunctionId;
    const conjunction = await scenarioRepository.getConjunctionById(conjId) || await scenarioRepository.getFeaturedConjunction();
    const satellite = await scenarioRepository.getSatelliteById(conjunction.primarySatelliteId);
    const candidateManeuver = await scenarioRepository.getCandidateManeuver(conjunction.id);
    const recentEvents = await scenarioRepository.getEvents({ limit: 5 });

    if (!satellite) {
      res.status(404).json({ error: `Satellite for conjunction '${conjId}' not found.` });
      return;
    }

    const assessment = await flightDirectorService.evaluate({
      satellite,
      conjunction,
      candidateManeuver,
      workflowStage: (req.query.stage as string) || 'BURN',
      recentEvents,
      systemSettings: settings,
      forceFallback: req.query.forceFallback === 'true'
    });

    res.json({ data: assessment });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Flight Director evaluation failed.' });
  }
});

app.post('/api/v1/flight-director/evaluate', async (req: Request, res: Response) => {
  try {
    const { 
      conjunctionId, 
      satelliteId, 
      candidateManeuver, 
      workflowStage, 
      forceFallback, 
      simulateTimeout, 
      simulateMalformedAiResponse,
      mockAiResponse 
    } = req.body;

    const conjunction = (conjunctionId ? await scenarioRepository.getConjunctionById(conjunctionId) : null) || await scenarioRepository.getFeaturedConjunction();
    const satellite = (satelliteId ? await scenarioRepository.getSatelliteById(satelliteId) : null) || await scenarioRepository.getSatelliteById(conjunction.primarySatelliteId);
    const candidate = candidateManeuver !== undefined ? candidateManeuver : await scenarioRepository.getCandidateManeuver(conjunction.id);
    const recentEvents = await scenarioRepository.getEvents({ limit: 5 });

    if (!satellite) {
      res.status(404).json({ error: `Target satellite not found.` });
      return;
    }

    const assessment = await flightDirectorService.evaluate({
      satellite,
      conjunction,
      candidateManeuver: candidate,
      workflowStage: workflowStage || 'BURN',
      recentEvents,
      systemSettings: settings,
      forceFallback: !!forceFallback,
      simulateTimeout: !!simulateTimeout,
      simulateMalformedAiResponse: !!simulateMalformedAiResponse,
      mockAiResponse
    });

    res.json({ data: assessment });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Flight Director evaluation failed.' });
  }
});

app.post('/api/v1/flight-director/approve', async (req: Request, res: Response) => {
  try {
    const { conjunctionId, authorizationKey } = req.body;
    res.json({
      data: {
        approvalStatus: 'AUTHORIZED',
        conjunctionId: conjunctionId || 'CONJ-2026-084',
        authorizationKey: authorizationKey || `OP-AUTH-${Math.floor(10000 + Math.random() * 90000)}`,
        timestamp: new Date().toISOString(),
        message: 'Simulated operator sign-off confirmed. Burn gate cleared for execution.'
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to authorize burn.' });
  }
});

// 8. Workflow State Management (Phase 7)
app.get('/api/v1/workflow/status', (_req: Request, res: Response) => {
  res.json({ data: workflowService.getStatus() });
});

app.post('/api/v1/workflow/transition', async (req: Request, res: Response) => {
  try {
    const status = await workflowService.transition(req.body);
    res.json({ data: status });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Workflow transition failed.' });
  }
});

app.post('/api/v1/workflow/execute-burn', async (req: Request, res: Response) => {
  try {
    const result = await workflowService.executeSimulatedBurn(req.body);
    res.json({ data: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Simulated burn execution failed.' });
  }
});

app.post('/api/v1/workflow/reset', async (_req: Request, res: Response) => {
  try {
    const status = await workflowService.resetWorkflow();
    res.json({ data: status, message: 'Workflow successfully reset to initial state.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Workflow reset failed.' });
  }
});

// 8. Operational Events
app.get('/api/v1/events', async (req: Request, res: Response) => {
  const { category, severity, limit } = req.query;
  const events = await scenarioRepository.getEvents({
    category: typeof category === 'string' ? category : undefined,
    severity: typeof severity === 'string' ? severity : undefined,
    limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined
  });

  res.json({ data: events, total: events.length });
});

// 9. Settings
app.get('/api/v1/settings', (_req: Request, res: Response) => {
  res.json({ data: settings });
});

app.post('/api/v1/settings', (req: Request, res: Response) => {
  const updates = req.body;
  settings = { ...settings, ...updates };
  res.json({ data: settings, message: 'Settings successfully updated.' });
});

// Fallback route for HTML pages
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SOS Server Error]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Server listener
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[SOS Backend] Aerospace Operations Console running at http://localhost:${PORT}`);
    console.log(`[SOS Backend] Serving static frontend from ${publicDir}`);
  });
}

export default app;
