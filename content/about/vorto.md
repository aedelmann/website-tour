---
title: "Eclipse Vorto, from model to platform"
date: 2026-08-17
type: "about"
description: "How Eclipse Vorto described IoT devices once and generated the glue so platforms could connect sensors faster—Alex as solution architect at Bosch.IO."
featured_image: "/images/about/vorto-architecture.png"
architecture_alt: "Eclipse Vorto architecture: sensors and devices are described once as Information Models in vortolang (function blocks), stored in the Vorto Repository with code generators and SDKs, then used by IoT platforms such as Bosch IoT Suite, Eclipse Ditto, Eclipse Hono, and others."
project_meta: "Alexander Edelmann · Solution architect · Bosch.IO · 2014–2020"
flow: "The picture below is the shape of the toolchain. Devices → model → repository → platforms."
architecture_caption: "Devices (sensors) → Model (vortolang + function blocks) → Toolchain (repository, generators, SDKs) → IoT platforms"
lede: "I was the **solution architect** on Eclipse Vorto (2014–2020) at Bosch.IO: an open-source toolchain so IoT platforms could connect sensors without rewriting the integration for every device. Describe the device once, generate the glue. That work grew the contributor community **5×** and **halved** device-integration time via SDKs—Bosch and other platform providers included."
build:
  list: never
  render: always
---

## The problem

IoT platforms used to bind to a small set of device APIs. Change the sensor or the manufacturer, and the integration had to be rewritten. Vorto’s job was the abstraction in the middle: one information model, many platforms.

## Model

Devices were described in **vortolang**, a DSL meant to be readable. An **Information Model** is the whole device (the digital twin). **Function Blocks** are the reusable capabilities—status and configuration properties, events, operations—plus shared datatypes. The metamodel sat on **Eclipse EMF**; the editors used **Eclipse Xtext** (Eclipse IDE and a web editor). Describe a temperature sensor once; reuse that function block on the next device.

## Toolchain

Four parts, on purpose:

1. **Language** — vortolang
2. **Metamodel** — how information models, function blocks, and datatypes relate
3. **Repository** — store, version, and share models (namespaces, web UI) so a platform team is not keeping private copies
4. **Generators** — turn a model into integration code / SDKs for a specific platform

The stack was **Java**. Generators shipped for **Bosch IoT Suite**, **Eclipse Ditto**, **Eclipse Hono**, and **OpenAPI**, plus a plugin SDK so a platform could add its own. A mapping engine sat beside that: arbitrary device payloads onto the function-block shape, so the platform did not have to speak every vendor encoding.

## Platforms

This is the work I did as solution architect: help **platform providers**—Bosch and others—actually plug the toolchain in, so connecting a new sensor was a model plus a generator, not a rewrite. That also includes the smart-building sensor-abstraction work with **Google**, **Microsoft**, and others. No protocol walkthroughs and no customer names beyond that.

---

That is Vorto in one pass: describe the sensor, share the model, generate the integration, connect it to a platform. Public repo: [github.com/eclipse/vorto](https://github.com/eclipse/vorto).
