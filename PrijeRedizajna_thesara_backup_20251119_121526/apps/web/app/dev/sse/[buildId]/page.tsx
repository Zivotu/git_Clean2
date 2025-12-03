import SSEViewerClient from './SSEViewerClient';

export default async function SSEViewerPage(
    { params }: { params: Promise<{ buildId: string }> }
) {
    const { buildId } = await params;
    return <SSEViewerClient buildId={buildId} />;
}
