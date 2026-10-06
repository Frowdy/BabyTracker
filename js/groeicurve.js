/* =====================================================================
   GROEICURVE — gewicht naar leeftijd, meisjes, 0–4 jaar
   Nederlandse referentie: Vijfde Landelijke Groeistudie (TNO, 2009).
     Schönbeck Y, Talma H, van Dommelen P, Bakker B, Buitendijk SE,
     HiraSing RA, van Buuren S (2011). Increase in Prevalence of Overweight
     in Dutch Children and Adolescents: A Comparison of Nationwide Growth
     Studies in 1980, 1997 and 2009. PLoS ONE 6(11): e27608.
   LMS-waarden letterlijk overgenomen uit het R-package nlreferences
   (Stef van Buuren / TNO), bestand
     data-raw/data/nl2009/nl_2009_wgt_female_nl.txt
   https://github.com/growthcharts/nlreferences (commit d55094d).
   x = leeftijd in jaren; L = Box-Cox-macht, M = mediaan (kg), S = variatiecoëfficiënt.

   Rekenwijze zoals in het package centile van dezelfde auteurs: L, M en S
   lineair geïnterpoleerd tussen de leeftijdspunten, en buiten het bereik
   van de tabel (jonger dan 1 week, ouder dan 4 jaar) geen waarde.
   ===================================================================== */

export const BRON = 'TNO, Vijfde Landelijke Groeistudie 2009 (Schönbeck e.a., PLoS ONE 2011); '
  + 'LMS-waarden uit het R-package nlreferences (Van Buuren).';

// [x, L, M, S]
const LMS = [
  [0.0192, 1.1962, 3.6628, 0.1154],
  [0.0383, 1.1741, 3.8342, 0.1154],
  [0.0575, 1.1519, 4.0065, 0.1154],
  [0.0767, 1.1297, 4.1789, 0.1153],
  [0.0958, 1.1076, 4.3503, 0.1153],
  [0.115, 1.0854, 4.5224, 0.1153],
  [0.1342, 1.0632, 4.6936, 0.1155],
  [0.1533, 1.0412, 4.8625, 0.1152],
  [0.1725, 1.0191, 5.0303, 0.1152],
  [0.1916, 0.9972, 5.1949, 0.1153],
  [0.23, 0.9535, 5.5179, 0.1153],
  [0.2683, 0.9104, 5.8277, 0.1154],
  [0.3066, 0.8679, 6.1234, 0.1151],
  [0.345, 0.826, 6.404, 0.1153],
  [0.3833, 0.7851, 6.6676, 0.1153],
  [0.4216, 0.7452, 6.9162, 0.1155],
  [0.46, 0.7062, 7.1525, 0.1152],
  [0.4983, 0.6684, 7.376, 0.1151],
  [0.5366, 0.6317, 7.5878, 0.1153],
  [0.6133, 0.5617, 7.9784, 0.1157],
  [0.6899, 0.4965, 8.3264, 0.1157],
  [0.7666, 0.4358, 8.6387, 0.1158],
  [0.8433, 0.3795, 8.9207, 0.116],
  [0.9199, 0.3274, 9.1799, 0.1157],
  [0.9966, 0.2789, 9.4245, 0.1159],
  [1.0732, 0.2338, 9.6592, 0.1159],
  [1.1499, 0.1917, 9.8866, 0.1167],
  [1.2266, 0.1522, 10.1078, 0.1162],
  [1.5, 0.0286, 10.8514, 0.1172],
  [2, -0.1547, 12.1634, 0.118],
  [2.5, -0.31, 13.5095, 0.1202],
  [3, -0.4472, 14.917, 0.1223],
  [3.5, -0.5644, 16.1931, 0.1247],
  [4, -0.6638, 17.3114, 0.1281],
];

export const MIN_LEEFTIJD = LMS[0][0];
export const MAX_LEEFTIJD = LMS[LMS.length - 1][0];

// L, M en S op leeftijd x (jaren), lineair geïnterpoleerd; null buiten de tabel
function lmsOp(x){
  if(!(x >= MIN_LEEFTIJD && x <= MAX_LEEFTIJD)) return null;
  let i = 0;
  while(i < LMS.length - 2 && LMS[i+1][0] < x) i++;
  const [x0, L0, M0, S0] = LMS[i], [x1, L1, M1, S1] = LMS[i+1];
  const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  return { L:L0 + f * (L1 - L0), M:M0 + f * (M1 - M0), S:S0 + f * (S1 - S0) };
}

// SD-score van een gewicht (kg) op leeftijd x (jaren)
export function sdScore(x, kg){
  const r = lmsOp(x);
  if(!r || !(kg > 0)) return null;
  return Math.abs(r.L) < 1e-9
    ? Math.log(kg / r.M) / r.S
    : (Math.pow(kg / r.M, r.L) - 1) / (r.L * r.S);
}

// gewicht (kg) dat op leeftijd x (jaren) bij SD-score z hoort
export function gewichtBijSd(x, z){
  const r = lmsOp(x);
  if(!r) return null;
  return Math.abs(r.L) < 1e-9
    ? r.M * Math.exp(r.S * z)
    : r.M * Math.pow(1 + r.L * r.S * z, 1 / r.L);
}
