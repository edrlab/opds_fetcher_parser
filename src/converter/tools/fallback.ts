export const fallback = <T>(...valueArray: T[][]) =>
  valueArray.reduce((pv, cv) => (Array.isArray(cv) && cv.length ? cv : pv), []);
