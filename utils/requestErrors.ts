export const isAbortLikeError = (error: unknown) => {
  const name = String((error as any)?.name || '').trim().toLowerCase();
  const text = String(
    (error as any)?.message
    || (error as any)?.details
    || (error as any)?.hint
    || ''
  ).toLowerCase();
  return name === 'aborterror'
    || text.includes('aborterror')
    || text.includes('signal is aborted')
    || text.includes('request was aborted');
};
