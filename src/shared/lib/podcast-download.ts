export function buildPodcastDownloadUrl(params: {
  id?: string;
  audioUrl?: string;
  title?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.id) {
    searchParams.set('id', params.id);
  }

  if (params.audioUrl) {
    searchParams.set('audioUrl', params.audioUrl);
  }

  if (params.title) {
    searchParams.set('title', params.title);
  }

  return `/api/podcast/download?${searchParams.toString()}`;
}
