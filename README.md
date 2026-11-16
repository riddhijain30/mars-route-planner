# 🔴 ARES-IV: Mars EVA Planning Web Application
### Gale Crater & Aeolis Mons (Mount Sharp) Boxwork Formation Traverse

[![NASA Data](https://img.shields.io/badge/Data-NASA%20PDS%20%2F%20Mars%20Trek-blue)](https://trek.nasa.gov/)
[![Three.js](https://img.shields.io/badge/3D%20Engine-Three.js-orange)](https://threejs.org/)
[![Status](https://img.shields.io/badge/Status-Operational-success)](index.html)
Version 9 Demo- https://drive.google.com/file/d/1WfPiErPLrX0Q0zYQuEXxssgXwMeuJJnr/view?usp=sharing
Version 8 Demo- https://drive.google.com/drive/folders/1dk66yGhtr-PM37IhiiqY3AtL0nOgoJjj

A high-fidelity, interactive web application designed for EVA (Extravehicular Activity) route planning, terrain traversal analysis, and multi-scale orbital data visualization across Gale Crater and the boxwork sulfate formations of Aeolis Mons (Mount Sharp) on Mars.

---

## 🚀 Key Features

* **Dual-View Exploration Engine**:
  * **2D Terrain Traversal View**: Interactive grid-based surface analysis supporting waypoint dropping, elevation profile inspection, and adaptive $A^*$ pathfinding.
  * **3D Global Mars Globe**: An interactive Three.js-powered 3D globe with real-time orbit controls, surface raycasting, and selectable orbital basemap layers.
* **Official NASA & USGS Data Integration**:
  * **MGS MOLA Grids** ($\approx 463\text{ m/px}$) for regional topography, broad slopes, and macro-scale route planning.
  * **Viking MDIM2.1** global optical basemaps ($\approx 232\text{ m/px}$) and **Mars Odyssey THEMIS IR** thermal inertia layers ($\approx 100\text{ m/px}$) for bedrock and dust trap identification.
* **Real-Time Martian Telemetry**:
  * Live surface weather feeds queried directly from the **NASA Mars Science Laboratory (MSL) REMS Weather API** (displaying actual Gale Crater temperatures, atmospheric pressure, and solar longitude $L_s$).
* **Advanced EVA Constraints & Budgets**:
  * Slope hazard detection (restricting paths exceeding $18^\circ$ scarps).
  * Real-time life-support budgeting and round-trip duration calculations for suited astronauts, pressurized rovers, and scout microrovers.
* **Engineering Verification Suite**:
  * Built-in automated test suites validating numerical Digital Elevation Models (DEM), pathfinding cost functions, and geodetic coordinate transforms.

---

## 📂 Project Architecture

The application is built using a modular, dependency-free vanilla JavaScript architecture:

```text
mars-eva-planner/
├── index.html          # Main application layout and UI containers
├── css/
│   └── styles.css      # Custom dark-theme aerospace HUD styling
├── js/
│   ├── config.js       # Mission constants, NASA API endpoints, and global profiles
│   ├── globe.js        # Three.js 3D globe, raycasting, and orbital basemap switcher
│   ├── terrain.js      # 2D heightmap generation, slope analysis, and visual shaders
│   ├── routing.js      # Adaptive A* pathfinding and hazard-avoidance algorithms
│   ├── views.js        # Mars geodetic, solar position, and thermal math utilities
│   └── main.js         # Core application controller, UI event binders, and telemetry loops
└── assets/             # Textures and static planetary imagery
