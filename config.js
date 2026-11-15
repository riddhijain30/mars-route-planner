/**
 * ARES-IV Mars EVA Planner Configuration
 * Mission Focus: Gale Crater & Aeolis Mons (Mount Sharp) Boxwork Formation Traverse
 */
window.MARS_CONFIG = {
  WORLD_SIZE: 240,
  GRID_SEGMENTS: 256,

  // Official IAU Mars Geodetic & Orbital Constants
  MARS: {
    A: 3396190,
    B: 3376200,
    MEAN: 3389500,
    GRAVITY: 3.71,
    OBLIQ: 25.19,
    SOL_H: 24.6597,
    PERI_LS: 251,
    ECC: 0.0934,
    SMA_AU: 1.5237,
  },
  DEFAULT_LS: 341,

  // Official NASA Mars / USGS Planetary Data System Basemaps & Sensor Metadata
  GLOBE: {
    RADIUS: 100,
    RELIEF: 10,
    TEXTURE_URL:
      'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/0/0/0.jpg',
    SPANS_NEG180: true,
  },

  SENSOR_SPECS: {
    MOLA: {
      name: 'MGS MOLA DEM',
      resolution: '~463 m/px',
      role: 'Regional elevation, broad slopes & macro route planning',
      limitation: 'Cannot resolve rocks, boulder fields, narrow crevices, or loose regolith.',
    },
    THEMIS: {
      name: 'Mars Odyssey THEMIS IR',
      resolution: '~100 m/px',
      role: 'Thermal inertia & bedrock exposure context',
      limitation: 'Sub-100m thermal anomalies remain unresolved.',
    },
  },

  SITES: [
    { name: 'Gale Crater (Boxwork Sector)', lat: -4.65, lon: 137.44 },
    { name: 'Jezero Crater', lat: 18.4447, lon: 77.4508 },
    { name: 'Meridiani Planum', lat: -1.9462, lon: 354.4734 },
    { name: 'Gusev Crater', lat: -14.5718, lon: 175.4785 },
    { name: 'Olympus Mons', lat: 18.65, lon: 226.2 },
  ],

  BASE_DATUM_METERS: -4520,
  ELEVATION_SCALE_METERS: 24.5,
  DEFAULT_EXAGGERATION: 1.4,

  WAYPOINT_PIN_OFFSET: 0.22,
  PATH_RIBBON_OFFSET: 0.48,
  ROVER_TRACK_OFFSET: 0.38,

  ORIGIN_LAT: -4.65,
  ORIGIN_LON: 137.44,
  DEG_PER_UNIT: 0.0011,
  METERS_PER_UNIT: 65.0,

  MOBILITY_PROFILES: {
    suit: {
      name: 'Suited Astronaut EVA',
      speedKmH: 2.2,
      maxBudgetH: 8.0,
      upPenalty: 0.14,
      downPenalty: 0.05,
    },
    rover: {
      name: 'Pressurized Rover',
      speedKmH: 8.0,
      maxBudgetH: 24.0,
      upPenalty: 0.06,
      downPenalty: 0.02,
    },
    bot: {
      name: 'Scout Microrover',
      speedKmH: 1.2,
      maxBudgetH: 12.0,
      upPenalty: 0.10,
      downPenalty: 0.04,
    },
  },

  PALETTE: {
    basaltDark: 0x1c0f0a,
    ironOxide: 0x6b2f18,
    ochreMid: 0xa64d24,
    dustAmber: 0xd97b38,
    highlandSand: 0xe8a86b,
    routePrimary: 0xf59e42,
    routeCore: 0xfff0d4,
    routeHazard: 0xe0533c,
    roverTrack: 0xd96b27,
    contourLine: 0x5c2812,
  },

  NASA_API: {
    MSL_WEATHER_URL:
      'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json',
    IMAGE_SEARCH_URL:
      'https://images-api.nasa.gov/search?q=Curiosity%20Gale%20Crater%20Mount%20Sharp%20boxwork&media_type=image',
  },

  MISSION_BRIEF: {
    id: 'ARES-IV-BXW-01',
    title: 'Mount Sharp Boxwork Formation EVA Traverse',
    objective:
      'Traverse from Gale Crater floor staging across sulfate-bearing strata to sample mineralized boxwork fracture ridges on lower Aeolis Mons while avoiding >18° scarps.',
    demSource: 'Validated Numerical DEM (MOLA Calibrated Gale Sector Grid)',
  },

  MOUNT_SHARP_PRESET: {
    defaultWaypoints: [
      { x: -36, z: -28, label: 'Staging Base (Glen Torridon Margin)' },
      { x: -4, z: -4, label: 'Greenheugh Pediment Approach' },
      { x: 26, z: 20, label: 'West Boxwork Ridge (Vein Sample A)' },
      { x: 46, z: 36, label: 'Central Boxwork Polygon Core (Target)' },
    ],
    historicalWaypoints: [
      { x: -78, z: -72, label: 'Bradbury Landing (MSL Touchdown)' },
      { x: -64, z: -55, label: 'Pahrump Hills (Murray Formation)' },
      { x: -46, z: -38, label: 'Murray Buttes (Eolian Sandstones)' },
      { x: -24, z: -22, label: 'Vera Rubin Ridge (Hematite Rich)' },
      { x: -2, z: -6, label: 'Glen Torridon (Clay-Bearing Unit)' },
      { x: 22, z: 14, label: 'Greenheugh Pediment (Unconformity)' },
      { x: 44, z: 34, label: 'Marker Band Valley (2025 Boxwork Units)' },
      { x: 64, z: 58, label: 'Gediz Vallis Ridge (Debris Flow)' },
    ],
  },

  VIEWCUBE_VIEWS: {
    FRONT: [0, 0.08, 1],
    BACK: [0, 0.08, -1],
    RIGHT: [1, 0.08, 0],
    LEFT: [-1, 0.08, 0],
    TOP: [0, 1, 0.001],
    BOTTOM: [0, -1, 0.001],
    TOP_FRONT: [0, 0.85, 0.85],
    TOP_BACK: [0, 0.85, -0.85],
    TOP_RIGHT: [0.85, 0.85, 0],
    TOP_LEFT: [-0.85, 0.85, 0],
    BOTTOM_FRONT: [0, -0.85, 0.85],
    BOTTOM_BACK: [0, -0.85, -0.85],
    BOTTOM_RIGHT: [0.85, -0.85, 0],
    BOTTOM_LEFT: [-0.85, -0.85, 0],
    FRONT_RIGHT: [0.85, 0.12, 0.85],
    FRONT_LEFT: [-0.85, 0.12, 0.85],
    BACK_RIGHT: [0.85, 0.12, -0.85],
    BACK_LEFT: [-0.85, 0.12, -0.85],
    TOP_FRONT_RIGHT: [0.78, 0.72, 0.78],
    TOP_FRONT_LEFT: [-0.78, 0.72, 0.78],
    TOP_BACK_RIGHT: [0.78, 0.72, -0.78],
    TOP_BACK_LEFT: [-0.78, 0.72, -0.78],
    BOTTOM_FRONT_RIGHT: [0.78, -0.72, 0.78],
    BOTTOM_FRONT_LEFT: [-0.78, -0.72, 0.78],
    BOTTOM_BACK_RIGHT: [0.78, -0.72, -0.78],
    BOTTOM_BACK_LEFT: [-0.78, -0.72, -0.78],
  },
};