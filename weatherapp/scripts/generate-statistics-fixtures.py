"""Generate independent statistical reference values using SciPy and statsmodels.

Run from weatherapp with: python scripts/generate-statistics-fixtures.py
"""
import json
import math
from pathlib import Path

import numpy as np
import scipy
import scipy.stats as stats
import statsmodels.api as sm


A = [1.2, 2.0, 2.5, 3.1, 4.0, 4.4, 5.0, 6.0, 7.0, 8.0]
B = [2.0, 2.6, 3.3, 4.1, 4.9, 5.7, 6.3, 7.1, 8.0, 9.4]
X = [20, 22, 25, 27, 30, 33, 35, 38, 40, 43]
Y = [12, 11, 17, 16, 20, 19, 24, 25, 27, 30]
PAIRED = [2.1, 3.2, 4.0, 4.8, 6.0, 7.1, 8.3, 9.0, 10.2, 11.4]
PAIRED_B = [1.7, 3.4, 3.1, 4.4, 5.0, 7.6, 7.0, 9.2, 9.9, 10.1]


def mulberry32(seed):
    state = seed & 0xFFFFFFFF

    def next_value():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        value = state
        value = ((value ^ (value >> 15)) * (value | 1)) & 0xFFFFFFFF
        value ^= (value + (((value ^ (value >> 7)) * (value | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        value &= 0xFFFFFFFF
        return (value ^ (value >> 14)) / 4294967296

    return next_value


def bootstrap_difference_ci(a, b, seed=20261029, repetitions=2000):
    rng = mulberry32(seed)
    differences = []
    for _ in range(repetitions):
        sample_a = [a[math.floor(rng() * len(a))] for _ in a]
        sample_b = [b[math.floor(rng() * len(b))] for _ in b]
        differences.append(float(np.mean(sample_a) - np.mean(sample_b)))
    return np.quantile(differences, [0.025, 0.975], method="linear").tolist()


def main():
    model = sm.OLS(Y, sm.add_constant(X)).fit()
    d = np.asarray(A) - np.asarray(B)
    n = len(d)
    wilson_p = 7 / 20
    z = stats.norm.ppf(0.975)
    denominator = 1 + z**2 / 20
    center = (wilson_p + z**2 / 40) / denominator
    half = z * math.sqrt(wilson_p * (1-wilson_p) / 20 + z**2 / (4*20**2)) / denominator
    fixture = {
        "provenance": {"scipy": scipy.__version__, "statsmodels": sm.__version__, "seed": 20261029},
        "pearson": {"r": stats.pearsonr(X, Y).statistic, "pValue": stats.pearsonr(X, Y).pvalue},
        "spearman": {"rho": stats.spearmanr(X, Y).statistic, "pValue": stats.spearmanr(X, Y).pvalue},
        "linearRegression": {"intercept": model.params[0], "slope": model.params[1], "rSquared": model.rsquared, "slopeCi95": model.conf_int()[1].tolist()},
        "welchT": {"statistic": stats.ttest_ind(A, B, equal_var=False).statistic, "pValue": stats.ttest_ind(A, B, equal_var=False).pvalue},
        "mannWhitney": {"u": stats.mannwhitneyu(A, B, alternative="two-sided", method="asymptotic").statistic, "pValue": stats.mannwhitneyu(A, B, alternative="two-sided", method="asymptotic").pvalue},
        "kruskalWallis": {"h": stats.kruskal(A, B, X).statistic, "pValue": stats.kruskal(A, B, X).pvalue},
        "wilcoxon": {"statistic": stats.wilcoxon(PAIRED, PAIRED_B, method="approx").statistic, "pValue": stats.wilcoxon(PAIRED, PAIRED_B, method="approx").pvalue},
        "bootstrapDifference": {"meanDifference": float(np.mean(A)-np.mean(B)), "ci95": bootstrap_difference_ci(A, B)},
        "benjaminiHochberg": {"pValues": [0.001, 0.01, 0.04, 0.2], "adjusted": [0.004, 0.02, 0.05333333333333334, 0.2]},
        "wilson": {"successes": 7, "n": 20, "probability": wilson_p, "ci95": [center-half, center+half]},
    }
    target = Path(__file__).resolve().parents[1] / "lib" / "statistics-reference.json"
    target.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
