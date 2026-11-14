---
title: NISAR AgroView
emoji: 🌾
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# 🌾🛰️ NISAR AgroView
**Following the Beat of the Agricultural Dance from Orbit using Cloud-Streamed L-Band SAR**

---

## About the Team
> *"Agriculture is a constant dance between climate, soil, and human effort. NISAR AgroView follows the beat of that dance from orbit using Synthetic Aperture Radar (SAR) data, giving a visual voice to agricultural land changes and building accessible tools for a more sustainable farming future."*

## About the Challenge
Earth's surface is an endless dance of natural processes and human activities, but these changes are often difficult to visualize, understand, and communicate. **NISAR AgroView** is an interactive Google Maps-style web application that uses radar remote sensing data from the **NASA-ISRO Synthetic Aperture Radar (NISAR)** mission (`L2 GCOV` products) to track and visualize agricultural surface changes across bounded validation sectors around the world.

---

## ⚡ Key Innovation: HTTP 206 HDF5 Chunk Streaming (99.7% Bandwidth Saved)
A single NISAR Level-2 Geocoded Polarimetric Covariance (`GCOV`) `.h5` granule weighs **6 GB to 9 GB**. Downloading full scenes is impractical for free cloud hosting and field users.

**NISAR AgroView** solves this with a custom **HTTP 206 Partial Content (`Range` header) HDF5 Chunk Streamer** (`pipeline/http_range_h5.py`):
* Connects directly to **NASA Earthdata Cloud (`nisar.asf.earthdatacloud.nasa.gov`)**.
* Streams **only the intersecting `512×512` compressed HDF5 spatial chunks** (~4–20 MB instead of 6,228 MB) for bounded **$10 \times 10\text{ km}$ agricultural validation sectors** at crisp **native $10\text{ m}$ resolution (`frequencyA`)**.
* Exports lossless/near-lossless **WebP overlays** (`< 650 KB` per layer) co-registered on **Google Satellite Hybrid** tiles.

---

## 🔬 Polarimetric L-Band SAR Methodology ($\lambda \approx 24\text{ cm}$)
For each bounded $10 \times 10\text{ km}$ sector across **Date 1 ($t_1$)** and **Date 2 ($t_2$)**:
1. **Co-Pol Backscatter ($\gamma^0_{\text{HHHH}}$ in $\text{dB}$)**: Tracks surface roughness, soil moisture dielectric increases, and specular reflection over flooded rice paddies ($\gamma^0_{\text{HHHH}} < -16\text{ dB}$).
2. **Cross-Pol Backscatter ($\gamma^0_{\text{HVHV}}$ in $\text{dB}$)**: Tracks volumetric depolarization inside crop canopies (biomass growth vs. harvest clearance).
3. **Dual-Pol Radar Vegetation Index ($\text{RVI}$)**:
   $$\text{RVI} = \frac{4 \cdot \gamma^0_{\text{HVHV}}}{\gamma^0_{\text{HHHH}} + \gamma^0_{\text{HVHV}}}$$
4. **UAVSAR-Style Polarimetric RGB Composite**: `R: HHHH (dB)`, `G: HVHV (dB)`, `B: HHHH - HVHV (dB)`.
5. **Interactive Field Inspector & Time-Series Chart**: Click any agricultural block on the Google Satellite map to inspect its dual-date telemetry table and 12-day cycle $\text{dB}$ / $\text{RVI}$ time-series curve.

---

## 🛰️ Official NASA Data & Resources Used
* **[NASA Earthdata Search](https://search.earthdata.nasa.gov/search)**: Data discovery, comparison, and spatial search across NASA's Earth science holdings.
* **[ASF Data Search Vertex](https://search.asf.alaska.edu/)**: Primary SAR archive operated by the Alaska Satellite Facility (ASF) powering our `asf_search` queries and HTTP 206 streaming.
* **[NISAR Data User Guide](https://nisar-docs.asf.alaska.edu/)**: Reference specification for reading `/science/LSAR/GCOV/grids/frequencyA`, UTM projections, and $\gamma^0$ radiometric terrain correction.
* **[Intro to Remote Sensing](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing)**: Foundation for active vs. passive sensing and all-weather cloud penetration.
* **[Intro to Synthetic Aperture Radar (SAR)](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar)**: Scattering physics (Specular, Rough Surface, Volume) used in our Field Inspector explanations.
* **[NASA ARSET Trainings](https://appliedsciences.nasa.gov/get-involved/training)**: Dual-polarization agricultural monitoring and $\text{RVI}$ calculation workflow.
* **[NISAR StoryMaps](https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/)**: Visual narrative inspiration for our sector headlines and agricultural storytelling.
* **[NISAR Applications White Papers](https://nisar.jpl.nasa.gov/applications/societal-benefit/)**: Societal benefit indicators for agricultural monitoring, soil moisture, and food security.
* **[UAVSAR Postcards](https://uavsar.jpl.nasa.gov/education/postcards.html)**: False-color RGB polarimetric composite design for Date 1 and Date 2 layers.

---

## 🚀 Running Locally

```bash
# 1. Activate your Conda environment
conda activate nisar

# 2. (Optional) Rebuild the 4 preloaded global 10m sectors
python pipeline/build_preloaded_sectors.py

# 3. Start the web server (default: http://localhost:7860)
python app.py
```

---

## ☁️ Free Online Deployment Options (\$0 Cost)

### Option 1: Hugging Face Spaces (Recommended for Live Python Streaming + Preloaded Sectors)
1. Create a free Space at [huggingface.co/spaces](https://huggingface.co/spaces) and select **Docker** as the SDK.
2. Add `NASA_USER` and `NASA_PASS` under **Settings → Variables and secrets** (optional, for live on-demand sector streaming; the 4 preloaded global sectors work immediately without credentials).
3. Push this folder (`NISAR-AgroView`) to your Space repository. The included `Dockerfile` and `README.md` YAML header automatically launch the app on port `7860`.

### Option 2: Render.com Free Web Service
1. Create a new **Web Service** on [render.com](https://render.com) connected to your GitHub repo.
2. Runtime: **Docker** (or **Python 3** with Build Command `pip install -r requirements.txt` and Start Command `python app.py`).

### Option 3: GitHub Pages / Vercel / Netlify (Zero-Server Static Hosting)
Because all 4 global $10 \times 10\text{ km}$ $10\text{ m}$ sectors and WebP overlays are pre-built inside `static/`, you can also host `static/` directly on **GitHub Pages, Vercel, or Netlify** with zero backend configuration.

