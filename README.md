# CivicPulseNG: Agentic Hyperlocal Civic Intelligence
---
> **Note:- The backend is robustly deployed on Hugging Face Spaces while the frontend is hosted via Firebase Hosting on Google Cloud, fully containerized via Docker to seamlessly handle the multi-agent AI pipeline and background analytics workflows.**
---
An AI-native, agentic civic operating system for communities, citizens, and local governments that moves beyond traditional issue reporting.

<p align="center">
  <img src="https://github.com/Nischaya008/CivicPulseNG/blob/main/assets/Banner.png?raw=true" 
       alt="CivicPulse Banner" 
       width="600">
</p>

## Brief Summary
Traditional civic complaint platforms act as passive forms, resulting in duplicate reports, fake complaints, and a lack of intelligent prioritization. CivicPulse AI transforms this reactive model into a proactive, intelligent ecosystem.

The system introduces an **Agentic Workflow Layer** comprising 5 autonomous AI agents that analyze, verify, prioritize, and route civic issues (like potholes, streetlights, or waste). Powered by Google's Gemini models, it performs multimodal analysis on citizen reports, predicts future hotspots using historical and geospatial data, and gamifies the community verification process—creating a self-sustaining cycle of civic improvement.

---

## Problem Statement
### What?
An AI-driven community operating system that autonomously identifies, validates, prioritizes, predicts, and escalates hyperlocal civic problems.

### Why?
Conventional complaint systems suffer from severe bottlenecks:
- **Fragmented reporting:** Hundreds of duplicate complaints for the same pothole.
- **No verification:** Prone to fake reports and spam.
- **Lack of prioritization:** Critical safety hazards get buried under minor complaints.
- **Reactive governance:** Authorities respond after the damage is done, with no predictive insight.

### For Whom?
- **Citizens:** Seeking a transparent, responsive channel to improve their neighborhoods.
- **Verifiers/Volunteers:** Looking to actively contribute and build a community trust score.
- **Government Officials & NGOs:** Needing prioritized, deduplicated, and verified data to allocate resources efficiently.

### Real-World Insight
Civic decay is often predictable. A minor drainage issue today becomes a major flood hazard during the monsoon. By mapping out geospatial data and employing predictive AI, municipal bodies can shift from reactive repairs to preventative maintenance.

<p align="center">
  <img src="https://github.com/Nischaya008/CivicPulseNG/blob/main/assets/Predictions.png?raw=true" 
       alt="Issues" 
       width="600">
</p>

---

## Impact
- **Eliminates Duplicate Efforts:** AI duplicate detection groups similar reports, reducing municipal inbox clutter significantly.
- **Community-Led Verification:** Decentralized trust engine ensures high authenticity before officials even see the report.
- **Predictive Resource Allocation:** Hotspot forecasting allows authorities to deploy maintenance teams to high-risk zones before major failures occur.
- **Civic Engagement:** Gamification and reputation scores foster active and continuous citizen participation.

---

## Use of AI
### 1. Multimodal Issue Understanding (Gemini)
- Ingests images, video, audio, and text to automatically categorize the issue, estimate severity, and draft comprehensive descriptions.
### 2. Autonomous Agentic Pipeline
- A 5-agent orchestrator handles classification, duplicate detection, community verification delegation, dynamic prioritization, and automated escalation.
### 3. Predictive Civic Intelligence
- Analyzes geospatial and temporal data to forecast future incidents (e.g., predicting waterlogging hotspots before a storm).
### 4. Smart Resolution Verification
- AI visually compares "before" and "after" images uploaded during resolution to mathematically verify that the civic issue was genuinely fixed.

---

## Design Idea and Approach
### System Overview
CivicPulse operates on an event-driven, multi-tier architecture:
1. **Intelligent Ingestion Layer:** Citizens upload multimodal evidence. AI automatically extracts metadata (category, danger score, estimated size).
2. **Community Verification Engine:** Nearby citizens are pinged to confirm or reject the report. A Reputation System dynamically calculates citizen Trust Scores.
3. **Agentic Orchestration:**
   - **Agent 1 (Classification):** Assigns urgency and severity.
   - **Agent 2 (Deduplication):** Uses vector embeddings to merge reports.
   - **Agent 3 (Verification):** Manages the community consensus quorum.
   - **Agent 4 (Prioritization):** Calculates a dynamic priority score based on severity, traffic impact, and proximity to sensitive areas.
   - **Agent 5 (Escalation):** Auto-escalates stale, high-priority issues to higher administrative tiers.

### Core Algorithm Design
#### Prioritization Function
```text
Priority = α * SeverityScore + β * CommunityConfirmations + γ * LocationSensitivity + δ * TimeUnresolved
```
#### Duplicate Detection
```text
SimilarityScore = Cosine(Embedding_New, Embedding_Existing) + SpatialProximityWeight
```

---

## Scalability & Architecture
- **Stateless Micro-services:** The backend is built on Express.js designed for stateless AI inference and background orchestration.
- **Geospatial Processing:** Leverages geospatial storage and MapLibre for seamless clustering of thousands of map points.
- **Real-Time Collaboration:** Firebase Realtime/Firestore syncs map updates, feed changes, and notifications instantly to clients.

### Technologies Used
- **Backend:** Node.js, Express.js
- **Frontend:** React 19, Vite, TailwindCSS, MapLibre GL JS, Recharts
- **Database & Services:** Firebase (Auth, Firestore, Storage)
- **Machine Learning & AI:** 
  - Google Gemini 2.5 (Multimodal extraction, Embeddings)
  - Groq (Fast LLM inference)
- **Deployment:** Docker, Hugging Face Spaces (Backend), Vercel/Netlify/Nginx (Frontend)

<p align="center">
  <img src="https://github.com/Nischaya008/CivicPulseNG/blob/main/assets/Issue.png?raw=true" 
       alt="Issues" 
       width="600">
</p>

---

## Data Strategy
- **Multimodal Inputs:** High-resolution images and audio are parsed by Gemini and securely stored.
- **Vector Embeddings:** Descriptions and extracted contexts are vectorized to enable fast nearest-neighbor duplicate searches.
- **Geospatial Anchoring:** All issues are bound to geographical coordinates, enabling spatial queries (radius search, hotspot clustering).

### Missing Data Handling
- AI seamlessly handles inputs whether provided via image, text description, or audio transcription, offering robust fallback mechanisms.

---

## Evaluation & Testing

### 1. AI Pipeline Performance
- **Classification Accuracy:** Consistently high categorization matching across distinct civic issue categories (e.g., Road Damage vs. Drainage Issue).
- **Inference Latency:** Multimodal processing via Gemini optimized to return rich JSON structures quickly.

### 2. System Performance (Latency & Scalability)
- **End-to-End Latency:** Standard API endpoints respond extremely fast via caching.
- **Real-Time Sync:** Map markers and feed updates propagate near-instantly.
- **Caching Layer:** Heavily requested analytics endpoints (hotspots, trends) utilize an in-memory caching middleware ensuring the DB is not overwhelmed during traffic spikes.

### 3. Failure Modes
| Scenario | Issue | Mitigation |
|----------|------|-----------|
| Network Instability | Media upload failure | PWA offline-first capabilities and background sync |
| Spam Attacks | Fake civic reports | Agent 2 (Deduplication) and community-driven Trust Score penalties |
| AI Hallucination | Incorrect severity assignment | Human-in-the-loop (community voting overrides AI) |

---

## Privacy & Security
- **Anonymized Reporting:** Option to report issues without exposing public identity.
- **Data Pruning:** Rejected media uploads are immediately deleted from temporary storage to optimize space and ensure privacy.
- **Role-Based Access Control:** Strict boundary between Citizen, Verifier, and Admin capabilities.

---

## Feasibility
- Fully deployable on free-tier infrastructure (Firebase Free Tier, Hugging Face Spaces, Google Gemini Free limits).
- Designed as an easily distributable PWA to maximize reach across all socioeconomic classes without requiring heavy app store downloads.

---

## Alternatives Considered
| Approach | Issue |
|--------|------|
| Simple CRUD Ticketing | Leads to overwhelming duplicate spam and no prioritization |
| Human-Only Moderation | Too slow, unscalable for thousands of daily hyperlocal reports |
| Monolithic AI Model | Too rigid; a multi-agent approach allows modular upgrading of specific tasks (e.g., escalation vs. classification) |

---

## How to Run

### Backend
```bash
cd backend
npm install
# Ensure you set up .env with GEMINI_API_KEY, GROQ_API_KEY, and Firebase Admin SDK credentials
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker Deployment (Backend)
```bash
docker build -t civicpulse-backend -f Dockerfile .
docker run -p 7860:7860 -e PORT=7860 civicpulse-backend
```

---

## Repository Structure
```text
civicpulseng/
├── backend/
│   ├── api/
│   │   ├── agents/
│   │   ├── aiService.js
│   │   ├── analyticsService.js
│   │   ├── gamificationService.js
│   │   ├── notificationService.js
│   │   ├── predictionService.js
│   │   ├── severityEngine.js
│   │   └── verificationService.js
│   ├── index.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── lib/
│   │   ├── pages/
│   │   │   ├── Activity.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── Feed.tsx
│   │   │   ├── IssueDetails.tsx
│   │   │   ├── Leaderboard.tsx
│   │   │   ├── NewIssue.tsx
│   │   │   └── Predictions.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docs/
│   ├── Idea.md
│   ├── Milestones.md
│   ├── Deliverables.md
│   └── Agent_History.md
├── Dockerfile
├── Dockerfile.frontend
└── README.md
```

---

## Future Work
- Integration with local municipality ticketing APIs (e.g., Open311) for direct dispatch.
- Edge AI integration to run initial severity checks on-device, saving bandwidth.
- Expansion of the gamification system into localized reward structures (e.g., local business discounts for high trust scores).
