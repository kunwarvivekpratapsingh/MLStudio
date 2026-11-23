# ML Studio design: open questions

These questions came up while writing the end-to-end, cloud-agnostic design for ML Studio
(HLD plus LLD for the key components). The design proceeds on stated assumptions until each
one is answered. Screenshots of how things work today are welcome, especially for 2 to 4.

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

## How to answer

Reply inline under each question below, or edit the table above. Each answer updates the
matching assumption in the design document.

### 1. Data platform

_Answer:_

### 2. Auto feature generation today

_Answer:_

### 3. Training today

_Answer:_

### 4. Deployment today

_Answer:_

### 5. LLM

_Answer:_

### 6. Compliance

_Answer:_

### 7. Scale

_Answer:_

### 8. Existing tooling

_Answer:_
