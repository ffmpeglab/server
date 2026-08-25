export const processUserCode = (
  cmdString: string | null | undefined,
): string[] => {
  // 1. Return an empty array immediately if input is missing, empty, or only whitespace
  if (!cmdString || !cmdString?.trim || typeof cmdString !== 'string') {
    return [];
  }

  const segments = cmdString.trim().split(/[\r\n\s]+(?=-[a-zA-Z0-9.:]+)/);
  const finalArray: string[] = [];

  for (const segment of segments) {
    const trimmedSegment = segment.trim();

    // Skip empty segments if they occur during splitting
    if (!trimmedSegment) continue;

    const match = trimmedSegment.match(
      /^(-[a-zA-Z0-9.:]+)([\r\n\s]+)([\s\S]*)$/,
    );

    if (match) {
      const flag = match[1];
      const value = match[3].trim();

      finalArray.push(flag);
      if (value) {
        finalArray.push(value);
      }
    } else {
      finalArray.push(trimmedSegment);
    }
  }
  return finalArray;
};
