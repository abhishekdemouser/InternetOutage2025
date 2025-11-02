
# Preferido · Nuture — AWS Outage Simulation (R&D Build)

Comprehensive outage simulator intended for R&D and financial research demos. **Vanilla JS only**. No external libs/CDNs. Works locally (`file://`) and on GitHub Pages.

## Features
- Scenario presets (IAM global, S3 regional, RDS failover, Route53 DNS, Lambda+API)
- Architecture controls: AZ count, cross‑region DR (none/warm/active), dependency toggles (S3/RDS/IAM/DNS)
- Incident flow: Detect → Failover → Recover with deterministic timeline
- KPIs: uptime, revenue loss, RTO/RPO, TTF/TTD/TTR, incident TCO
- SLO error‑budget burn (30‑day), backlog model (queued requests)
- Cost model: fixed/hr, variable %, SLA penalties
- Reproducible runs (seed from inputs)
- Export CSV report

## Run
Open `index.html` locally or publish to GitHub Pages.

## Notes
All numbers are illustrative and computed client‑side. This is **not** an AWS status monitor; it is a sandbox for architecture and finance what‑ifs.
