import {URL} from 'url';

export const urlPathResolve = (from: string, to: string) =>
  to && !/^https?:\/\//.exec(to) && !/^data:\/\//.exec(to)
    ? new URL(to, from).toString()
    : to;
