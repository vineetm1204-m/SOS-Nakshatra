import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  SEED_SATELLITES, 
  SEED_CONJUNCTIONS, 
  SEED_EVENTS, 
  DEFAULT_SETTINGS 
} from './data/seedData.js';
import { FleetSummary, SystemSettings } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory operational state (seeded)
let satellites = [...SEED_SATELLITES];
let conjunctions = [...SEED_CONJUNCTIONS];
let events = [...SEED_EVENTS];
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
const publicDir = path.resolve(__dirname, '../../public');
app.use(express.static(publicDir));

// --- API ROUTES ---

// 1. Health check
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    system: 'Safe Orbit for Satellites (SOS) Backend',
    version: '1.0.0',
    mode: settings.dataMode,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// 2. Fleet Summary
app.get('/api/v1/fleet/summary', (_req: Request, res: Response) => {
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

// 3. Satellites
app.get('/api/v1/satellites', (req: Request, res: Response) => {
  let result = [...satellites];
  const { status, orbitClass } = req.query;

  if (typeof status === 'string') {
    result = result.filter(s => s.operationalStatus.toLowerCase() === status.toLowerCase());
  }
  if (typeof orbitClass === 'string') {
    result = result.filter(s => s.orbitClass.toLowerCase() === orbitClass.toLowerCase());
  }

  res.json({ data: result, total: result.length });
});

app.get('/api/v1/satellites/:id', (req: Request, res: Response) => {
  const sat = satellites.find(s => s.id === req.params.id || s.callsign === req.params.id);
  if (!sat) {
    res.status(404).json({ error: `Satellite '${req.params.id}' not found in fleet registry.` });
    return;
  }
  res.json({ data: sat });
});

// 4. Conjunctions
app.get('/api/v1/conjunctions', (req: Request, res: Response) => {
  let result = [...conjunctions];
  const { riskLevel, status } = req.query;

  if (typeof riskLevel === 'string') {
    result = result.filter(c => c.riskLevel.toLowerCase() === riskLevel.toLowerCase());
  }
  if (typeof status === 'string') {
    result = result.filter(c => c.status.toLowerCase() === status.toLowerCase());
  }

  res.json({ data: result, total: result.length });
});

app.get('/api/v1/conjunctions/featured', (_req: Request, res: Response) => {
  const featured = conjunctions.find(c => c.isFeaturedScenario) || conjunctions[0];
  res.json({ data: featured });
});

app.get('/api/v1/conjunctions/:id', (req: Request, res: Response) => {
  const conj = conjunctions.find(c => c.id === req.params.id);
  if (!conj) {
    res.status(404).json({ error: `Conjunction '${req.params.id}' not found.` });
    return;
  }
  res.json({ data: conj });
});

// 5. Operational Events
app.get('/api/v1/events', (req: Request, res: Response) => {
  let result = [...events];
  const { category, severity, limit } = req.query;

  if (typeof category === 'string') {
    result = result.filter(e => e.category.toLowerCase() === category.toLowerCase());
  }
  if (typeof severity === 'string') {
    result = result.filter(e => e.severity.toLowerCase() === severity.toLowerCase());
  }
  if (typeof limit === 'string') {
    const lim = parseInt(limit, 10);
    if (!isNaN(lim)) {
      result = result.slice(0, lim);
    }
  }

  res.json({ data: result, total: result.length });
});

// 6. Settings
app.get('/api/v1/settings', (_req: Request, res: Response) => {
  res.json({ data: settings });
});

app.post('/api/v1/settings', (req: Request, res: Response) => {
  const updates = req.body;
  settings = { ...settings, ...updates };
  
  // Log setting change in event stream
  events.unshift({
    id: `EVT-${Date.now()}`,
    timestamp: new Date().toISOString(),
    category: 'SYSTEM',
    severity: 'INFO',
    title: 'System Settings Updated',
    description: `Operator updated settings: dataMode=${settings.dataMode}, criticalPc=${settings.criticalCollisionProbabilityThreshold}`,
    provenance: {
      source: settings.dataMode === 'DEMO' ? 'SYNTHETIC_DEMO' : 'LIVE_TELEMETRY',
      provider: 'SOS Local Operator Console',
      timestamp: new Date().toISOString(),
      isDeterministicDemo: settings.dataMode === 'DEMO',
      confidenceScore: 1.0
    }
  });

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
