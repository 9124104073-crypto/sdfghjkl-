# SYNAPSE BUILDOS — Master Project Blueprint (v2)
### AI Building Intelligence Platform for the Future of Architecture
**Tagline:** *"Imagine. Design. Build. Live — Intelligently."*

---

## 0. Positioning vs. Nirman AI

Nirman AI plans **public infrastructure at civic scale** (hospitals, roads, schools) for governments and engineers, with a citizen-feedback loop as its edge.

Synapse BuildOS plans **individual buildings at personal/commercial scale** (homes, villas, offices) for homeowners, architects, and contractors — the same core AI philosophy (digital twin, specialized AI agents, explainable reasoning, consequence simulation) applied to a much larger, faster-moving market: every person who ever builds or renovates a building.

To make Synapse BuildOS the stronger of the two projects, it needs to do what Nirman does — one true differentiator, a hard feasibility split, and a working build prompt — but tuned to what makes *building design* uniquely hard: closing the gap between a beautiful AI-generated design and an actually buildable, actually livable one.

---

## 1. Vision

## 1A. Core MVP Differentiator — Connected Decision Intelligence

Synapse BuildOS should not compete with AutoCAD, Revit, SketchUp, or other specialized tools by trying to become another drafting or modeling application. Its core differentiation is **connected reasoning across the same project**.

The product should not be positioned simply as:

- Plan AI
- Compliance AI
- Cost AI

Instead, these capabilities must understand one shared project model so that **one design decision automatically propagates through the rest of the project**.

### The Product Moment

Example starting project:

- Plot: 2,000 sq.ft
- Bedrooms: 3
- Budget: ₹45L
- Parking: 2 cars

The architect changes one decision:

> **Add a 4th bedroom**

Synapse should immediately show the consequences across the project:

**DESIGN**
- Built-up area: 1,520 → 1,650 sq.ft

**COST**
- ₹43.2L → ₹47.1L
- ⚠️ Budget exceeded by ₹2.1L

**COMPLIANCE**
- FSI: still within limit
- Parking: still compliant

**BOQ**
- +1 door
- +42 m² wall
- +12 m² flooring
- + electrical points

**LAYOUT**
- Living room reduced by 35 sq.ft

Synapse then provides decision options:

### Fix the Budget

- **Option A:** Reduce bedroom size
- **Option B:** Reduce living room
- **Option C:** Remove 4th bedroom
- **Option D:** Increase budget

The key product promise becomes:

> **Change one thing. See everything it affects.**

This is the central demonstration of Synapse's value. The product is not merely generating a floor plan, cost estimate, BOQ, or compliance report independently. It is maintaining the relationship between them.

### Why This Is Different

Individual capabilities are increasingly available in the market:

- AI can generate floor plans.
- Software can estimate costs.
- Tools can perform feasibility and compliance checks.
- CAD/BIM software can produce precise professional drawings.

Synapse becomes differentiated when it creates a **shared project intelligence layer** connecting:

**Project Requirements → Design → Quantities → Cost → BOQ → Compliance → Client Priorities**

The value is in the **relationship between these elements**, not in any single AI feature.

### MVP Scope

The first working version does not need to replace professional CAD/BIM software. It should prove connected reasoning using a constrained set of editable parameters:

- Bedroom count
- Bedroom area
- Bathroom count
- Parking
- Built-up area
- Kitchen area
- Budget
- Floor count

These parameters should genuinely drive:

**Plan → Cost → BOQ → Compliance**

The MVP should prioritize reliability over breadth. It is better to demonstrate a small number of parameters with real downstream consequences than to claim a large number of AI capabilities that operate independently.

### Positioning

**Synapse BuildOS**  
*The decision intelligence layer for residential projects.*

Long-term, Synapse can evolve toward the broader vision of an **Operating System for Residential Construction**, covering the project lifecycle from brief and design through approvals, construction, and operations.

For the MVP, however, the product should prove the narrower and more defensible claim:

> **When an architect changes a decision, Synapse understands the consequences.**

The architect, engineer, designer, or homeowner remains the decision-maker. Synapse provides the connected analysis needed to make that decision faster and with greater confidence.

Synapse BuildOS is an AI Building Intelligence Platform that turns a single natural-language idea — *"design a contemporary four-bedroom villa inspired by Japanese architecture for a tropical climate with a ₹2 crore budget"* — into a complete, explainable, construction-ready building concept. It combines specialized AI models for architecture, structure, interiors, materials, cost, sustainability, and visualization into one orchestrated ecosystem (Synapse Cortex), instead of one generic AI trying to do everything badly.

Unlike a rendering tool, Synapse BuildOS reasons about consequences — how a design decision today affects cost, structural safety, energy bills, and daily life for the people who will actually live in the building — and explains every recommendation in plain language before a single brick is laid.

The architect, engineer, or homeowner always makes the final call. Synapse BuildOS accelerates and de-risks that decision — it never replaces it.

---

## 2. Problem Statement

Building design and construction today is fragmented and slow:

- Multiple disconnected software tools for design, structure, cost, and visualization
- Time-consuming manual revisions every time a client changes their mind
- Poor communication between architect, structural engineer, interior designer, and contractor
- Manual updates required across drawings, BOQs, and 3D models for every single change
- Inaccurate, late-stage cost and material estimation
- No immersive way for a client to actually experience a design before it's built
- Complex tools that shut out non-expert homeowners from participating in decisions about their own home
- Disconnected project information across every stakeholder
- Higher cost, rework, and delays as a direct result of all of the above

Every one of these is a *design-to-execution* gap. Most AI-architecture tools address the design half and leave the execution half exactly as fragmented as before.

---

## 3. The Three Differentiators That Beat Nirman AI's Ambition

### 3.1 Construction-Ready Handoff (the big one)

Almost every AI-architecture demo — including most of what's already strong in Synapse BuildOS — stops at a beautiful 3D render or AR walkthrough. That's a demo, not a deliverable. The differentiator is closing the loop all the way to something a contractor can actually execute:

- Auto-generated **Bill of Quantities** (materials, quantities, estimated vendor costs) directly from the 3D model and Materials AI output
- Auto-generated **structural drawing set** (floor plans, elevations, sections) at a basic-but-real technical standard, derived from the Structural AI's load-path and system recommendations
- **Vendor-ready material specification sheets** (exact material types, finishes, sustainability ratings) generated from the Materials AI + Sustainability AI outputs

This is what turns "AI designs a pretty villa" into **"AI designs a villa someone can actually build tomorrow."** It is the single feature that separates a portfolio-piece demo from a fundable product, and it's what a judging panel remembers after seeing ten AI-render tools in a row.

### 3.2 Lived-Experience Simulation (Synapse's version of Nirman's citizen loop)

Nirman AI's edge is that it consults the *people* affected by public infrastructure before it's built. Synapse BuildOS's equivalent, scaled to one household instead of a district:

Before finalizing a plan, the homeowner answers a short natural-language intake (household members, routines, priorities — e.g., "two kids under 10," "a parent with limited mobility," "I work from home and need a quiet room," "we entertain guests often"). The **Building Consequence Engine** then simulates a literal day-in-the-life against the proposed floor plan:

- Morning routine flow (bathroom contention, kitchen traffic)
- An elderly or mobility-limited family member's path through the house
- Monsoon/flood behavior at the specific site (does the terrace or entrance flood?)
- Estimated energy bill over 5–10 years given the specific orientation, materials, and local climate
- Noise/privacy conflicts (e.g., home office next to a noisy common area)

This turns the "Explainable AI" feature already in Synapse BuildOS from *why we chose this material* into **"here's what your actual life will look like in this house"** — a far more emotionally resonant and genuinely useful explainability layer, and it's fully feasible with an LLM + a lightweight rules/simulation layer — no new hardware, no custom ML training.

### 3.3 Multi-Department AI Ecosystem (the real-world bottleneck nobody else touches)

Every real building project involves more than design and construction — it involves *departments*, each a real bottleneck that has nothing to do with how good the floor plan is:

- **Legal & Compliance Department** — municipal building bylaws, Floor Space Index (FSI) limits, setback rules, fire-safety NOC requirements, environmental clearance thresholds
- **MEP Department** (Mechanical, Electrical, Plumbing) — wiring load, plumbing layout, HVAC placement
- **Facility Management Department** — how the building will actually be operated and maintained after handover
- **Real Estate & Insurance Department** — resale value estimation, insurance premium implications of material and location choices
- **Vendor & Supply Chain Department** — sourcing the materials the BOQ says you need, from real local suppliers

Most AI-architecture tools ignore all of this and hand the client a floor plan that then has to survive months of separate legal/compliance back-and-forth before anyone can break ground — the exact same "disconnected departments" problem Nirman AI solves for government infrastructure, just on the private-building side.

**The one department to build for real: Legal & Compliance AI.** Given the site's location and local zoning rules (encoded as a small rules dataset per pilot city — not scraped from every jurisdiction), it checks the generated floor plan against basic bylaws (FSI, setbacks, height limits, minimum parking, fire-exit requirements) and flags violations *before* the design is finalized, alongside a plain-language note on which government NOCs the project will likely need (fire department, pollution control board, municipal corporation). This is the single highest-leverage addition: it turns Synapse BuildOS from "an AI that designs your house" into **"an AI that designs your house so it will actually get approved,"** which is the single most painful, expensive, and delay-prone part of construction anywhere in the world — and it's fully feasible as a rules-engine + LLM layer against one pilot city's public bylaw document, no live government API integration required.

The remaining departments (MEP, Facility Management, Real Estate/Insurance, Vendor Marketplace) are pitched as the platform's roadmap — the "full building lifecycle" vision — without needing to be built for the demo.

Together, these three differentiators mean Synapse BuildOS beats Nirman AI on ambition (it goes further than design — to buildability, lived experience, and real-world approvability) while staying more feasible per feature (one pilot city's bylaw data, no satellite pipelines, no live multi-department government integration — just one site, one client, one AI orchestration pipeline).

---

## 4. Feasibility Split — What You Build vs. What You Pitch

| Build for real (MVP demo) | Pitch as roadmap (design only, don't build) |
|---|---|
| Synapse Cortex orchestrator (routes a natural-language prompt to the right specialized AI calls) | Full AR/VR headset hardware integration |
| Architecture AI (floor plan generation, space/zoning logic) | Native mobile app |
| Structural AI (basic load-path & system sanity-check recommendations — not certified engineering) | Real-time multi-user live collaboration across stakeholders |
| Interior Design AI (layout, materials, color/style suggestions) | Autonomous building ecosystem (Phase 5 on your own roadmap) |
| Cost Estimation AI (budget breakdown, quantity estimation) | Global building-code compliance across every jurisdiction |
| Materials & Sustainability AI (recommendations + basic energy/carbon estimate) | — |
| Building Consequence Engine (Lived-Experience Simulation — Section 3.2) | — |
| Construction-Ready Handoff (BOQ + basic drawing set — Section 3.1) | — |
| Legal & Compliance AI (bylaw/FSI/setback check + required-NOC list — Section 3.3, one pilot city only) | MEP Department AI (mechanical/electrical/plumbing layout) |
| Explainable AI report (plain-language rationale, confidence, risks) | Facility Management Department AI (post-handover operations) |
| 3D Visualization (Three.js web-based, not full AR) | Real Estate & Insurance Department AI (resale value, premium estimation) |
| Stakeholder Hub — simple shared dashboard, not real-time multi-user editing | Vendor & Supply Chain Department AI (live supplier sourcing/marketplace) |

Everything on the left is buildable by a small team using an LLM (Claude API) as the reasoning layer across each "specialized AI," a rules engine for structural sanity checks and BOQ generation, and a web-based 3D viewer. Nothing on the left requires custom ML model training — this is what makes the ambitious version still feasible on a hackathon-to-prototype timeline.

---

## 5. Real Test Case

Run the entire demo on one real, concrete brief instead of an abstract "any house" pitch. Recommended: pick one realistic client brief with real constraints —

> *"A 2,000 sq. ft. plot in a tropical coastal town, ₹1.5–2 crore budget, family of four including one elderly parent, needs a home office, prefers natural materials and passive cooling."*

Run the full pipeline against this one brief for your demo. A specific, believable brief with named constraints (budget, family composition, climate) is dramatically more convincing to judges than a generic "design any house" prompt, and costs no extra build effort.

---

## 6. System Architecture

```text
                    ┌───────────────────────────────┐
                    │      Client Intake Layer        │
                    │ Natural language prompt +        │
                    │ household/lifestyle questionnaire │
                    └───────────────┬─────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │        Synapse Cortex           │
                    │   (AI Orchestrator — routes to   │
                    │    the right specialized models) │
                    └───────┬───────────┬─────────────┘
                            ▼           ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │Architecture │ │ Structural  │ │  Interior   │ │  Materials  │
          │     AI      │ │     AI      │ │ Design AI   │ │      AI     │
          └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                 │               │               │               │
          ┌──────┴───────────────┴───────────────┴───────────────┴──────┐
          │               Cost Estimation AI + Sustainability AI          │
          └───────────────────────────┬──────────────────────────────────┘
                                      ▼
                    ┌───────────────────────────────┐
                    │      Legal & Compliance AI      │
                    │  (FSI/setback/bylaw check +      │
                    │   required NOC list, pilot city)  │
                    └───────────────┬─────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  Building Consequence Engine    │
                    │  (Lived-Experience Simulation:   │
                    │  daily routines, flood behavior, │
                    │  energy cost over time)          │
                    └───────────────┬─────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │   Construction-Ready Handoff    │
                    │  (BOQ generator + basic drawing  │
                    │   set + vendor material specs)   │
                    └───────────────┬─────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │      Explainable AI Report      │
                    │ Why · data used · confidence ·   │
                    │ risks · lived-experience summary  │
                    └───────────────┬─────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │   3D Visualization Dashboard    │
                    │  (web-based, Three.js/R3F)        │
                    └───────────────┬─────────────────┘
                                    ▼
                     Homeowner / Architect / Engineer Approval
```

---

## 7. Judging & Impact Alignment

- **Market size argument:** every homeowner, architect, and contractor globally is a potential user — a far larger addressable market than government-only infrastructure planning, which strengthens the commercial/business-model story.
- **UN SDG 11** — Sustainable Cities and Communities (energy-efficient, climate-appropriate design at scale)
- **UN SDG 9** — Industry, Innovation, Infrastructure (democratizing access to expert-level design intelligence for non-experts)
- **Equity angle:** the Lived-Experience Simulation makes sophisticated design reasoning — previously accessible only through expensive architects — available to any homeowner via natural language.
- **Real-world friction argument:** legal/regulatory approval delays are one of the most cited causes of construction cost overruns and delays anywhere in the world; a Legal & Compliance AI that flags violations before finalization directly targets this, not just the design layer.

Open your pitch with the "design-to-execution-to-approval gap" framing: most AI-architecture tools produce beautiful but unbuildable, unapprovable renders; Synapse BuildOS is the one that hands the contractor and the government office something real.

---

## 8. The Build Prompt

Copy everything below and hand it to your AI coding assistant (Claude Code, Cursor, etc.) to scaffold the working prototype. Scoped strictly to the feasible MVP (Section 4, left column).

```
Build a working prototype called Synapse BuildOS: an AI Building Intelligence
Platform that turns a natural-language brief into a complete, explainable,
construction-ready building concept. Scope this strictly to what's feasible
for a small team in a few weeks — do not add features beyond what's listed here.

CORE MVP FEATURES TO BUILD:

1. Client Intake: a simple form/chat interface collecting (a) a natural-language
   design prompt (e.g. "design a contemporary four-bedroom villa..."), (b) plot
   size and location, (c) budget, and (d) a short household/lifestyle
   questionnaire (family size, ages, special needs like mobility limitations,
   work-from-home needs, lifestyle priorities).

2. Synapse Cortex Orchestrator: a backend service that takes the intake data
   and sequentially calls a series of role-prompted LLM calls (Claude API),
   each acting as one "specialized AI," passing outputs from earlier calls as
   context into later ones:
   - Architecture AI: generates a floor plan description (room list, approximate
     dimensions, zoning/adjacency logic) as structured JSON.
   - Structural AI: given the floor plan, flags basic structural
     considerations (load-bearing wall placement, span limitations) as
     plain-language notes — clearly labeled as advisory, not certified
     engineering.
   - Interior Design AI: given the floor plan and stated style preference,
     suggests materials, color palette, and furniture layout per room.
   - Materials & Sustainability AI: recommends specific materials with a
     basic energy-efficiency/sustainability rating for the given climate.
   - Cost Estimation AI: given the floor plan, materials, and local budget
     context, produces an estimated cost breakdown by category (structure,
     interiors, materials, finishing) as structured JSON.
   All of these must output strict JSON so the frontend can render them
   directly into UI panels.

3. Building Consequence Engine (Lived-Experience Simulation): given the
   completed floor plan + the household questionnaire, generate a
   plain-language "day in the life" simulation: morning routine flow,
   any mobility/accessibility concerns for named family members, expected
   flood/climate behavior for the given location and site orientation, and
   a rough energy cost estimate over 5-10 years. Present this as clear
   narrative text, not just numbers.

4. Construction-Ready Handoff: from the completed floor plan, materials
   list, and cost breakdown, auto-generate (a) a basic Bill of Quantities
   (item, estimated quantity, estimated unit cost, estimated total) as a
   downloadable table/CSV, and (b) a simple 2D floor plan drawing (can be
   a basic SVG/vector rendering derived from the Architecture AI's room
   layout — does not need to be professional CAD-grade for the prototype).

5. Explainable AI Report: a single report view combining: why this design
   fits the stated brief, which specialized AI outputs were used, a
   confidence score, key risks/caveats (especially around the advisory
   nature of the Structural AI notes), and the Lived-Experience Simulation
   summary from step 3 — written for a non-expert homeowner to read and
   understand without any architecture background.

6. 3D Visualization: a simple web-based 3D view (Three.js or React Three
   Fiber) that renders a basic massing/room-layout model from the
   Architecture AI's structured floor plan output — walls, rough room
   volumes, and window/door placements. This does not need photorealistic
   rendering for the prototype; a clean, readable schematic 3D model is
   sufficient.

7. Stakeholder Dashboard: a simple shared view (no real-time multi-user
   editing needed) where the homeowner, architect, and contractor roles
   can each see the current plan, cost breakdown, and explainable report.

TECH STACK PREFERENCE:
- Backend: Python (FastAPI) or Node.js — pick whichever is faster to ship in.
- Frontend: React, with Three.js or React Three Fiber for the 3D view.
- LLM: Claude API (Sonnet) for every specialized AI call and the Consequence
  Engine, using structured JSON output enforced via explicit prompt
  instructions for every model call.
- Keep each "specialized AI" as its own clearly separated function/module
  even though they're all the same underlying LLM — this preserves the
  "specialized AI ecosystem" pitch and makes it easy to later swap in real
  fine-tuned or domain-specific models without restructuring the system.

EXPLICITLY DO NOT BUILD (roadmap-only, do not scaffold or stub these):
- AR/VR headset integration or native mobile app
- Real-time multi-user live collaborative editing
- Certified/compliant structural engineering calculations
- Building-code compliance checking across multiple jurisdictions

DELIVERABLE: a working local (or simply deployed) demo covering one real
client brief (I will provide plot size, location, budget, and household
details), showing the full flow: intake -> Synapse Cortex specialized AI
outputs -> Building Consequence Engine simulation -> Construction-Ready
Handoff (BOQ + basic drawing) -> Explainable AI report -> 3D visualization.
Prioritize a thin, complete, end-to-end flow over polishing any single stage.
```

---

## 9. Immediate Next Steps

1. Finalize the one real client brief (Section 5) you'll demo against.
2. Hand Section 8's build prompt to your coding assistant with that brief filled in.
3. Once the pipeline runs end-to-end, layer in Section 7's judging language for the pitch narrative.
4. For the pitch deck, lead with the "design-to-execution gap" framing — show a competitor's pretty render next to your generated BOQ + drawing set as the visual proof of the differentiator.


# 16. Synapse BuildOS — End-to-End Product Flow

## Product Experience

The complete Synapse experience should feel like **one continuous project**, not a collection of separate tools.

The user starts with an idea and gradually turns it into:

**Brief → Site → Architecture → Rooms → Interior Design → Cost → BOQ → Compliance → Impact Analysis → Client Approval → Professional Handoff → Construction Intelligence**

The same project data should remain connected throughout the entire flow.

---

## STEP 1 — Create Project

### User enters

- Project name
- Project type
- Location
- Plot/site information
- Approximate plot dimensions
- Budget
- Client information
- Project goals

### Input methods

- Voice
- Text
- Form
- Uploaded site documents/photos
- Site measurements

### Synapse creates

**Project DNA**

- Client requirements
- Site information
- Budget
- Space requirements
- Design preferences
- Constraints
- Priorities

---

## STEP 2 — Understand the Site

Synapse processes the available site information.

### Site information

- Plot dimensions
- Orientation
- Road access
- Existing structures
- Setbacks
- Approximate buildable area
- Parking requirements
- Relevant local planning parameters

### Output

**Site Feasibility**

The system identifies:

- Opportunities
- Constraints
- Potential compliance issues
- Approximate buildable area
- Parking possibilities
- Initial cost implications

The result is a **site intelligence layer**, not a final professional approval.

---

## STEP 3 — Define the Requirements

Synapse converts the client's conversation into structured requirements.

### Example

**Family**

4 people

**Required spaces**

- Living room
- Kitchen
- Dining
- 3 bedrooms
- 3 bathrooms
- Pooja room
- Home office
- 2-car parking

**Preferences**

- Natural light
- Cross ventilation
- Modern exterior
- Elderly-friendly
- Vastu preferences if requested

**Budget**

₹45L

The architect/designer can edit every requirement.

---

## STEP 4 — Generate Design Options

Instead of producing only one design, Synapse proposes multiple strategies.

### Option A — Budget First

- Lower built-up area
- Lower estimated cost
- Efficient circulation

### Option B — Comfort First

- Larger rooms
- More generous circulation
- Higher cost

### Option C — Future Ready

- Expansion possibilities
- Future floor provision
- Flexible spaces

Each option should show:

- Approximate area
- Room list
- Estimated cost
- Major trade-offs
- Potential constraints

The professional selects a starting option.

---

# STEP 5 — Exterior Architecture

The selected concept becomes the initial building architecture.

### User can explore

- Building massing
- Floors
- Roof
- Windows
- Doors
- Balcony
- Exterior materials
- Facade
- Landscape
- Parking

The user can view the building in:

**2D → 3D → Exterior Preview**

The exterior is not the end of the workflow.

It becomes the entry point into the interior.

---

# STEP 6 — Building → Floor → Room Navigation

The user clicks the building.

The system opens the building hierarchy:

**Project**

→ Ground Floor

→ First Floor

→ Second Floor

Each floor contains clickable rooms.

### Example

**Ground Floor**

- Living Room
- Kitchen
- Dining
- Bedroom
- Bathroom
- Pooja Room

**First Floor**

- Master Bedroom
- Bedroom 2
- Family Lounge
- Bathroom
- Balcony

Every room becomes an interactive design space.

---

# STEP 7 — Room Interior Designer

When a user selects a room, Synapse opens a dedicated room customization environment.

### Example

**Living Room**

The user can select:

### Furniture

- Sofa
- Coffee table
- TV unit
- Recliner
- Bookshelf
- Side tables

### Flooring

- Tile
- Marble
- Wood
- Stone
- Premium tile

### Walls

- Paint
- Wallpaper
- Wood panel
- Stone
- Accent wall

### Lighting

- Ceiling light
- Pendant
- Cove lighting
- Floor lamp
- Wall lights

### Windows

- Curtains
- Blinds
- Sheers

### Decor

- Rug
- Artwork
- Plants
- Mirrors
- Accessories

Items can be:

**Previewed → Selected → Added to the room → Repositioned → Removed**

---

# STEP 8 — Room-Specific Catalog

The available choices should automatically change based on the room.

### Living Room

Furniture + flooring + walls + lighting + windows + decor.

### Bedroom

- Bed
- Wardrobe
- Study table
- Side tables
- Lighting
- Curtains
- Flooring
- Wall finishes

### Kitchen

- Cabinets
- Countertop
- Island
- Hob
- Chimney
- Oven
- Dishwasher
- Backsplash
- Flooring
- Lighting

### Bathroom

- WC
- Basin
- Shower
- Bathtub
- Vanity
- Mirrors
- Wall tiles
- Floor tiles
- Accessories

The user should never have to search through irrelevant products.

---

# STEP 9 — Style Selection

Before manually choosing every item, the user can select a design language.

### Styles

- Modern
- Minimal
- Luxury
- Warm Contemporary
- Traditional
- Japandi
- Industrial

Synapse generates a starting room palette based on the selected style.

The user can then replace individual items.

### Example

**Warm Contemporary Living Room**

Synapse suggests:

- Neutral sofa
- Warm wood TV unit
- Soft lighting
- Neutral curtains
- Natural textures
- Indoor plants

The user remains in control of every selection.

---

# STEP 10 — Real-Time Interior Cost

Every selected item affects the project budget.

### Example

User selects:

**Sofa**

₹45,000

**TV Unit**

₹70,000

**Premium Flooring**

₹1.2L

**Cove Lighting**

₹35,000

Synapse calculates:

### Living Room Interior

**₹2.7L**

Then updates:

### Project Budget

₹45L → ₹47.7L

### Remaining Budget

₹2.3L

This connects interior design directly to the project's financial model.

---

# STEP 11 — Connected Change Impact

This is the central Synapse feature.

Every significant change should propagate through the project.

### Example

User selects:

> **Add a fourth bedroom**

Synapse updates:

### Design

Built-up area:

1,520 → 1,650 sq.ft

### Layout

Living room:

−35 sq.ft

### Cost

₹43.2L → ₹47.1L

### Compliance

- FSI checked
- Parking checked
- Setbacks checked

### BOQ

- Additional door
- Additional wall area
- Additional flooring
- Additional electrical points

### Client Requirements

Check whether the new room conflicts with existing priorities.

The user sees all consequences in one place.

---

# STEP 12 — "What If?" Decision Engine

The user can ask Synapse questions such as:

> What if I add one more bathroom?

> What if I make the kitchen bigger?

> What if I use marble throughout?

> What if I reduce the budget to ₹40L?

> What if I add a first floor?

Synapse calculates the likely impact across:

**Design + Area + Cost + BOQ + Compliance + Client Priorities**

---

# STEP 13 — Budget Recovery

If a decision creates a budget problem, Synapse should propose alternatives.

### Example

**Current project**

₹47.1L

**Target budget**

₹45L

### Synapse suggests

**Option A**

Reduce bedroom size.

**Option B**

Reduce living room.

**Option C**

Use a lower-cost flooring material.

**Option D**

Simplify facade materials.

**Option E**

Increase project budget.

Each option should display:

- Estimated saving
- Design impact
- Quality impact
- Affected rooms
- New total cost

The user selects the preferred solution.

---

# STEP 14 — Whole-Project Interior

After configuring individual rooms, Synapse provides a complete interior summary.

### Project Interior

**Ground Floor**

- Living Room
- Kitchen
- Dining
- Bedroom
- Bathroom

**First Floor**

- Master Bedroom
- Bedroom 2
- Family Lounge
- Bathroom

For each space:

- Furniture
- Materials
- Finishes
- Lighting
- Estimated cost

The user can review the entire house as one interior system.

---

# STEP 15 — Material and Furniture Schedule

Synapse generates a structured schedule.

### Example

| Category | Item | Room | Quantity | Estimated Cost |
|---|---|---|---:|---:|
| Furniture | Sofa | Living | 1 | ₹45,000 |
| Flooring | Premium Tile | Living | 220 sq.ft | ₹1.2L |
| Lighting | Cove Lighting | Living | 1 | ₹35,000 |
| Furniture | Bed | Master | 1 | ₹65,000 |
| Cabinet | Modular Kitchen | Kitchen | 1 | ₹2.4L |

This becomes part of the project's BOQ and procurement information.

---

# STEP 16 — BOQ Generation

The system combines architectural and interior decisions.

### Architectural BOQ

- Walls
- Doors
- Windows
- Flooring
- Electrical
- Plumbing
- Structural quantities where supported

### Interior BOQ

- Furniture
- Carpentry
- Kitchen
- Wardrobes
- Lighting
- Finishes
- Fixtures
- Decor categories

Every change should update the relevant quantities.

---

# STEP 17 — Compliance and Feasibility Check

Synapse continuously checks the project against the available rules and project constraints.

### Checks can include

- Setbacks
- FSI/FAR
- Parking
- Built-up area
- Floor count
- Site constraints
- Other configured local requirements

The system should clearly label these as:

**Preliminary AI checks**

and not as guaranteed professional or municipal approval.

---

# STEP 18 — Professional Handoff

Synapse should not attempt to replace professional CAD/BIM software.

Once the concept is approved, the project can move into professional tools.

### Potential exports

- PDF
- BOQ
- Excel
- DXF/DWG workflow
- IFC/BIM workflow
- Revit-compatible workflow
- SketchUp-compatible workflow

The architect or engineer remains responsible for professional validation and final documentation.

---

# STEP 19 — Client Presentation

Synapse generates a client-friendly project view.

### Client can see

- Exterior
- Floor plans
- Individual rooms
- Interior selections
- Materials
- Budget
- Design alternatives
- Approved decisions

The client can submit requests such as:

> "Make the living room warmer."

> "I don't like this sofa."

> "Can we increase kitchen storage?"

Synapse converts the request into a structured project change.

---

# STEP 20 — Client Approval

Each major decision can have a status:

**Draft**

→ **Suggested**

→ **Architect Reviewed**

→ **Client Review**

→ **Approved**

→ **Locked**

This creates a decision history.

---

# STEP 21 — Decision History

Synapse maintains a record of important project decisions.

### Example

**Aug 13**

Client requested:

> Add fourth bedroom.

**Aug 13**

Synapse calculated:

> +₹3.9L estimated cost.

**Aug 14**

Architect selected:

> Reduce living room instead.

**Aug 14**

Client approved.

This prevents important decisions from being lost across:

- WhatsApp
- Email
- Calls
- PDFs
- Excel files

---

# STEP 22 — Construction Intelligence — Future

Once the design is approved, the same project intelligence can continue into construction.

Future features can include:

### Site Photos

Upload photos/video.

### AI Site Comparison

Compare:

**Approved design ↔ Actual construction**

### Potential outputs

- Progress
- Deviations
- Quantity differences
- Potential issues
- Documentation
- Evidence

This becomes the foundation for a future **digital project twin**.

---

# STEP 23 — Future Project Lifecycle

The long-term Synapse flow becomes:

**Client Idea**

↓

**Voice / Text Brief**

↓

**Project DNA**

↓

**Site Intelligence**

↓

**Requirements**

↓

**Feasibility**

↓

**Architecture Options**

↓

**Exterior Architecture**

↓

**Floors**

↓

**Rooms**

↓

**Interior Design**

↓

**Furniture + Materials**

↓

**Cost**

↓

**BOQ**

↓

**Compliance**

↓

**Change Impact Analysis**

↓

**Client Review**

↓

**Approval**

↓

**Professional CAD/BIM Handoff**

↓

**Construction**

↓

**Site Intelligence**

↓

**Digital Twin**

↓

**Facility / Asset Management**

---

# 24. Core Synapse Principle

Every major part of the product should follow one principle:

> **Nothing exists in isolation.**

A room affects the floor.

A floor affects the building.

A design decision affects quantities.

Quantities affect cost.

Cost affects the budget.

Materials affect cost.

Interior selections affect the BOQ.

Design changes affect compliance.

Client preferences affect design decisions.

Therefore:

### **Synapse connects the consequences.**

---

# 25. Final Product Experience

The complete product can be summarized as:

### **BUILD**

Create the architecture.

↓

### **EXPLORE**

Click through floors and rooms.

↓

### **DESIGN**

Customize interiors.

↓

### **SELECT**

Choose furniture, materials, finishes and lighting.

↓

### **CALCULATE**

See real-time cost and quantities.

↓

### **UNDERSTAND**

See design, cost, BOQ and compliance impacts.

↓

### **OPTIMIZE**

Ask Synapse to find alternatives.

↓

### **APPROVE**

Architect and client approve decisions.

↓

### **HAND OFF**

Move the project into professional CAD/BIM and construction workflows.

---

# 26. Core Product Promise

## Synapse BuildOS

### **From the first idea to a connected, decision-ready residential project.**

And the key interaction remains:

> **Change one thing. See everything it affects.**
