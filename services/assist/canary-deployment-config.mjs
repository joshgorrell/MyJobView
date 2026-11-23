const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const validPort = port => Number.isInteger(port) && port >= 1024 && port <= 65535;

export function readCanaryDeploymentConfig(env) {
  const automaticCanary = env.ASSIST_CANARY_AUTOMATIC_DEALERS === '1';
  const pilotId = env.ASSIST_PILOT_ORGANIZATION_ID || undefined;
  const isolationId = env.ASSIST_CANARY_ISOLATION_ORGANIZATION_ID || undefined;
  const fixtureToken = env.ASSIST_CANARY_FIXTURE_TOKEN || undefined;
  const controlPort = Number(env.ASSIST_CONTROL_PORT || 8443);
  const pilotPort = Number(env.ASSIST_PILOT_LOOPBACK_PORT || 0);
  const usesPilot = automaticCanary || pilotId || env.ASSIST_PILOT_LOOPBACK_PORT;

  if (automaticCanary && (pilotId || !fixtureToken || !isolationId)) {
    throw new Error('invalid_automatic_canary_configuration');
  }
  if (!validPort(controlPort) || (usesPilot && (!validPort(pilotPort) || pilotPort === controlPort ||
      (!automaticCanary && !uuid.test(pilotId))))) {
    throw new Error('invalid_canary_listener');
  }
  if (fixtureToken && (!usesPilot || fixtureToken.length < 32 ||
      [env.ASSIST_CANARY_TOKEN, env.ASSIST_CONTROL_TOKEN].includes(fixtureToken))) {
    throw new Error('invalid_canary_fixture_configuration');
  }
  if (isolationId && (!fixtureToken || !uuid.test(isolationId) || isolationId === pilotId)) {
    throw new Error('invalid_canary_isolation_organization');
  }
  return { automaticCanary, pilotId, isolationId, fixtureToken, controlPort, pilotPort };
}
