# 🧪 SupplementLens

> **Empowering consumers with objective, data-driven supplement analysis, algorithmic purity scoring, and real community insights.**

![GitHub repo size](https://img.shields.io/github/repo-size/kartikxdd/SupplementLens?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/kartikxdd/SupplementLens?style=flat-square)
![GitHub license](https://img.shields.io/badge/license-MIT-blue.style=flat-square)

---

## 📌 Overview

**SupplementLens** is a modern web application designed to eliminate information asymmetry, label opacity, and marketing hype in the dietary supplement industry. By standardizing nutritional disclosures and ingredient lists across leading protein powders and health supplements, SupplementLens provides consumers with an unbiased evaluation of what is *actually* in their tub.

The core engine features a **deductive Purity Score algorithm** (5.0 baseline) that penalizes hidden fillers, artificial sweeteners, and ambiguous allergen declarations while rewarding verified macronutrient density and label transparency.

---

## ✨ Key Features

- 🔬 **Deductive Purity Scoring Engine:** Algorithmic calculation evaluating ingredient lists, filler presence (e.g., Maltodextrin), sweetener profiles (e.g., Sucralose/INS 955), and exact protein density per gram.
- ⚡ **Dynamic Per-Gram Analysis:** Real-time frontend evaluation of `caloriesPerGram`, `proteinPerGram`, and active macro ratios across 110+ products.
- 🌾 **Allergen & Dietary Filtering:** Precise breakdown distinguishing direct ingredients (`contains`) from facility cross-contamination warnings (`mayContain`), alongside `lactoseFree` and `vegan` flags.
- 👤 **Personalized User Profiles:** Supabase-backed authentication matching individual dietary goals and health restrictions directly with suitable supplements.
- 💬 **Multi-Tiered Review System:** Clear separation between objective algorithmic scores, verified user-submitted community reviews, and aggregated marketplace sentiment.

---

## 🛠 Tech Stack

- **Frontend:** HTML5, CSS3 (Tailwind CSS), Vanilla JavaScript (ES6+)
- **Backend / BaaS:** [Supabase](https://supabase.com/) (Auth, PostgreSQL database, RLS security)
- **Data Catalog:** Standardized JSON schemas (`SupplementLens/batches/`)
- **Hosting:** GitHub Pages

---

## 📁 Repository Structure

```text
SupplementLens/
├── batches/                    # Modular JSON data batches (110+ products)
│   ├── batch_01.json
│   ├── batch_02.json
│   └── ...
├── api.js                      # API endpoints & dynamic data fetching
├── app.js                      # Main application logic & Purity Rating engine
├── auth.js / auth.html         # User authentication handling (Supabase)
├── compare.html                # Multi-product comparison view
├── data.js                     # Centralized product catalog loader
├── explore.js / explore.html   # Product catalog, filters, & search
├── profile.html                # User profile & saved supplement stack
├── shared.js                   # Common utilities & helpers
├── styles.css                  # Custom styling & Tailwind configuration
├── supabase-client.js          # Supabase client initialization
└── supabase-profile-setup.sql  # SQL database schemas & review tables
```

---

## 📊 How the Purity Rating Engine Works

Every supplement starts with a **Baseline Rating of 5.0 ★**. Points are subtracted based on verified risk factors extracted from product label disclosures:

$$\text{Purity Score} = 5.0 - \sum \text{Deductions}$$

### Penalty Matrix:
1. **Fillers & Cheap Additives:** Subtracts up to **$-0.5$** for cheap fillers like Maltodextrin.
2. **Artificial Sweeteners:** Subtracts **$-0.3$** for intense artificial sweeteners (e.g., Sucralose / INS 955, Acesulfame K).
3. **Macro Quality:** Deducts points if protein density (`proteinPerGram`) falls below $0.70\text{g/g}$ serving size.
4. **Label Opacity:** Deducts **$-0.4$** for missing or unverified allergen declarations.

---

## 🚀 Getting Started Locally

### Prerequisites
- A modern web browser (Chrome, Brave, Firefox, Edge)
- A local web server extension (e.g., Live Server for VS Code / Cursor) or Node.js

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kartikxdd/SupplementLens.git
   cd SupplementLens
   ```

2. **Setup Supabase Environment:**
   Create a `supabase-config.js` file or update `supabase-client.js` with your project credentials:
   ```javascript
   const SUPABASE_URL = "https://your-project.supabase.co";
   const SUPABASE_ANON_KEY = "your-anon-key";
   ```

3. **Run the application:**
   - Launch `index.html` using **Live Server** in Cursor/VS Code, or serve using Python:
     ```bash
     python -m http.server 8000
     ```
   - Open `http://localhost:8000` in your browser.

---

## 🗺 Roadmap & Future Expansion

- [ ] **AI-Powered OCR Report Ingestion:** Direct parsing of user blood tests (e.g., Vitamin D3, B12, Ferritin) to auto-recommend target supplements.
- [ ] **Automated Price Tracking:** Asynchronous Web Scrapers to monitor dynamic price-per-gram shifts across e-commerce platforms.
- [ ] **Mobile App Deployment:** Cross-platform React Native app with on-device barcode label scanning.
- [ ] **Direct Lab Certification Pipelines:** Automated data ingestion from NABL / Trustified independent testing labs.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Crafted with ❤️ for transparent nutrition.
</p>