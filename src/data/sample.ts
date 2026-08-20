import type { Tree } from '../types'
import { parseGedcom } from '../gedcom'

const HUGO_GEDCOM = `
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Victor /Hugo/
1 SEX M
1 BIRT
2 DATE 26 février 1802
2 PLAC Besançon
1 DEAT
2 DATE 22 mai 1885
2 PLAC Paris
1 FAMC @F1@
1 FAMS @F4@
1 NOTE Poète, romancier et dramaturge. Auteur des Misérables et de Notre-Dame de Paris.
0 @I2@ INDI
1 NAME Joseph Léopold Sigisbert /Hugo/
1 SEX M
1 BIRT
2 DATE 15 novembre 1773
2 PLAC Nancy
1 DEAT
2 DATE 29 janvier 1828
2 PLAC Paris
1 FAMC @F2@
1 FAMS @F1@
1 NOTE Général d'Empire.
0 @I3@ INDI
1 NAME Sophie /Trébuchet/
1 SEX F
1 BIRT
2 DATE 19 juin 1772
2 PLAC Nantes
1 DEAT
2 DATE 27 juin 1821
2 PLAC Paris
1 FAMC @F3@
1 FAMS @F1@
0 @I4@ INDI
1 NAME Joseph /Hugo/
1 SEX M
1 BIRT
2 DATE 1727
2 PLAC Baudricourt
1 DEAT
2 DATE 1799
1 FAMS @F2@
1 NOTE Menuisier à Nancy.
0 @I5@ INDI
1 NAME Jeanne Marguerite /Michaud/
1 SEX F
1 BIRT
2 DATE 1735
1 DEAT
2 DATE 1787
1 FAMS @F2@
0 @I6@ INDI
1 NAME Jean-François /Trébuchet/
1 SEX M
1 BIRT
2 DATE 1731
2 PLAC Nantes
1 DEAT
2 DATE 1783
2 PLAC en mer
1 FAMS @F3@
1 NOTE Capitaine de navire.
0 @I7@ INDI
1 NAME Renée Louise /Le Normand/
1 SEX F
1 BIRT
2 DATE 1738
1 DEAT
2 DATE 1780
2 PLAC Nantes
1 FAMS @F3@
0 @I8@ INDI
1 NAME Adèle /Foucher/
1 SEX F
1 BIRT
2 DATE 27 septembre 1803
2 PLAC Paris
1 DEAT
2 DATE 27 août 1868
2 PLAC Bruxelles
1 FAMS @F4@
0 @I9@ INDI
1 NAME Léopoldine /Hugo/
1 SEX F
1 BIRT
2 DATE 28 août 1824
2 PLAC Paris
1 DEAT
2 DATE 4 septembre 1843
2 PLAC Villequier
1 FAMC @F4@
1 NOTE Morte noyée dans la Seine avec son mari Charles Vacquerie.
0 @I10@ INDI
1 NAME Charles /Hugo/
1 SEX M
1 BIRT
2 DATE 4 novembre 1826
2 PLAC Paris
1 DEAT
2 DATE 13 mars 1871
2 PLAC Bordeaux
1 FAMC @F4@
0 @I11@ INDI
1 NAME François-Victor /Hugo/
1 SEX M
1 BIRT
2 DATE 28 octobre 1828
2 PLAC Paris
1 DEAT
2 DATE 26 décembre 1873
2 PLAC Paris
1 FAMC @F4@
1 NOTE Traducteur de l'œuvre de Shakespeare.
0 @I12@ INDI
1 NAME Adèle /Hugo/
1 SEX F
1 BIRT
2 DATE 24 août 1830
2 PLAC Paris
1 DEAT
2 DATE 21 avril 1915
2 PLAC Suresnes
1 FAMC @F4@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 15 novembre 1797
2 PLAC Paris
0 @F2@ FAM
1 HUSB @I4@
1 WIFE @I5@
1 CHIL @I2@
0 @F3@ FAM
1 HUSB @I6@
1 WIFE @I7@
1 CHIL @I3@
0 @F4@ FAM
1 HUSB @I1@
1 WIFE @I8@
1 CHIL @I9@
1 CHIL @I10@
1 CHIL @I11@
1 CHIL @I12@
1 MARR
2 DATE 12 octobre 1822
2 PLAC Paris
0 TRLR
`

export function sampleTree(): Tree {
  return parseGedcom(HUGO_GEDCOM)
}

export const SAMPLE_FOCAL_ID = '@I1@'
