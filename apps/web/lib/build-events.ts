import { getApiBase } from './apiBase';

export function buildEventsUrl(buildId: string): string {
    // Always target the API base (absolute or relative), then hit the singular /build/:id/events SSE endpoint.
    // This avoids mistakenly using the apps host for SSE and works with Next rewrites in dev/prod.
    const apiBase = getApiBase().replace(/\/$/, '');
    return `${apiBase}/build/${encodeURIComponent(buildId)}/events`;
}
