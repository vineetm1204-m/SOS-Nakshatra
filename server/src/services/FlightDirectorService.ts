import { 
  Satellite, 
  ConjunctionEvent, 
  ManeuverCandidate, 
  OperationalEvent, 
  FlightDirectorOutputContract,
  FlightDirectorOutputContractSchema
} from '../types.js';

export interface FlightDirectorInputs {
  satellite: Satellite;
  conjunction: ConjunctionEvent;
  candidateManeuver?: ManeuverCandidate | null;
  workflowStage?: string; // 'TRACK' | 'DETECT' | 'ASSESS' | 'PLAN' | 'BURN' | 'CLEAR'
  recentEvents?: OperationalEvent[];
  systemSettings?: {
    criticalMissDistanceThresholdKm?: number;
    criticalCollisionProbabilityThreshold?: number;
  };
  forceFallback?: boolean;
  simulateTimeout?: boolean;
  simulateMalformedAiResponse?: boolean;
  mockAiResponse?: string;
}

export interface IAIProvider {
  generate(systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<string>;
}

/**
 * Standard HTTP AI Provider supporting Gemini or OpenAI REST endpoints.
 * Keeps credentials securely on the server.
 */
export class ServerSideAIProvider implements IAIProvider {
  async generate(systemPrompt: string, userPrompt: string, timeoutMs = 4000): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      throw new Error('AI credentials missing: Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured on server.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (geminiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `${systemPrompt}\n\nTask:\n${userPrompt}` }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (!res.ok) {
          throw new Error(`Gemini API HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json() as any;
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response from Gemini API.');
        return rawText;
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
          })
        });

        if (!res.ok) {
          throw new Error(`OpenAI API HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json() as any;
        const rawText = data?.choices?.[0]?.message?.content;
        if (!rawText) throw new Error('Empty response from OpenAI API.');
        return rawText;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * AI Flight Director Service
 * Combines server-side AI evaluation with robust deterministic rule-based fallback,
 * ensuring zero hallucinations, strict schema validation, and safe operator boundaries.
 */
export class FlightDirectorService {
  private aiProvider: IAIProvider;

  constructor(aiProvider?: IAIProvider) {
    this.aiProvider = aiProvider || new ServerSideAIProvider();
  }

  /**
   * Main evaluation entry point. Attempts AI assessment first (if available and not forced to fallback),
   * strictly validating the output schema. On failure, immediately engages deterministic fallback.
   */
  async evaluate(inputs: FlightDirectorInputs): Promise<FlightDirectorOutputContract> {
    const { forceFallback, simulateTimeout, simulateMalformedAiResponse, mockAiResponse } = inputs;

    if (!forceFallback) {
      try {
        let rawAiResponse: string;

        if (simulateTimeout) {
          await new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out after 4000ms')), 50));
        }

        if (simulateMalformedAiResponse) {
          rawAiResponse = '{"invalid_field": 123, "broken": true}';
        } else if (mockAiResponse) {
          rawAiResponse = mockAiResponse;
        } else {
          const { systemPrompt, userPrompt } = this.buildPrompt(inputs);
          rawAiResponse = await this.aiProvider.generate(systemPrompt, userPrompt, 4000);
        }

        // Parse and validate strictly against FlightDirectorOutputContractSchema
        const parsed = JSON.parse(rawAiResponse);
        
        // Ensure source is explicitly labeled as 'ai'
        parsed.source = 'ai';
        // Enforce safety boundary: Flight Director requires operator review
        parsed.requires_operator_review = true;

        const validation = FlightDirectorOutputContractSchema.safeParse(parsed);
        if (validation.success) {
          return validation.data;
        } else {
          console.warn('[FlightDirectorService] AI output failed schema validation:', validation.error.format());
          // Fall through to deterministic fallback
          return this.generateDeterministicFallback(
            inputs, 
            `AI response rejected: Malformed schema (${validation.error.issues.map(i => i.message).join(', ')})`
          );
        }
      } catch (err: any) {
        console.warn('[FlightDirectorService] AI evaluation error, engaging deterministic fallback:', err.message);
        return this.generateDeterministicFallback(inputs, `AI unavailable: ${err.message}`);
      }
    }

    return this.generateDeterministicFallback(inputs, 'Operator requested deterministic rule-based evaluation.');
  }

  /**
   * Builds the minimal necessary scenario data prompt for the AI assistant.
   */
  private buildPrompt(inputs: FlightDirectorInputs): { systemPrompt: string; userPrompt: string } {
    const { satellite, conjunction, candidateManeuver, workflowStage } = inputs;

    const systemPrompt = `You are the SOS AI Flight Director, an aerospace operations decision assistant for satellite conjunction assessment.
You assist human operators by summarizing the conjunction event, detailing specific factual evidence, identifying uncertainties/assumptions, and recommending the next workflow step.
IMPORTANT SAFETY INSTRUCTIONS:
- You are an advisory assistant, NOT an autonomous spacecraft controller.
- All recommendations require human operator review and authorization.
- You must return ONLY a valid JSON object matching this exact schema:
{
  "summary": "Concise 1-2 sentence executive operational assessment",
  "severity": "CRITICAL" | "WARNING" | "INFO",
  "evidence": ["Factual claim 1 with numbers/units", "Factual claim 2"],
  "recommendation": "Specific next action for the flight controller",
  "assumptions": ["Limitation or unmodeled perturbation 1", "Data quality assumption 2"],
  "source": "ai",
  "requires_operator_review": true
}`;

    const userPrompt = JSON.stringify({
      context: 'Operational Conjunction Assessment',
      workflowStage: workflowStage || 'ASSESS',
      satellite: {
        id: satellite.id,
        name: satellite.name,
        altitudeKm: satellite.orbit.altitudeKm,
        fuelRemainingKg: satellite.remainingFuelKg,
        fuelCapacityKg: satellite.fuelCapacityKg,
        propulsionStatus: satellite.subsystems.propulsion,
        isStale: satellite.orbitDataStatus === 'STALE'
      },
      conjunction: {
        id: conjunction.id,
        threatName: conjunction.secondaryObjectName,
        threatType: conjunction.secondaryObjectType,
        tca: conjunction.tca,
        timeToTcaSeconds: conjunction.timeToTcaSeconds,
        missDistanceMeters: Math.round(conjunction.missDistanceKm.total * 1000),
        radialMeters: Math.round(conjunction.missDistanceKm.radial * 1000),
        inTrackMeters: Math.round(conjunction.missDistanceKm.inTrack * 1000),
        crossTrackMeters: Math.round(conjunction.missDistanceKm.crossTrack * 1000),
        collisionProbability: conjunction.collisionProbability,
        probabilityConfidence: conjunction.collisionProbabilityConfidence,
        riskLevel: conjunction.riskLevel
      },
      candidateManeuver: candidateManeuver ? {
        id: candidateManeuver.id,
        deltaVMps: candidateManeuver.deltaVMagnitudeMps,
        direction: candidateManeuver.burnDirection,
        propellantKg: candidateManeuver.estimatedPropellantKg,
        burnDurationSeconds: candidateManeuver.burnDurationSeconds
      } : null
    }, null, 2);

    return { systemPrompt, userPrompt };
  }

  /**
   * Deterministic Rule-Based Fallback Engine
   * Implements predictable astrodynamics rules based on documented risk thresholds:
   * - Critical Miss Distance threshold: 0.5 km (500m)
   * - Critical Collision Probability threshold: 1.0e-4
   * - Explains supporting evidence.
   * - Explicitly detects missing or stale data.
   * - NEVER invents collision probability.
   * - Avoids recommending a specific burn when candidate maneuver inputs are unavailable.
   * - Recommends operator review before a maneuver is approved.
   */
  generateDeterministicFallback(
    inputs: FlightDirectorInputs, 
    fallbackReason?: string
  ): FlightDirectorOutputContract {
    const { satellite, conjunction, candidateManeuver, workflowStage } = inputs;
    const critMissThresholdKm = inputs.systemSettings?.criticalMissDistanceThresholdKm ?? 0.5;
    const critPcThreshold = inputs.systemSettings?.criticalCollisionProbabilityThreshold ?? 0.0001;

    const missTotalMeters = Math.round(conjunction.missDistanceKm.total * 1000);
    const inTrackMeters = Math.round(conjunction.missDistanceKm.inTrack * 1000);
    const radialMeters = Math.round(conjunction.missDistanceKm.radial * 1000);
    const crossTrackMeters = Math.round(conjunction.missDistanceKm.crossTrack * 1000);
    const hoursToTca = (conjunction.timeToTcaSeconds / 3600).toFixed(1);

    const isStale = satellite.orbitDataStatus === 'STALE' || 
      (satellite.lastContact ? (Date.now() - new Date(satellite.lastContact).getTime() > 24 * 3600 * 1000) : false);

    const hasPc = conjunction.collisionProbability !== null && 
      !isNaN(conjunction.collisionProbability) &&
      conjunction.collisionProbabilityConfidence !== 'INSUFFICIENT_COVARIANCE';

    // 1. Severity Classification
    let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (conjunction.status === 'CLEARED' || workflowStage === 'CLEAR') {
      severity = 'INFO';
    } else if (
      conjunction.missDistanceKm.total < critMissThresholdKm || 
      (hasPc && conjunction.collisionProbability! >= critPcThreshold)
    ) {
      severity = 'CRITICAL';
    } else if (
      conjunction.missDistanceKm.total < (critMissThresholdKm * 4) || 
      (hasPc && conjunction.collisionProbability! >= 1e-6)
    ) {
      severity = 'WARNING';
    }

    // 2. Evidence Gathering
    const evidence: string[] = [];

    evidence.push(
      `Primary satellite ${satellite.name} (${satellite.id}) orbital altitude is ${satellite.orbit.altitudeKm.toFixed(1)} km LEO with propulsion subsystem status ${satellite.subsystems.propulsion}.`
    );

    evidence.push(
      `Conjunction ${conjunction.code} against ${conjunction.secondaryObjectName} predicts closest approach in ${hoursToTca} hours with total Euclidean separation of ${missTotalMeters} meters (Radial: ${radialMeters >= 0 ? '+' : ''}${radialMeters}m, In-Track: ${inTrackMeters >= 0 ? '+' : ''}${inTrackMeters}m, Cross-Track: ${crossTrackMeters >= 0 ? '+' : ''}${crossTrackMeters}m).`
    );

    if (hasPc) {
      evidence.push(
        `Collision probability Pc is ${conjunction.collisionProbability!.toExponential(2)} (Confidence: ${conjunction.collisionProbabilityConfidence}), which ${conjunction.collisionProbability! >= critPcThreshold ? 'exceeds' : 'is below'} the critical threshold of ${critPcThreshold}.`
      );
    } else {
      evidence.push(
        `Collision probability (Pc) is UNCOMPUTED due to insufficient covariance matrix data; risk assessment is based strictly on Euclidean miss distance (${missTotalMeters} m vs ${critMissThresholdKm * 1000} m threshold).`
      );
    }

    if (isStale) {
      evidence.push(
        `WARNING: Telemetry for ${satellite.name} is stale (>24h since ground station contact). Covariance error ellipsoid is expanding.`
      );
    }

    if (candidateManeuver) {
      evidence.push(
        `Candidate avoidance maneuver ${candidateManeuver.id} is staged: ΔV = ${candidateManeuver.deltaVMagnitudeMps.toFixed(2)} m/s (${candidateManeuver.burnDirection}), requiring ${candidateManeuver.estimatedPropellantKg.toFixed(3)} kg hydrazine (${((candidateManeuver.estimatedPropellantKg / satellite.remainingFuelKg) * 100).toFixed(1)}% of remaining reserve).`
      );
    }

    // 3. Recommendation Formulation
    let recommendation = '';

    if (conjunction.status === 'CLEARED' || workflowStage === 'CLEAR') {
      recommendation = `Encounter officially cleared. Continue routine orbit surveillance and maintain ground station contact schedule.`;
    } else if (candidateManeuver && candidateManeuver.deltaVMagnitudeMps > 0) {
      recommendation = `Operator review required: Verify candidate maneuver ${candidateManeuver.id} (ΔV = ${candidateManeuver.deltaVMagnitudeMps.toFixed(2)} m/s) in Flight Director Gate 5. Operator sign-off is required before simulated burn sequence execution.`;
    } else if (severity === 'CRITICAL' || severity === 'WARNING') {
      recommendation = `Operator review required: Stage a candidate collision avoidance maneuver (CAM) in the Maneuver Planner workspace. Specific burn magnitude and vector must be computed and verified before authorization.`;
    } else {
      recommendation = `Monitor conjunction trajectory. Miss distance exceeds critical safety threshold; re-screen upon next ephemeris update.`;
    }

    // 4. Assumptions & Known Limitations
    const assumptions: string[] = [];

    if (fallbackReason) {
      assumptions.push(`[DETERMINISTIC FALLBACK ENGINE]: ${fallbackReason}`);
    }

    if (!hasPc) {
      assumptions.push('Collision probability (Pc) is unavailable: Covariance matrix inadequate for 2D Foster/Akella integration.');
    }

    if (isStale) {
      assumptions.push('Satellite state vector requires fresh tracking pass before final burn command generation.');
    }

    assumptions.push('Ignored orbital perturbations: Earth geopotential harmonics (J2-J4), atmospheric drag variability, and solar radiation pressure.');
    assumptions.push('Impulsive burn approximation: Finite-burn cosine canting and thruster tail transients are excluded from baseline projection.');
    assumptions.push('Safety boundary notice: Flight Director outputs are advisory decision support for simulated workflows; real spacecraft telecommands are strictly prohibited.');

    // 5. Summary Generation
    let summary = '';
    if (severity === 'CRITICAL') {
      summary = `CRITICAL ENCOUNTER: ${satellite.name} vs ${conjunction.secondaryObjectName} with miss distance of ${missTotalMeters}m (below ${critMissThresholdKm * 1000}m threshold) in T-${hoursToTca}h. ${candidateManeuver ? 'Candidate maneuver staged awaiting operator sign-off.' : 'Immediate maneuver planning required.'}`;
    } else if (severity === 'WARNING') {
      summary = `ADVISORY WARNING: Conjunction ${conjunction.code} miss distance is ${missTotalMeters}m in T-${hoursToTca}h. Monitor screening or evaluate avoidance maneuver.`;
    } else {
      summary = `NOMINAL CLEARANCE: Separation of ${missTotalMeters}m meets mission flight rules. No maneuver intervention required at current epoch.`;
    }

    return {
      summary,
      severity,
      evidence,
      recommendation,
      assumptions,
      source: 'deterministic_fallback',
      requires_operator_review: true
    };
  }
}
