/**
 * ARES-IV Mars Multi-Mission EVA Planner Configuration
 * True IAU-2000 Mars Ellipsoid, NASA Mars Trek WMTS Endpoints,
 * Local USGS MOLA Patch Index, Mobility Systems, and Official Rover Traverses.
 */
window.MARS_CONFIG = {
  MARS_RADIUS_EQ: 3396190.0,
  MARS_RADIUS_POLAR: 3376200.0,
  DEM_W: 1024,
  DEM_H: 512,


  MOBILITY_PROFILES: {
    suit:  { name: 'Suited Astronaut',  speedKmH: 2.2, maxBudgetH: 8.0,  upPenalty: 0.14, downPenalty: 0.05 },
    rover: { name: 'Pressurized Rover', speedKmH: 8.0, maxBudgetH: 24.0, upPenalty: 0.06, downPenalty: 0.02 },
    bot:   { name: 'Scout Microrover',  speedKmH: 1.2, maxBudgetH: 12.0, upPenalty: 0.10, downPenalty: 0.04 }
  },


  NASA_API: {
    MSL_WEATHER_URL: 'https://api.maas2.apollorion.com/',
    MOLA_TILE_0_REMOTE: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m/1.0.0/default/default028mm/0/0/0.jpg',
    MOLA_TILE_1_REMOTE: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m/1.0.0/default/default028mm/0/0/1.jpg',
    WMTS_VIKING: 'https://trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    WMTS_MOLA_HILLSHADE: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    WMTS_THEMIS_IR: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.png'
  },


  DATA: {
    GLOBAL_JSON: ['./data/mola_global.json', './mola_verified_dem.json'],
    GLOBAL_TILES: ['./mola_0.jpg', './mola_1.jpg'],
    PATCH_INDEX: './data/patches/index.json',
    USE_PROXIES: true
  },


  SITES: {
    gale: {
      key: 'gale',
      name: 'Gale Crater (Aeolis Mons / Mount Sharp)',
      query: 'Curiosity Rover Gale Crater Mount Sharp',
      mission: 'MSL Curiosity',
      science: 'Mount Sharp layered sulfates, clay transitions, and 2025 boxwork formations',
      lon: 137.44, lat: -4.59, alt: 165000,
      benchmarkWaypoints: [
        { lon: 137.4417, lat: -4.5895, label: 'Bradbury Landing' },
        { lon: 137.4050, lat: -4.6650, label: 'Vera Rubin Ridge' },
        { lon: 137.3850, lat: -4.7150, label: 'Marker Band (2025 Boxwork Units)' }
      ]
    },
    jezero: {
      key: 'jezero',
      name: 'Jezero Crater (Perseverance)',
      query: 'Perseverance Rover Jezero Crater Mastcam',
      mission: 'Mars 2020 / MRO HiRISE',
      science: 'Ancient river delta & lacustrine biosignature search',
      lon: 77.45, lat: 18.44, alt: 165000,
      benchmarkWaypoints: [
        { lon: 77.4508, lat: 18.4447, label: 'Octavia E. Butler Landing' },
        { lon: 77.4180, lat: 18.4490, label: 'Three Forks Depot' },
        { lon: 77.3780, lat: 18.4710, label: 'Western Delta Rim' }
      ]
    },
    valles: {
      key: 'valles',
      name: 'Valles Marineris (Melas Chasma)',
      query: 'Valles Marineris Melas Chasma Mars Orbiter',
      mission: 'Mars Odyssey / MGS',
      science: 'Exposed crustal stratigraphy & canyon landslides',
      lon: -72.00, lat: -10.50, alt: 480000,
      benchmarkWaypoints: [
        { lon: -72.18, lat: -10.42, label: 'Chasma Floor Base' },
        { lon: -71.85, lat: -10.58, label: 'Fault Scarp Bench' }
      ]
    },
    olympus: {
      key: 'olympus',
      name: 'Olympus Mons Caldera',
      query: 'Olympus Mons caldera Mars Express orbiter',
      mission: 'MGS / Mars Express',
      science: 'Basaltic shield volcanism & summit collapse craters',
      lon: -133.80, lat: 18.65, alt: 680000,
      benchmarkWaypoints: [
        { lon: -133.92, lat: 18.58, label: 'Caldera West Rim' },
        { lon: -133.68, lat: 18.72, label: 'Summit Collapse Bench' }
      ]
    },
    insight: {
      key: 'insight',
      name: 'Elysium Planitia (InSight)',
      query: 'InSight Lander Elysium Planitia seismometer',
      mission: 'InSight Discovery',
      science: 'Interior crustal thickness, marsquakes & heat flow',
      lon: 135.62, lat: 4.50, alt: 220000,
      benchmarkWaypoints: [
        { lon: 135.623, lat: 4.502, label: 'Homestead Hollow' },
        { lon: 135.680, lat: 4.540, label: 'Seismic Array North' }
      ]
    },
    viking1: {
      key: 'viking1',
      name: 'Chryse Planitia (Viking 1)',
      query: 'Viking 1 Lander Chryse Planitia surface',
      mission: 'Viking 1',
      science: 'First in-situ Martian regolith & flood plain analysis',
      lon: -47.95, lat: 22.27, alt: 220000,
      benchmarkWaypoints: [
        { lon: -47.95, lat: 22.27, label: 'Thomas Mutch Station' },
        { lon: -47.88, lat: 22.33, label: 'Outflow Channel Ridge' }
      ]
    }
  },


  ROVER_TRAVERSES: {
    curiosity: [
      { lon: 137.4417, lat: -4.5895, name: 'Bradbury Landing' },
      { lon: 137.4250, lat: -4.6150, name: 'Pahrump Hills' },
      { lon: 137.4010, lat: -4.6480, name: 'Vera Rubin Ridge' },
      { lon: 137.3850, lat: -4.6820, name: 'Glen Torridon' },
      { lon: 137.3780, lat: -4.7150, name: 'Marker Band (2025 Boxwork)' },
      { lon: 137.3920, lat: -4.7450, name: 'Gediz Vallis Ridge' }
    ],
    perseverance: [
      { lon: 77.4508, lat: 18.4447, name: 'Octavia E. Butler Landing' },
      { lon: 77.4450, lat: 18.4380, name: 'Séítah Formation' },
      { lon: 77.4180, lat: 18.4490, name: 'Three Forks Sample Depot' },
      { lon: 77.3920, lat: 18.4630, name: 'Jezero Western Fan' },
      { lon: 77.3780, lat: 18.4710, name: 'Neretva Vallis Margin' }
    ]
  },


  VIEWCUBE_ORIENTATIONS: {
    TOP:             { headingDeg: 0,   pitchDeg: -89, distMult: 1.0 },
    BOTTOM:          { headingDeg: 0,   pitchDeg: -89, distMult: 0.5 },
    FRONT:           { headingDeg: 0,   pitchDeg: -22, distMult: 0.65 },
    BACK:            { headingDeg: 180, pitchDeg: -22, distMult: 0.65 },
    RIGHT:           { headingDeg: 90,  pitchDeg: -22, distMult: 0.65 },
    LEFT:            { headingDeg: 270, pitchDeg: -22, distMult: 0.65 },
    TOP_FRONT:       { headingDeg: 0,   pitchDeg: -45, distMult: 0.8 },
    TOP_BACK:        { headingDeg: 180, pitchDeg: -45, distMult: 0.8 },
    TOP_RIGHT:       { headingDeg: 90,  pitchDeg: -45, distMult: 0.8 },
    TOP_LEFT:        { headingDeg: 270, pitchDeg: -45, distMult: 0.8 },
    TOP_FRONT_RIGHT: { headingDeg: 45,  pitchDeg: -38, distMult: 0.75 },
    TOP_FRONT_LEFT:  { headingDeg: 315, pitchDeg: -38, distMult: 0.75 },
    TOP_BACK_RIGHT:  { headingDeg: 135, pitchDeg: -38, distMult: 0.75 },
    TOP_BACK_LEFT:   { headingDeg: 225, pitchDeg: -38, distMult: 0.75 }
  }
};

