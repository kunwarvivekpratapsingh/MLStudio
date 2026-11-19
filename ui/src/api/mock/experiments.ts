import type { Experiment } from '../types';

export function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Idea {
  family: string;
  change: string;
  hypothesis: string;
  params: Experiment['params'];
}

/** The Researcher's idea bank. Order matters for the first runs. */
const OPENING: Idea[] = [
  { family: 'Logistic regression', change: 'Baseline on starter features', hypothesis: 'Establish a simple, explainable baseline before trying anything complex.', params: { C: 1.0, class_weight: 'balanced' } },
  { family: 'LightGBM', change: 'Gradient boosting with default parameters', hypothesis: 'Interactions between velocity and merchant features are non-linear; trees should capture them.', params: { num_leaves: 31, learning_rate: 0.05, n_estimators: 800 } },
  { family: 'LightGBM', change: 'Add features from H1', hypothesis: 'H1 had the highest information value in the catalog, so it should give the largest single gain.', params: { num_leaves: 31, features: '+H1' } },
];

const IDEAS: Idea[] = [
  { family: 'LightGBM', change: 'num_leaves 31 → 127, min_child_samples 200', hypothesis: 'The model is underfitting rare fraud patterns; more leaves with a high minimum child size should help without overfitting.', params: { num_leaves: 127, min_child_samples: 200 } },
  { family: 'LightGBM', change: 'Focal loss, γ = 2', hypothesis: 'With heavy class imbalance, focal loss should focus training on hard positives.', params: { objective: 'focal', gamma: 2 } },
  { family: 'LightGBM', change: 'Add features from H2', hypothesis: 'Authentication signals are orthogonal to velocity, so they should add lift on cases velocity misses.', params: { features: '+H2' } },
  { family: 'LightGBM', change: 'Add features from H3', hypothesis: 'Merchant-level risk is not yet represented; adding it should help on first-time merchants.', params: { features: '+H3' } },
  { family: 'LightGBM', change: 'Monotonic constraint on amount features', hypothesis: 'Constraining amount effects should improve stability and explanations at little cost.', params: { monotone_constraints: 'amount:+1' } },
  { family: 'LightGBM', change: 'Drop features with PSI above 0.2', hypothesis: 'Unstable features may help validation but hurt out-of-time; dropping them should help OOT.', params: { psi_max: 0.2 } },
  { family: 'LightGBM', change: 'learning_rate 0.05 → 0.02, n_estimators 2,000', hypothesis: 'A slower learning rate with more trees often gives a small, reliable gain.', params: { learning_rate: 0.02, n_estimators: 2000 } },
  { family: 'CatBoost', change: 'CatBoost with ordered boosting', hypothesis: 'Ordered boosting handles high-cardinality categoricals such as MCC better than one-hot encoding.', params: { depth: 8, iterations: 2000, boosting_type: 'Ordered' } },
  { family: 'XGBoost', change: 'XGBoost hist, max_depth 8', hypothesis: 'A different boosting implementation may find different splits; cheap to check.', params: { max_depth: 8, tree_method: 'hist' } },
  { family: 'TabTransformer', change: 'TabTransformer, 4 layers, 32-dim embeddings', hypothesis: 'Attention over categorical embeddings may capture merchant and MCC interactions trees miss.', params: { layers: 4, embed_dim: 32, epochs: 20 } },
  { family: 'MLP', change: 'MLP 3 × 256 with batch norm', hypothesis: 'A neural baseline helps judge whether deep models are worth more budget.', params: { hidden: '256,256,256', dropout: 0.2 } },
  { family: 'LightGBM', change: 'SMOTE oversampling of positives', hypothesis: 'Synthetic positives may help the model see more of the minority class.', params: { sampler: 'SMOTE', ratio: 0.05 } },
  { family: 'LightGBM', change: 'Ablation: remove H4 features', hypothesis: 'Check whether H4 features earn their latency cost.', params: { features: '-H4' } },
  { family: 'LightGBM', change: 'feature_fraction 0.6, bagging_fraction 0.7', hypothesis: 'More randomness should reduce variance between months.', params: { feature_fraction: 0.6, bagging_fraction: 0.7 } },
  { family: 'Ensemble', change: 'Rank-average of the best LightGBM and CatBoost', hypothesis: 'The two best models make different errors; averaging ranks should beat either alone.', params: { members: 'lgbm-best,catboost-best', method: 'rank_average' } },
  { family: 'Ensemble', change: 'Isotonic calibration and threshold tuned on validation', hypothesis: 'Better calibration should move the operating point closer to the target rate.', params: { calibration: 'isotonic' } },
  { family: 'LightGBM', change: 'Label window 60 days instead of 90', hypothesis: 'A shorter label window may reduce noise from late reports.', params: { label_window_days: 60 } },
  { family: 'Ensemble', change: 'Stack with a logistic meta-learner', hypothesis: 'A learned blend may beat a simple rank average.', params: { meta: 'logistic' } },
  { family: 'LightGBM', change: 'Dart boosting, drop_rate 0.1', hypothesis: 'Dart can reduce over-specialisation of late trees.', params: { boosting: 'dart', drop_rate: 0.1 } },
  { family: 'CatBoost', change: 'CatBoost depth 10', hypothesis: 'Deeper trees might capture three-way interactions.', params: { depth: 10 } },
];

export interface ExpConfig {
  projectId: string;
  baseline: number;
  ceiling: number;
  featureCount: number;
}

/** Produces the next experiment the Researcher would run, given history. */
export function nextExperiment(cfg: ExpConfig, history: Experiment[], rand: () => number, now: Date): Experiment {
  const i = history.length + 1;
  const best = history.reduce((b, e) => (e.outcome === 'kept' && e.metrics ? Math.max(b, e.metrics.primary) : b), 0);
  const idea = i <= OPENING.length ? OPENING[i - 1] : IDEAS[Math.floor(rand() * IDEAS.length)];
  let primary: number;
  let kept: boolean;
  if (i === 1) {
    primary = cfg.baseline;
    kept = true;
  } else {
    const headroom = cfg.ceiling - best;
    const pGain = i <= 3 ? 1 : Math.max(0.08, 0.42 * Math.exp(-i / 30));
    if (rand() < pGain && headroom > 0.15) {
      primary = best + headroom * (0.12 + rand() * 0.28);
      kept = true;
    } else {
      primary = best - (0.2 + rand() * 3.2);
      kept = false;
    }
  }
  primary = Math.round(primary * 10) / 10;
  const delta = i === 1 ? 0 : Math.round((primary - best) * 10) / 10;
  const gpu = Math.round((0.3 + rand() * 0.9) * 10) / 10;
  const started = new Date(now.getTime() - gpu * 3600_000 * 0.15);
  const parent = history.filter((e) => e.outcome === 'kept').slice(-1)[0];
  return {
    id: `${cfg.projectId}-exp-${String(i).padStart(3, '0')}`,
    index: i,
    hypothesis: idea.hypothesis,
    change: idea.change,
    parentId: parent?.id,
    modelFamily: idea.family,
    params: idea.params,
    featureCount: cfg.featureCount,
    status: 'completed',
    metrics: {
      primary,
      aucPr: Math.round((0.18 + (primary / 100) * 0.62) * 1000) / 1000,
      precisionAtThreshold: Math.round((primary * 0.42 + rand() * 4) * 10) / 10,
      latencyP99Ms: idea.family === 'Ensemble' ? 18 + Math.round(rand() * 6) : idea.family === 'TabTransformer' ? 34 + Math.round(rand() * 10) : 7 + Math.round(rand() * 6),
    },
    delta,
    outcome: kept ? 'kept' : 'discarded',
    conclusion: kept
      ? i === 1
        ? `Baseline set at ${primary}.`
        : `Improved by ${delta.toFixed(1)} points. Keeping this as the new parent.`
      : `Worse by ${Math.abs(delta).toFixed(1)} points. Discarding and noting that “${idea.change.toLowerCase()}” does not help here.`,
    gpuHours: gpu,
    startedAt: started.toISOString(),
    finishedAt: now.toISOString(),
  };
}
