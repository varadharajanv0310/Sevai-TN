import { useMemo } from 'react';
import { getEligibleSchemes, totalBenefitValue } from '../utils/eligibilityEngine.js';
import { SCHEMES } from '../data/schemes.js';

/**
 * Runs the full eligibility pipeline on every vault change.
 * No API call — pure computation over the local schemes dataset.
 *
 * Returns:
 *   confirmed      — [{scheme, score}] sorted by score desc
 *   fuzzy          — [{scheme, fuzzy, score}] near-miss matches (max 5)
 *   totalEstimatedValue — sum of confirmed benefit_amounts (null → ₹50k default)
 *   topCategory    — most common category string in confirmed
 *   totalCount     — shorthand for confirmed.length
 *   eligible       — alias for confirmed (legacy compat, App.jsx / WowReveal)
 *   close_matches  — alias for fuzzy (legacy compat, old Feed renders)
 *   totalValue     — alias for totalEstimatedValue (legacy compat)
 */
export const useEligibility = (vault) => {
  return useMemo(() => {
    if (!vault) {
      return {
        confirmed: [], fuzzy: [], totalEstimatedValue: 0, topCategory: 'farming',
        eligible: [], close_matches: [], totalCount: 0, totalValue: 0,
      };
    }

    const { confirmed, fuzzy, totalEstimatedValue, topCategory } =
      getEligibleSchemes(SCHEMES, vault);

    return {
      // New Task-3 API
      confirmed,
      fuzzy,
      totalEstimatedValue,
      topCategory,
      totalCount: confirmed.length,
      // Legacy aliases kept for App.jsx → WowReveal and any other legacy callers
      eligible: confirmed,
      close_matches: fuzzy,
      totalValue: totalEstimatedValue,
    };
  }, [vault]);
};
