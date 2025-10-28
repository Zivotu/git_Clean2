export function buildEventsUrl(buildId: string): string {
    const appsHost = process.env.NEXT_PUBLIC_APPS_HOST?.replace(/\/$/, '');

    if (appsHost) {
        return `${appsHost}/build/${encodeURIComponent(buildId)}/events`;
    }

    return `/build/${encodeURIComponent(buildId)}/events`;
}
