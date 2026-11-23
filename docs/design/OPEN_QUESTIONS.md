# ML Studio design: open questions

These questions came up while writing the end-to-end, cloud-agnostic design for ML Studio
(HLD plus LLD for the key components). The team answered them on 24 Nov 2026. The answers
below are transcribed from photos of that review: sections 1 to 3 were fully readable, and
sections 4 to 8 were only partly readable (marked **partly read**).

## Original questions and working assumptions

| # | Topic | Question | Working assumption until answered |
|---|---|---|---|
| 1 | Data platform | Where does the VisaNet data the agents read actually live (Hive/Spark on Hadoop, Databricks, Snowflake, something else)? Is VFP the in-house feature platform, and does it have an API for submitting jobs, backfilling and registering features? | Data stays in the existing platform and is read via Spark/SQL. VFP has job submit, backfill and register APIs. |
| 2 | Auto feature generation today | Is it template based (entity x window x aggregation grids)? How is a feature defined and built today? | A deterministic template grammar over entities, windows, measures, aggregations and filters. |
| 3 | Training today | Which frameworks (XGBoost, LightGBM, PyTorch)? How are GPU jobs scheduled (Kubernetes, Slurm, YARN)? Is MLflow or another experiment tracker in use? | Tabular frameworks plus some PyTorch on a shared GPU pool; MLflow for tracking and registry. |
| 4 | Deployment today | Is there an existing model serving platform? Is the target real-time authorization scoring, and if so, what latency budget? | ML Studio deploys to dev/UAT only (KServe); production goes through the existing governance process. |
| 5 | LLM | Which providers are allowed (Anthropic API, Bedrock, Vertex, Azure, self-hosted)? Can sampled rows, even tokenized, be sent to the model, or only schemas and aggregates? | Hosted model through an enterprise LLM gateway with zero data retention; agents see schemas, aggregates and small tokenized samples only. |
| 6 | Compliance | Does PCI DSS scope apply? Any data residency rules? What model risk sign-off is needed before UAT or production? | PCI DSS applies to anything touching transaction data; decision records retained 7 years. |
| 7 | Scale | Roughly how many scientists and concurrent projects in year one? | About 50 scientists, 20 to 40 concurrent projects, a few hundred experiments a week. |
| 8 | Existing tooling | Which SSO and which logging/monitoring stack (Splunk, Datadog, Prometheus/Grafana, ELK)? Is hybrid an option, with data staying on-prem? | OIDC/SAML-compatible SSO; OpenTelemetry exported to whatever backend exists. |

## Answers (24 Nov 2026)

### 1. Data platform: data half holds, VFP API half is wrong

- Data lives on on-prem Hadoop (VDP 3.3.6). Hive tables are read by Spark on YARN with queue `ds`
  and `catalogImplementation=hive`. Jobs run with 100 to 1,000 executors.
- Core tables: `aucdl.tcaef_auth_dtl_full` (auth), `cscdl` (clearing), `opfrd.frd_tran_main_dedup`
  (fraud), `optd` (provisioning), `vctas` (3DS), `opcode.tedc_*` (reference).
- Trino is reachable through the MCP Hub, but any GROUP BY or count(*) on a fact table hits the
  300 s timeout, so Trino is usable for metadata only.
- Migration: VisaNet data is moving to the DPaaS AWS lake (Iceberg, Glue, Lake Formation), 40 to
  45 PB between May and Sep 2026. Whether that is finished is still an assumption. Lake Formation
  fine-grained access control can't share a Spark session with Unity Catalog.
- VFP is the Visa Feature Platform. Its window-aggregation engine is SWAT. The batch path is
  Hive, then SWAT on Spark/YARN, then Parquet. The real-time path is Kafka, then the SWAT Redis
  module. One YAML drives both paths.
- **VFP has no job API.** It is driven by a CLI plus Jenkins: `vfp submit --dry-run` and
  `vfp submit` for experiments. Promotion goes through the Jenkins job `vfp-new-lt-pipeline`,
  then Tuber, then an Airflow DAG. Entity registration is a manual platform step. No backfill API
  was found.

**Revised assumption:** read through Spark on YARN (Kerberos) and use Trino only for schema and
metadata. Put the catalog behind an adapter so DPaaS Iceberg can be added later. ML Studio wraps
the `vfp` CLI in a job runner that uses a keytab and the AD groups `caehadoop_VFP` and
`epiprod_vfp_ro`. Promotion and registration are handoffs to people.

**Still open (VFP team):** is a REST or gRPC API on the roadmap? Who approves entity registration?

### 2. Auto feature generation today: mostly right, but the system has two layers

- The grammar is real. 309 production `rtp_*` features follow
  `prefix_source_entity_agg_window_key_measure_rollup`, for example
  `rtp_vnet_beneacct_c_dy30_pan_hriskmrcht_mean`.
  - Windows: mn1/5/30, hr1/2/6/12, dy1/2/7/30/60/90/180.
  - Aggregations: c, s, std, min, delta_dy30_dy180.
  - They are produced upstream (`fe_visadirect_global_optimized_v2`), most likely from SWAT YAML.
    The generator code isn't in either repo.
- The toolchain is hypothesis-first, then grammar:
  1. LLM agents build a hypothesis tree, then a catalog.
  2. A deterministic grammar enforces coverage: 15 taxonomy patterns x inventory axes, stats
     {count, sum, mean, median, std}, and gates G1 to G5.
  3. A deterministic SQL renderer turns the spec into Spark SQL.
  4. A SWAT YAML packager handles the last step.
- Version gap: the in-house SWAT jar is v3.3.7, and the target version is 5.8.1.
- Leakage control: PRE90d/30d/7d/1d windows are used, and POST* windows are training-only.

**Revised assumption:** the LLM proposes, and a deterministic grammar that is a subset of SWAT
YAML is the contract. Every generated feature must render to both Spark SQL and SWAT YAML.

**Still open (feature-engineering owners):** who owns the `rtp_*` generator? Which SWAT version
is in production?

### 3. Training today: frameworks right, GPU pool half right, MLflow wrong

- Frameworks: PyTorch 2.0 or later with transformers, XGBoost, and LightGBM 4.5.0.
- GPU jobs run on **MLP Kubernetes**, not Slurm or YARN. They are submitted with `ml create`
  using Pharos auth in the namespace `rais-aiml`.
  - A100 sizes: g3.medium is a 20 GB MIG slice, g3.large is 40 GB, and g3.xlarge is a full 80 GB card.
  - Jobs have a 24 h TTL.
  - Everything is single-GPU, with no DDP.
- Data prep runs on Spark/YARN. Training data is copied to POSIX mounts.
- Tracking: some projects use JSON sidecar files plus `experiments.tsv`, and some use a local
  file-based MLflow store. The toolchain design says "if MLflow is not approved…". An MLP
  cloud pilot runs on SageMaker with MLflow.

**Revised assumption:** training goes through an MLP adapter that wraps `ml create`, with
GPU-hour budgets per project. The tracker sits behind an interface: start with file-based
tracking or MLflow, then switch to whatever MLP standardises on.

**Still open (MLP team):** is there a managed MLflow on-prem? What are the GPU quotas per
namespace? Is multi-GPU training allowed?

### 4. Deployment today (partly read)

- "dev/UAT only" is still a reasonable scope, but **KServe is a proposal, not something that exists**.
- Revised assumption (partly read): ML Studio stops at a validated, packaged model plus a dev/UAT
  endpoint with a p99 check. Production goes through AI Studio/MLP and governance, with online
  features served by VFP short-term features.
- The 50 ms and 100 ms latency figures come from mocks and docs, not from an SLA.

**Still open:** what is the production authorization scoring platform called? What is the real
latency budget?

### 5. LLM (partly read)

- The gateway part holds. The data policy conflicts between the two designs.
- Anthropic models are reached through the internal GenAI gateway.
- Revised assumption: the GenAI gateway is the only egress, and Bedrock sits behind it for the AWS
  path. By default the LLM sees schemas and aggregates only. Tokenized samples need explicit approval.

**Still open (GenAI hub):** does the gateway have zero data retention or a retention policy? Is
prompt logging on? Are tokenized samples allowed?

### 6. Compliance (mostly unreadable)

- Verdict: PCI DSS applies. The model-risk process is a complete gap.
- The rest of this answer was not readable in the photo.

### 7. Scale (partly read)

- There is no evidence on headcount, but the working assumption agrees with the earlier review.
- Revised assumption: keep 50 scientists and 20 to 40 projects. Size the Spark side for 100 to
  1,000 executors per job and the GPU side for MIG slices.

**Still open:** what are the confirmed year-one onboarding numbers?

### 8. Existing tooling (partly read)

- Hybrid isn't optional, because it's how things already work. SSO is undecided.
- Kerberos is used for Hadoop and Pharos for MLP. MLP Kubernetes is used for GPU work and the
  GenAI gateway for the LLM.
- The rest of this answer was not readable in the photo.

## Needs a clearer photo

- Section 4: the bullet list under the verdict.
- Section 5: the gateway details and the data-sample bullets.
- Section 6: everything after the verdict line.
- Section 7: the bullets that support the verdict.
- Section 8: the SSO and tooling bullets, and the end of the portability note.
- Any text that came after section 8 (the last photo was unreadable).
