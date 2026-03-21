/* ============================================================
   routes.js v4 — Pre-loaded trail library with real
   per-point elevation profiles, waypoints, and metadata
   ============================================================ */

'use strict';

const PRELOADED_ROUTES = [
  {
    id: 'preikestolen',
    name: 'Preikestolen',
    region: 'Ryfylke',
    difficulty: 'Moderate',
    description: 'Iconic Pulpit Rock hike. 604m plateau above Lysefjord.',
    distance: 7800,
    elevation: 334,
    color: '#4ade80',
    // Real-ish elevation profile: starts at trailhead ~12m, climbs to ~604m at the Rock
    latlngs: [
      [58.9864,6.1899],[58.9868,6.1914],[58.9872,6.1929],[58.9876,6.1945],
      [58.9880,6.1961],[58.9884,6.1978],[58.9888,6.1996],[58.9892,6.2014],
      [58.9895,6.2033],[58.9898,6.2052],[58.9901,6.2071],[58.9904,6.2090],
      [58.9907,6.2109],[58.9910,6.2129],[58.9913,6.2148],[58.9916,6.2167],
      [58.9919,6.2186],[58.9922,6.2205],[58.9925,6.2224],[58.9928,6.2243],
      [58.9931,6.2261],[58.9934,6.2279],[58.9937,6.2296],[58.9940,6.2313],
      [58.9943,6.2330],[58.9946,6.2346],[58.9949,6.2362],[58.9952,6.2377],
      [58.9955,6.2392],[58.9958,6.2406],[58.9961,6.2419],[58.9964,6.2430],
      [58.9967,6.2439],[58.9970,6.2447],[58.9973,6.2452],[58.9976,6.2454],
    ],
    elevations: [
       12, 18, 28, 42, 62, 85,108,130,152,170,185,198,
      212,228,248,268,288,308,326,342,356,370,385,400,
      415,428,440,451,462,472,482,490,497,501,604,604,
    ],
    waypoints: [
      { lat:58.9864, lon:6.1899, name:'Preikestolen Fjellstue', note:'Trailhead parking & café' },
      { lat:58.9920, lon:6.2190, name:'Viewpoint Refsvatn', note:'Lake viewpoint, good rest spot ~mid-route' },
      { lat:58.9976, lon:6.2454, name:'Preikestolen Summit', note:'604m · Pulpit Rock plateau' },
    ],
  },
  {
    id: 'kjeragbolten',
    name: 'Kjeragbolten',
    region: 'Lysefjord',
    difficulty: 'Hard',
    description: 'The famous boulder wedged in a crevice at 984m. Chain-assisted scrambling.',
    distance: 10200,
    elevation: 622,
    color: '#f97316',
    latlngs: [
      [59.0330,6.5720],[59.0324,6.5733],[59.0317,6.5747],[59.0310,6.5762],
      [59.0303,6.5777],[59.0296,6.5793],[59.0289,6.5810],[59.0283,6.5827],
      [59.0277,6.5845],[59.0271,6.5864],[59.0266,6.5883],[59.0261,6.5902],
      [59.0257,6.5921],[59.0254,6.5941],[59.0252,6.5961],[59.0251,6.5981],
      [59.0251,6.6001],[59.0252,6.6021],[59.0254,6.6040],[59.0257,6.6059],
      [59.0260,6.6077],[59.0263,6.6094],[59.0265,6.6110],[59.0267,6.6124],
    ],
    elevations: [
       38, 55, 80,115,160,210,265,320,375,420,460,495,
      525,548,565,578,588,594,598,601,603,984,984,984,
    ],
    waypoints: [
      { lat:59.0330, lon:6.5720, name:'Øygardstøl Trailhead', note:'Car park & toilets' },
      { lat:59.0263, lon:6.6094, name:'First Chain', note:'Steep chain-assisted scramble section' },
      { lat:59.0267, lon:6.6124, name:'Kjeragbolten', note:'984m · The famous boulder in the crevice' },
    ],
  },
  {
    id: 'trolltunga',
    name: 'Trolltunga',
    region: 'Hardanger',
    difficulty: 'Hard',
    description: "Norway's most dramatic cliff edge, 700m above Lake Ringedalsvatnet.",
    distance: 27000,
    elevation: 868,
    color: '#38bdf8',
    latlngs: [
      [60.1288,6.7289],[60.1298,6.7308],[60.1310,6.7330],[60.1323,6.7354],
      [60.1336,6.7380],[60.1348,6.7407],[60.1359,6.7435],[60.1369,6.7463],
      [60.1378,6.7491],[60.1386,6.7520],[60.1393,6.7550],[60.1398,6.7581],
      [60.1403,6.7612],[60.1406,6.7643],[60.1408,6.7675],[60.1409,6.7707],
      [60.1408,6.7739],[60.1407,6.7771],[60.1405,6.7803],[60.1402,6.7833],
      [60.1400,6.7862],[60.1398,6.7889],[60.1396,6.7914],[60.1394,6.7936],
    ],
    elevations: [
       843,870,910,960,1010,1040,1060,1075,1082,1084,1082,1078,
      1074,1068,1060,1052,1044,1038,1048,1060,1072,1082,1087,1110,
    ],
    waypoints: [
      { lat:60.1288, lon:6.7289, name:'Skjeggedal', note:'Upper trailhead (shuttle bus from Tyssedal)' },
      { lat:60.1409, lon:6.7707, name:'Plateau Cairn', note:'Highest point of the route ~1110m' },
      { lat:60.1394, lon:6.7936, name:'Trolltunga', note:'1110m · The Troll\'s Tongue cliff' },
    ],
  },
  {
    id: 'ulriken',
    name: 'Ulriken',
    region: 'Bergen',
    difficulty: 'Easy',
    description: 'Highest of Bergen\'s seven mountains. Gondola or trail to the summit at 643m.',
    distance: 4600,
    elevation: 618,
    color: '#a78bfa',
    latlngs: [
      [60.3830,5.3761],[60.3821,5.3774],[60.3812,5.3789],[60.3803,5.3806],
      [60.3795,5.3824],[60.3788,5.3843],[60.3782,5.3864],[60.3777,5.3885],
      [60.3773,5.3908],[60.3770,5.3930],[60.3768,5.3953],[60.3767,5.3975],
      [60.3766,5.3997],[60.3766,5.4018],[60.3766,5.4038],[60.3767,5.4057],
      [60.3768,5.4076],[60.3769,5.4093],[60.3770,5.4109],[60.3771,5.4123],
    ],
    elevations: [
       25, 45, 72,105,145,188,232,276,318,356,390,420,
      448,472,494,513,529,542,552,643,
    ],
    waypoints: [
      { lat:60.3830, lon:5.3761, name:'Ulriksbanen (Gondola)', note:'Optional cable car from here' },
      { lat:60.3768, lon:5.3953, name:'Viewpoint Mid-trail', note:'Good view of Byfjorden' },
      { lat:60.3771, lon:5.4123, name:'Ulriken Summit', note:'643m · TV tower & café at top' },
    ],
  },
  {
    id: 'gaustatoppen',
    name: 'Gaustatoppen',
    region: 'Telemark',
    difficulty: 'Moderate',
    description: "Norway's most visited mountain. 360° view from 1883m on a clear day.",
    distance: 9400,
    elevation: 855,
    color: '#fbbf24',
    latlngs: [
      [59.8530,8.6520],[59.8522,8.6543],[59.8514,8.6568],[59.8505,8.6594],
      [59.8496,8.6621],[59.8487,8.6649],[59.8478,8.6677],[59.8469,8.6706],
      [59.8461,8.6735],[59.8453,8.6764],[59.8446,8.6793],[59.8440,8.6823],
      [59.8435,8.6853],[59.8431,8.6883],[59.8428,8.6913],[59.8426,8.6943],
      [59.8426,8.6973],[59.8427,8.7003],[59.8429,8.7032],[59.8432,8.7060],
      [59.8435,8.7086],[59.8438,8.7110],[59.8441,8.7131],[59.8444,8.7149],
    ],
    elevations: [
      1028,1050,1078,1112,1150,1192,1232,1270,1305,1338,1368,1396,
      1420,1442,1460,1475,1487,1497,1505,1572,1670,1760,1840,1883,
    ],
    waypoints: [
      { lat:59.8530, lon:8.6520, name:'Gaustablikk Trailhead', note:'Ski resort parking, 1028m start' },
      { lat:59.8428, lon:8.6913, name:'Rocky Shoulder', note:'Route becomes rockier here — poles helpful' },
      { lat:59.8444, lon:8.7149, name:'Gaustatoppen Summit', note:'1883m · Norway\'s most visited mountain' },
    ],
  },
];

const DIFFICULTY_COLORS = { Easy:'#4ade80', Moderate:'#fbbf24', Hard:'#f87171' };

const ACTIVITY_ICONS = {
  Run:'🏃', Ride:'🚴', Walk:'🚶', Hike:'🥾',
  NordicSki:'⛷', Swim:'🏊', Kayaking:'🛶',
  VirtualRide:'🚴', TrailRun:'🏃', Workout:'💪',
  default:'⚡',
};

function fmtDist(m) {
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds/3600);
  const m = Math.floor((seconds%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Haversine distance between two [lat,lon] pairs (metres)
function haversineDist(a, b) {
  const R = 6371000;
  const φ1 = a[0]*Math.PI/180, φ2 = b[0]*Math.PI/180;
  const Δφ = (b[0]-a[0])*Math.PI/180;
  const Δλ = (b[1]-a[1])*Math.PI/180;
  const x = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// Nearest distance from a point to a polyline (metres)
function distToRoute(lat, lon, latlngs) {
  let minDist = Infinity;
  for (const ll of latlngs) {
    const d = haversineDist([lat,lon], [ll[0],ll[1]]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}
