// Copied from App/src/domain/helplines.ts. Helpline numbers shown on the Emergency page.
// Each was checked against an official source on
// 2026-10-24 (App/log.md APP-023). Leave a number empty rather than guess: the screen then shows
// "[number to confirm]". The backend's offline pack still has these blank; if it ever sends a number for
// the same line, that number is shown instead.

export interface Helpline {
  /** Matches the backend's contact name */
  match: RegExp;
  name: string;
  use: string;
  number: string;
  /** Second number, e.g. a landline */
  alt?: string;
  source: string;
}

export const HELPLINES_CHECKED = '24 Oct 2026';

export const HELPLINES: Helpline[] = [
  {
    match: /sdma|disaster management|state emergency/i,
    name: 'SDMA Uttarakhand control room',
    use: 'Landslides, floods, rescue',
    number: '1070',
    alt: '0135-2710334',
    source: 'usdma.uk.gov.in',
  },
  {
    match: /district/i,
    name: 'District disaster control room',
    use: 'Road blocked, road status, local rescue',
    number: '1077',
    source: 'usdma.uk.gov.in',
  },
  {
    match: /highway|police|nhai/i,
    name: 'National Highway helpline',
    use: 'Accidents, crane, help on the highway',
    number: '1033',
    source: 'NHAI / MoRTH',
  },
  {
    match: /ambulance|medical/i,
    name: 'Ambulance',
    use: 'Medical emergency, free',
    number: '108',
    source: 'nhm.uk.gov.in',
  },
  // The app's BRO control room line (no verified number) is left out of the website (log.md WEB-006)
];
