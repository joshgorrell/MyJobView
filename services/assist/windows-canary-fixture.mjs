import { dealerDomain } from './control-core.mjs';

/**
 * Gives a Windows verifier a short-lived guest target on the real pilot runtime.
 * Only the running probe can retrieve its own fixture. No dealer credentials are used.
 */
export function createWindowsCanaryFixture({ runtime, organizationId, probe }) {
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  if (!uuid.test(organizationId)) throw new Error('invalid_canary_fixture_organization');
  const domain = dealerDomain(organizationId);
  let active;

  function match(request) {
    const fixture = active;
    const expected = fixture?.request;
    if (!expected || fixture.closed || fixture.invalid || request?.organization_id !== organizationId ||
        request.generation !== expected.generation || request.probe_nonce !== expected.probe_nonce) {
      throw new Error('canary_fixture_unavailable');
    }
    return fixture;
  }

  return {
    async probe(request) {
      // Existing verifier implementations can continue handling other dealer runtimes.
      if (request.organization_id !== organizationId) return probe(request);
      if (active || request.mesh_domain !== domain || !uuid.test(request.probe_nonce)) {
        throw new Error('canary_fixture_in_use');
      }
      const suffix = request.probe_nonce.replaceAll('-', '');
      const fixture = { request, username: 'mjv-session-' + suffix };
      active = fixture;
      try {
        fixture.group = await runtime.createGuestGroup(organizationId, suffix);
        const evidence = await probe(request);
        if (!fixture.nodeId || fixture.invalid) throw new Error('canary_fixture_not_exercised');
        const online = (await runtime.inventory(organizationId, fixture.group.meshId)).filter(device => device.online);
        if (online.length !== 1 || online[0].id !== fixture.nodeId) throw new Error('canary_fixture_device_changed');
        return evidence;
      } finally {
        fixture.closed = true;
        try {
          await fixture.pending?.catch(() => {});
          try {
            if (fixture.viewerAttempted) await runtime.revokeViewer(organizationId, fixture.username);
          } finally {
            if (fixture.group) await runtime.deleteGuestGroup(organizationId, fixture.group.meshId);
          }
        } finally { active = undefined; }
      }
    },

    async handle(request) {
      const fixture = match(request);
      if (!fixture.group) throw new Error('canary_fixture_unavailable');
      if (request.operation === 'download') return { download_url: fixture.group.download_url };
      if (request.operation !== 'viewer') throw new Error('invalid_canary_fixture_operation');
      if (!fixture.pending) {
        fixture.pending = (async () => {
          const online = (await runtime.inventory(organizationId, fixture.group.meshId)).filter(device => device.online);
          if (online.length > 1) {
            fixture.invalid = true;
            throw new Error('canary_fixture_ambiguous');
          }
          if (!online.length) return { status: 'waiting' };
          if (fixture.closed || fixture.invalid) throw new Error('canary_fixture_unavailable');
          fixture.viewerAttempted = true;
          const result = await runtime.createViewer(organizationId, online[0].id, fixture.username, fixture.group.meshId);
          if (fixture.closed) throw new Error('canary_fixture_unavailable');
          fixture.nodeId = online[0].id;
          return { status: 'ready', ...result };
        })();
      }
      const pending = fixture.pending;
      try {
        const result = await pending;
        if (fixture.closed) throw new Error('canary_fixture_unavailable');
        if (result.status === 'waiting' && fixture.pending === pending) fixture.pending = undefined;
        return result;
      } catch (error) {
        // A viewer that failed to create is not retried under a live probe.
        fixture.invalid = true;
        throw error;
      }
    },
  };
}
