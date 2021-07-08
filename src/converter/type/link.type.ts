import {OPDSLink} from '@r2-opds-js/opds/opds2/opds2-link';
import {OPDSProperties} from '@r2-opds-js/opds/opds2/opds2-properties';

export type TProperties = Partial<OPDSProperties>;
type TLink = Omit<OPDSLink, 'Properties'>;
export type TLinkMayBeOpds = TLink & {
  Properties: TProperties;
};
