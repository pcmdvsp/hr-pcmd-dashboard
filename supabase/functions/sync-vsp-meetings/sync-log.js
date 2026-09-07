export const syncLogStatus = ({ matchedCount, successfulCount, failedCount }) => {
  if (matchedCount === 0) return 'no_matches';
  if (failedCount > 0 && successfulCount === 0) return 'failed';
  if (failedCount > 0) return 'partial';
  return 'success';
};
