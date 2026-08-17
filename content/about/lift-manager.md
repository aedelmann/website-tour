---
title: "Lift Manager, from shaft to cloud"
date: 2026-08-17
type: "about"
description: "How Lift Manager moved vibration and distance data from the lift shaft through an edge gateway to a cloud that feeds operations and partners—Alex as lead solution architect at Bosch.IO."
featured_image: "/images/about/lift-manager-architecture.png"
architecture_alt: "Lift Manager architecture: on-lift vibration and distance sensors feed the Lift Manager Gateway (collect, buffer, KPI, sync over HTTPS), then Lift Manager Cloud (ingest, alarms and KPI, predictive, REST API), which serves an Operations UI and partner integrations."
lede: "I led Lift Manager as **lead solution architect** at Bosch.IO (2020–2022): an end-to-end IoT stack for lift maintenance forecasts. Sensors on the shaft, a Java OSGi gateway at the edge, a Spring Boot cloud on Azure, and a REST surface for operations and partners. At the scale we shipped for, that meant data-driven maintenance across **10,000+ lifts**, heuristic AI, and a **>50%** cut in service footprint and installation time."
build:
  list: never
  render: always
---

## Hardware

Real lifts, not a lab demo. On-shaft sensors collected vibration (accelerometer / CISS) and laser distance at the car and shaft. That stream is what the rest of the stack was built around.

## Gateway

The **Lift Manager Gateway** ran on Java 8 / OSGi with Bosch IoT Gateway Software. Bundles formed a clear pipeline:

1. **Collect** — sensor auto-discovery, CISS, laser distance
2. **Buffer** — raw-data bus / event loop, then clean, persist, and hold locally so a bad uplink does not drop the stream
3. **KPI** — metrics computed on the edge
4. **Sync** — HTTPS up to the cloud

Around that: provisioning, diagnostics, a CLI, and simulators. We shipped images for Windows, macOS, and Raspberry Pi—useful when you are commissioning in a shaft, not only in a data centre.

## Cloud

**Lift Manager Cloud** was Java / Spring Boot on Azure. Event Hubs for ingest, raw files in Data Lake / Blob, MongoDB for operational state. Domain services covered device management, state and topology, alarms, KPIs, anomaly, predictive, reporting, and batch jobs.

The API was **REST on purpose**. The operations UI lived in a separate Connected Building app; the cloud stayed a service layer, not a monolith that also owned every screen. Day-to-day Azure ops tooling was in the mix—no need to catalogue every product here.

## Partners

On the right-hand side of the diagram: people who actually use the data.

- **Operations UI** — lift conditions for the teams watching the fleet
- **Partners** — high-level integration with a certification / inspection partner (**TÜV SÜD**) for anomaly detection

No protocol walkthroughs, no customer names beyond that. The point was a clean cloud surface so operations and partners could see what mattered without living inside the gateway.

---

That is Lift Manager in one pass: sensors in the shaft, a buffering edge gateway, a REST cloud with predictive and alarm services, and UIs for ops and partners.
