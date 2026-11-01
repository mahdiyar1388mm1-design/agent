'use strict';

const { URL } = require('node:url');

function status() {
  const endpoint = process.env.AIHOLDING_AGENT_ENDPOINT || '';
  const token = process.env.AIHOLDING_AGENT_TOKEN || '';
  let safeEndpoint = false;
  try {
    const url = new URL(endpoint);
    safeEndpoint = url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch {
    safeEndpoint = false;
  }
  const configured = Boolean(endpoint && token && safeEndpoint);
  return {
    configured,
    provider: configured ? (process.env.AIHOLDING_AGENT_PROVIDER || 'Configured agent gateway') : 'Not configured',
    endpointConfigured: Boolean(endpoint),
  };
}

async function dispatch(workflow) {
  const endpoint = process.env.AIHOLDING_AGENT_ENDPOINT || '';
  const token = process.env.AIHOLDING_AGENT_TOKEN || '';
  const readiness = status();
  if (!readiness.configured) {
    const error = new Error('AI agent integration is not configured. Set AIHOLDING_AGENT_ENDPOINT and AIHOLDING_AGENT_TOKEN on the server.');
    error.code = 'PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const base = new URL(endpoint);
  const url = new URL('/v1/workflows', base);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ protocol: 'a2a-compatible', workflow }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Agent gateway returned HTTP ${response.status}.`);
    error.code = 'PROVIDER_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  if (!payload || typeof payload !== 'object' || typeof payload.run_id !== 'string') {
    const error = new Error('Agent gateway response did not include a valid run_id.');
    error.code = 'PROVIDER_RESPONSE_INVALID';
    throw error;
  }
  return {
    runId: payload.run_id,
    status: ['Processing', 'Waiting for Approval', 'Completed'].includes(payload.status) ? payload.status : 'Processing',
    result: typeof payload.result === 'string' ? payload.result.slice(0, 8000) : undefined,
  };
}

module.exports = { status, dispatch };
