// Les 26 cantons suisses, dans l'ordre officiel de l'OFS.
export interface Canton {
  sigle: string
  fr: string
  en: string
}

export const CANTONS: Canton[] = [
  { sigle: 'ZH', fr: 'Zurich', en: 'Zurich' },
  { sigle: 'BE', fr: 'Berne', en: 'Bern' },
  { sigle: 'LU', fr: 'Lucerne', en: 'Lucerne' },
  { sigle: 'UR', fr: 'Uri', en: 'Uri' },
  { sigle: 'SZ', fr: 'Schwyz', en: 'Schwyz' },
  { sigle: 'OW', fr: 'Obwald', en: 'Obwalden' },
  { sigle: 'NW', fr: 'Nidwald', en: 'Nidwalden' },
  { sigle: 'GL', fr: 'Glaris', en: 'Glarus' },
  { sigle: 'ZG', fr: 'Zoug', en: 'Zug' },
  { sigle: 'FR', fr: 'Fribourg', en: 'Fribourg' },
  { sigle: 'SO', fr: 'Soleure', en: 'Solothurn' },
  { sigle: 'BS', fr: 'Bâle-Ville', en: 'Basel-Stadt' },
  { sigle: 'BL', fr: 'Bâle-Campagne', en: 'Basel-Landschaft' },
  { sigle: 'SH', fr: 'Schaffhouse', en: 'Schaffhausen' },
  { sigle: 'AR', fr: 'Appenzell Rhodes-Extérieures', en: 'Appenzell Ausserrhoden' },
  { sigle: 'AI', fr: 'Appenzell Rhodes-Intérieures', en: 'Appenzell Innerrhoden' },
  { sigle: 'SG', fr: 'Saint-Gall', en: 'St. Gallen' },
  { sigle: 'GR', fr: 'Grisons', en: 'Graubünden' },
  { sigle: 'AG', fr: 'Argovie', en: 'Aargau' },
  { sigle: 'TG', fr: 'Thurgovie', en: 'Thurgau' },
  { sigle: 'TI', fr: 'Tessin', en: 'Ticino' },
  { sigle: 'VD', fr: 'Vaud', en: 'Vaud' },
  { sigle: 'VS', fr: 'Valais', en: 'Valais' },
  { sigle: 'NE', fr: 'Neuchâtel', en: 'Neuchâtel' },
  { sigle: 'GE', fr: 'Genève', en: 'Geneva' },
  { sigle: 'JU', fr: 'Jura', en: 'Jura' },
]

export function nomCanton(sigle: string, lang: 'fr' | 'en'): string {
  const c = CANTONS.find((x) => x.sigle === sigle)
  return c ? c[lang] : sigle
}
