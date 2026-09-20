const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { NODES, EDGES } = require('./nerNetwork');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkSupabaseConfig() {
  if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('your-project-id')) {
    console.error('[Supabase Seed] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env before running seed.');
    console.log('Please configure your Supabase credentials in backend/.env');
    return false;
  }
  return true;
}

let supabase = null;
if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project-id')) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const DEFAULT_PASSWORD = 'sahayak123';
const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 8);

// =============================================================================
// 1. PROFILES DATA (Idempotent seed data)
// =============================================================================

// Exactly 10 Registered Drivers (must remain unchanged)
const DRIVER_PROFILES = [
  { id: '11111111-1111-4000-8000-000000000001', name: 'Arjun Bora', email: 'arjun@ner-sahayak.in', phone: '+91 98765 43210', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'AS 01 K 4309', state: 'Assam', district: 'Kamrup Metropolitan', language: 'as', cargoType: 'Medical Supplies', experienceYears: 8 },
  { id: '11111111-1111-4000-8000-000000000002', name: 'Bikram Das', email: 'bikram@ner-sahayak.in', phone: '+91 98765 43211', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'AS 02 C 8812', state: 'Assam', district: 'Nagaon', language: 'as', cargoType: 'Essential Grains & Ration', experienceYears: 10 },
  { id: '11111111-1111-4000-8000-000000000003', name: 'Chandan Kalita', email: 'chandan@ner-sahayak.in', phone: '+91 98765 43212', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'AS 06 F 1045', state: 'Assam', district: 'Dibrugarh', language: 'as', cargoType: 'Oil & Petroleum Distillates', experienceYears: 12 },
  { id: '11111111-1111-4000-8000-000000000004', name: 'Dipankar Saikia', email: 'dipankar@ner-sahayak.in', phone: '+91 98765 43213', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'TR 01 A 5521', state: 'Tripura', district: 'Agartala', language: 'bn', cargoType: 'Agricultural Freight', experienceYears: 6 },
  { id: '11111111-1111-4000-8000-000000000005', name: 'Eshaan Chettri', email: 'eshaan@ner-sahayak.in', phone: '+91 98765 43214', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'SK 04 P 9934', state: 'Sikkim', district: 'Gangtok', language: 'en', cargoType: 'Cold Storage Vaccines', experienceYears: 9 },
  { id: '11111111-1111-4000-8000-000000000006', name: 'Farhan Ahmed', email: 'farhan@ner-sahayak.in', phone: '+91 98765 43215', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'ML 05 D 7710', state: 'Meghalaya', district: 'Shillong', language: 'kha', cargoType: 'Heavy Infrastructure Materials', experienceYears: 11 },
  { id: '11111111-1111-4000-8000-000000000007', name: 'Gautam Gogoi', email: 'gautam@ner-sahayak.in', phone: '+91 98765 43216', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'AS 03 E 4482', state: 'Assam', district: 'Jorhat', language: 'as', cargoType: 'Tea Export Cargo', experienceYears: 7 },
  { id: '11111111-1111-4000-8000-000000000008', name: 'Haokip Zou', email: 'haokip@ner-sahayak.in', phone: '+91 98765 43217', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'MN 01 L 3319', state: 'Manipur', district: 'Imphal', language: 'mni', cargoType: 'Emergency Disaster Relief Supplies', experienceYears: 14 },
  { id: '11111111-1111-4000-8000-000000000009', name: 'Inaobi Singh', email: 'inaobi@ner-sahayak.in', phone: '+91 98765 43218', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'NL 07 B 2291', state: 'Nagaland', district: 'Dimapur', language: 'nag', cargoType: 'Hardware & Machinery Parts', experienceYears: 5 },
  { id: '11111111-1111-4000-8000-000000000010', name: 'Jiten Teron', email: 'jiten@ner-sahayak.in', phone: '+91 98765 43219', role: 'driver', organisation: 'Registered Driver', vehicle_number: 'AR 02 H 6604', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en', cargoType: 'Border Security & Ration Freight', experienceYears: 15 },
];

// Exactly 10 Demo Logistics Operators across realistic NER hubs
const LOGISTICS_PROFILES = [
  { id: '22222222-2222-4000-8000-000000000001', name: 'Rohan Sharma', email: 'rohan@ner-sahayak.in', phone: '+91 98765 50001', role: 'logistics', organisation: 'NER Freight Movers', hub: 'Khanapara Hub', state: 'Assam', district: 'Kamrup Metropolitan', language: 'hi', designation: 'Regional Freight Controller' },
  { id: '22222222-2222-4000-8000-000000000002', name: 'Bikash Baruah', email: 'bikash.logistics@ner-sahayak.in', phone: '+91 98765 50002', role: 'logistics', organisation: 'Brahmaputra Logistics', hub: 'Pandu Port Hub', state: 'Assam', district: 'Kamrup Metropolitan', language: 'as', designation: 'Multi-Modal Logistics Head' },
  { id: '22222222-2222-4000-8000-000000000003', name: 'Anupam Debbarma', email: 'anupam.logistics@ner-sahayak.in', phone: '+91 98765 50003', role: 'logistics', organisation: 'Eastern Gateway Logistics', hub: 'Agartala ICP Hub', state: 'Tripura', district: 'Agartala', language: 'bn', designation: 'Cross-Border Cargo Specialist' },
  { id: '22222222-2222-4000-8000-000000000004', name: 'Tenzing Norbu', email: 'tenzing.logistics@ner-sahayak.in', phone: '+91 98765 50004', role: 'logistics', organisation: 'NorthEast Cargo Link', hub: 'Dimapur Terminal', state: 'Nagaland', district: 'Dimapur', language: 'en', designation: 'Railhead Freight Officer' },
  { id: '22222222-2222-4000-8000-000000000005', name: 'Pranjal Saikia', email: 'pranjal.logistics@ner-sahayak.in', phone: '+91 98765 50005', role: 'logistics', organisation: 'Assam Valley Logistics', hub: 'Jorhat Bypass Hub', state: 'Assam', district: 'Jorhat', language: 'as', designation: 'Upper Assam Fleet Dispatcher' },
  { id: '22222222-2222-4000-8000-000000000006', name: 'Lalrindika Sailo', email: 'lalrindika.logistics@ner-sahayak.in', phone: '+91 98765 50006', role: 'logistics', organisation: 'HillRoute Logistics', hub: 'Aizawl South Freight Yard', state: 'Mizoram', district: 'Aizawl', language: 'en', designation: 'Hill Sector Route Manager' },
  { id: '22222222-2222-4000-8000-000000000007', name: 'Ningthoujam Luwang', email: 'luwang.logistics@ner-sahayak.in', phone: '+91 98765 50007', role: 'logistics', organisation: 'Seven Sisters Freight', hub: 'Imphal Airport Cargo Complex', state: 'Manipur', district: 'Imphal', language: 'mni', designation: 'Valley Logistics Coordinator' },
  { id: '22222222-2222-4000-8000-000000000008', name: 'Debashis Nath', email: 'debashis.logistics@ner-sahayak.in', phone: '+91 98765 50008', role: 'logistics', organisation: 'NER Supply Chain', hub: 'Silchar Transshipment Depot', state: 'Assam', district: 'Silchar', language: 'bn', designation: 'Barak Valley Hub Master' },
  { id: '22222222-2222-4000-8000-000000000009', name: 'Mitali Bordoloi', email: 'mitali.logistics@ner-sahayak.in', phone: '+91 98765 50009', role: 'logistics', organisation: 'Brahmaputra Cargo Services', hub: 'Tezpur Inland Terminal', state: 'Assam', district: 'Tezpur', language: 'as', designation: 'Northern Corridor Supervisor' },
  { id: '22222222-2222-4000-8000-000000000010', name: 'Kenter Lollen', email: 'kenter.logistics@ner-sahayak.in', phone: '+91 98765 50010', role: 'logistics', organisation: 'Eastern Corridor Logistics', hub: 'Naharlagun Freight Depot', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en', designation: 'Frontier Supply Officer' },
];

// Exactly 10 Demo Field Officers (normalized from existing PWD field units)
const FIELD_PROFILES = [
  { id: '33333333-3333-4000-8000-000000000001', name: 'Priya Deka', email: 'priya@ner-sahayak.in', phone: '+91 98765 60001', role: 'field', organisation: 'PWD Field Unit, Nagaon', state: 'Assam', district: 'Nagaon', language: 'as', designation: 'Senior Highway Inspector', department: 'PWD Roads & Bridges', assigned_area: 'NH27 / Nagaon Bypass Sector' },
  { id: '33333333-3333-4000-8000-000000000002', name: 'Amitabh Sharma', email: 'amitabh@ner-sahayak.in', phone: '+91 98765 60002', role: 'field', organisation: 'PWD Field Unit, Guwahati', state: 'Assam', district: 'Guwahati', language: 'hi', designation: 'Sub-Divisional Engineer', department: 'Highway Infrastructure', assigned_area: 'NH27 / Saraighat Corridor' },
  { id: '33333333-3333-4000-8000-000000000003', name: 'Ritu Phukan', email: 'ritu@ner-sahayak.in', phone: '+91 98765 60003', role: 'field', organisation: 'PWD Field Unit, Tezpur', state: 'Assam', district: 'Tezpur', language: 'as', designation: 'Field Safety Officer', department: 'PWD Flood Mitigation', assigned_area: 'NH15 / Kolia Bhomora Bridge Sector' },
  { id: '33333333-3333-4000-8000-000000000004', name: 'Samuel Sangma', email: 'samuel@ner-sahayak.in', phone: '+91 98765 60004', role: 'field', organisation: 'PWD Field Unit, Tura', state: 'Meghalaya', district: 'Tura', language: 'en', designation: 'Garo Hills Route Inspector', department: 'Meghalaya PWD', assigned_area: 'NH51 / Tura-Dalu Route' },
  { id: '33333333-3333-4000-8000-000000000005', name: 'Lalmingthanga', email: 'lalmingthanga@ner-sahayak.in', phone: '+91 98765 60005', role: 'field', organisation: 'PWD Field Unit, Aizawl', state: 'Mizoram', district: 'Aizawl', language: 'en', designation: 'Landslide Response Supervisor', department: 'Disaster Emergency Unit', assigned_area: 'NH54 / Aizawl-Lunglei Ridge' },
  { id: '33333333-3333-4000-8000-000000000006', name: 'Zothanpari', email: 'zothanpari@ner-sahayak.in', phone: '+91 98765 60006', role: 'field', organisation: 'PWD Field Unit, Lunglei', state: 'Mizoram', district: 'Lunglei', language: 'en', designation: 'Southern Hills Inspector', department: 'Mizoram PWD', assigned_area: 'Southern Mizoram Corridor' },
  { id: '33333333-3333-4000-8000-000000000007', name: 'Khupkholam', email: 'khupkholam@ner-sahayak.in', phone: '+91 98765 60007', role: 'field', organisation: 'PWD Field Unit, Churachandpur', state: 'Manipur', district: 'Churachandpur', language: 'en', designation: 'Highland Road Officer', department: 'Manipur PWD', assigned_area: 'NH2 / Tedim Road' },
  { id: '33333333-3333-4000-8000-000000000008', name: 'Sanjita Devi', email: 'sanjita@ner-sahayak.in', phone: '+91 98765 60008', role: 'field', organisation: 'PWD Field Unit, Imphal', state: 'Manipur', district: 'Imphal', language: 'mni', designation: 'Valley Highway Inspector', department: 'Manipur PWD', assigned_area: 'NH37 / Imphal-Jiribam Highway' },
  { id: '33333333-3333-4000-8000-000000000009', name: 'Tashi Namgyal', email: 'tashi@ner-sahayak.in', phone: '+91 98765 60009', role: 'field', organisation: 'PWD Field Unit, Tawang', state: 'Arunachal Pradesh', district: 'Tawang', language: 'en', designation: 'High-Altitude Pass Inspector', department: 'Border Roads / PWD', assigned_area: 'Bhalukpong-Tawang Axis (Sela Pass)' },
  { id: '33333333-3333-4000-8000-000000000010', name: 'Subhash Deb', email: 'subhash@ner-sahayak.in', phone: '+91 98765 60010', role: 'field', organisation: 'PWD Field Unit, Agartala', state: 'Tripura', district: 'Agartala', language: 'bn', designation: 'Tripura Corridor Inspector', department: 'Tripura PWD', assigned_area: 'NH8 / Churaibari-Agartala Highway' },
];

// Government Officials (DoNER & Disaster Management)
const OFFICIAL_PROFILES = [
  { id: '44444444-4444-4000-8000-000000000001', name: 'Ananya Gogoi', email: 'ananya@ner-sahayak.in', phone: '+91 98765 70001', role: 'official', organisation: 'DoNER Regional Office', department: 'Disaster Management', state: 'Assam', district: 'Kamrup Metropolitan', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000002', name: 'Naveen Jindal', email: 'naveen@ner-sahayak.in', phone: '+91 98765 70002', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Assam', district: 'Guwahati', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000003', name: 'Sneha Boro', email: 'sneha@ner-sahayak.in', phone: '+91 98765 70003', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Assam', district: 'Tezpur', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000004', name: 'Wanlamkupar', email: 'wanlamkupar@ner-sahayak.in', phone: '+91 98765 70004', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Meghalaya', district: 'Shillong', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000005', name: 'Biakzuala', email: 'biakzuala@ner-sahayak.in', phone: '+91 98765 70005', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Mizoram', district: 'Aizawl', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000006', name: 'R. K. Singh', email: 'rk.singh@ner-sahayak.in', phone: '+91 98765 70006', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Manipur', district: 'Imphal', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000007', name: 'Neiphiu', email: 'neiphiu@ner-sahayak.in', phone: '+91 98765 70007', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Nagaland', district: 'Kohima', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000008', name: 'Sentila', email: 'sentila@ner-sahayak.in', phone: '+91 98765 70008', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Nagaland', district: 'Dimapur', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000009', name: 'Pema', email: 'pema@ner-sahayak.in', phone: '+91 98765 70009', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000010', name: 'Karma Bhutia', email: 'karma@ner-sahayak.in', phone: '+91 98765 70010', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Sikkim', district: 'Gangtok', language: 'en' },
  { id: '44444444-4444-4000-8000-000000000011', name: 'Sushmita Sen', email: 'sushmita@ner-sahayak.in', phone: '+91 98765 70011', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Tripura', district: 'Agartala', language: 'en' },
];

// =============================================================================
// 2. VEHICLES DATA (12 Realistic Vehicles linked to drivers and NER network)
// =============================================================================
const VEHICLES_DATA = [
  { id: '55555555-5555-4000-8000-000000000001', driver_id: DRIVER_PROFILES[0].id, vehicle_number: 'AS 01 K 4309', vehicle_type: 'Refrigerated Truck', cargo_type: 'Medical supplies', capacity_tonnes: 8.5, origin_node: 'guwahati', destination_node: 'jorhat', status: 'in_transit', lat: 26.35, lng: 92.40 },
  { id: '55555555-5555-4000-8000-000000000002', driver_id: DRIVER_PROFILES[1].id, vehicle_number: 'AS 02 C 8812', vehicle_type: 'Heavy Truck', cargo_type: 'Essential Grains & Ration', capacity_tonnes: 16.0, origin_node: 'nagaon', destination_node: 'tezpur', status: 'loading', lat: 26.34, lng: 92.68 },
  { id: '55555555-5555-4000-8000-000000000003', driver_id: DRIVER_PROFILES[2].id, vehicle_number: 'AS 06 F 1045', vehicle_type: 'Tanker', cargo_type: 'Oil & Petroleum Distillates', capacity_tonnes: 20.0, origin_node: 'dibrugarh', destination_node: 'itanagar', status: 'in_transit', lat: 27.42, lng: 94.75 },
  { id: '55555555-5555-4000-8000-000000000004', driver_id: DRIVER_PROFILES[3].id, vehicle_number: 'TR 01 A 5521', vehicle_type: 'Medium Truck', cargo_type: 'Agricultural Freight', capacity_tonnes: 10.0, origin_node: 'agartala', destination_node: 'silchar', status: 'delayed', lat: 24.15, lng: 92.05 },
  { id: '55555555-5555-4000-8000-000000000005', driver_id: DRIVER_PROFILES[4].id, vehicle_number: 'SK 04 P 9934', vehicle_type: 'Refrigerated Truck', cargo_type: 'Cold Storage Vaccines', capacity_tonnes: 6.0, origin_node: 'gangtok', destination_node: 'siliguri', status: 'in_transit', lat: 27.20, lng: 88.50 },
  { id: '55555555-5555-4000-8000-000000000006', driver_id: DRIVER_PROFILES[5].id, vehicle_number: 'ML 05 D 7710', vehicle_type: 'Heavy Truck', cargo_type: 'Heavy Infrastructure Materials', capacity_tonnes: 18.0, origin_node: 'shillong', destination_node: 'guwahati', status: 'idle', lat: 25.57, lng: 91.89 },
  { id: '55555555-5555-4000-8000-000000000007', driver_id: DRIVER_PROFILES[6].id, vehicle_number: 'AS 03 E 4482', vehicle_type: 'Container Truck', cargo_type: 'Tea Export Cargo', capacity_tonnes: 14.0, origin_node: 'jorhat', destination_node: 'guwahati', status: 'in_transit', lat: 26.65, lng: 93.30 },
  { id: '55555555-5555-4000-8000-000000000008', driver_id: DRIVER_PROFILES[7].id, vehicle_number: 'MN 01 L 3319', vehicle_type: 'Medium Truck', cargo_type: 'Emergency Disaster Relief Supplies', capacity_tonnes: 9.0, origin_node: 'silchar', destination_node: 'imphal', status: 'in_transit', lat: 24.81, lng: 93.35 },
  { id: '55555555-5555-4000-8000-000000000009', driver_id: DRIVER_PROFILES[8].id, vehicle_number: 'NL 07 B 2291', vehicle_type: 'Heavy Truck', cargo_type: 'Hardware & Machinery Parts', capacity_tonnes: 15.0, origin_node: 'dimapur', destination_node: 'kohima', status: 'maintenance', lat: 25.90, lng: 93.72 },
  { id: '55555555-5555-4000-8000-000000000010', driver_id: DRIVER_PROFILES[9].id, vehicle_number: 'AR 02 H 6604', vehicle_type: 'Mini Truck', cargo_type: 'Border Security & Ration Freight', capacity_tonnes: 4.5, origin_node: 'itanagar', destination_node: 'tawang', status: 'in_transit', lat: 27.35, lng: 92.50 },
  { id: '55555555-5555-4000-8000-000000000011', driver_id: null, vehicle_number: 'AS 01 GC 1002', vehicle_type: 'Container Truck', cargo_type: 'General cargo', capacity_tonnes: 22.0, origin_node: 'guwahati', destination_node: 'silchar', status: 'idle', lat: 26.14, lng: 91.73 },
  { id: '55555555-5555-4000-8000-000000000012', driver_id: null, vehicle_number: 'MZ 01 B 7780', vehicle_type: 'Medium Truck', cargo_type: 'Emergency Supplies', capacity_tonnes: 10.0, origin_node: 'aizawl', destination_node: 'silchar', status: 'loading', lat: 23.72, lng: 92.71 },
];

// =============================================================================
// 3. FIELD INCIDENTS DATA (EXACTLY 10 Realistic Reports)
// =============================================================================
const FIELD_INCIDENTS = [
  {
    id: '66666666-6666-4000-8000-000000000001',
    reporter_id: FIELD_PROFILES[3].id, // Samuel Sangma
    reporter_role: 'field',
    title: 'Major Landslide near Sonapur Tunnel on NH6',
    description: 'Heavy boulders and 200m mud accumulation on NH6 blocking both lanes. Hill clearance earthmovers actively deployed on site.',
    category: 'landslide',
    severity: 'critical',
    status: 'active',
    state: 'Meghalaya',
    district: 'East Jaintia Hills',
    node_id: 'shillong',
    road: 'NH6',
    lat: 25.12,
    lng: 92.36,
    affected_modes: ['road'],
    estimated_delay_minutes: 240,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000002',
    reporter_id: FIELD_PROFILES[0].id, // Priya Deka
    reporter_role: 'field',
    title: 'Severe Waterlogging and Flash Inundation on NH27',
    description: 'Brahmaputra tributary overflow caused 1.5 ft water over highway between Raha and Nagaon. Single file slow movement permitted for heavy vehicles.',
    category: 'flood',
    severity: 'major',
    status: 'active',
    state: 'Assam',
    district: 'Nagaon',
    node_id: 'nagaon',
    road: 'NH27',
    lat: 26.25,
    lng: 92.52,
    affected_modes: ['road'],
    estimated_delay_minutes: 90,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000003',
    reporter_id: FIELD_PROFILES[2].id, // Ritu Phukan
    reporter_role: 'field',
    title: 'Bridge Approach Embankment Scouring on NH15',
    description: 'Substructure scouring noticed near Kolia Bhomora approach culvert. Load restriction of 15 tonnes imposed by PWD technical team.',
    category: 'bridge_damage',
    severity: 'major',
    status: 'verified',
    state: 'Assam',
    district: 'Sonitpur',
    node_id: 'tezpur',
    road: 'NH15',
    lat: 26.60,
    lng: 92.85,
    affected_modes: ['road'],
    estimated_delay_minutes: 60,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000004',
    reporter_id: FIELD_PROFILES[8].id, // Tashi Namgyal
    reporter_role: 'field',
    title: 'Rockfall and Ice Layer Formation near Sela Pass',
    description: 'Fresh scree fall coupled with black ice formation near Sela top (13,700 ft). Snowplows operating; convoy chain tires mandatory.',
    category: 'weather_hazard',
    severity: 'critical',
    status: 'active',
    state: 'Arunachal Pradesh',
    district: 'West Kameng',
    node_id: 'tawang',
    road: 'NH13',
    lat: 27.50,
    lng: 92.10,
    affected_modes: ['road'],
    estimated_delay_minutes: 180,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000005',
    reporter_id: FIELD_PROFILES[7].id, // Sanjita Devi
    reporter_role: 'field',
    title: 'Culvert Collapse on NH37 Imphal-Jiribam Highway',
    description: 'A 6-meter culvert collapsed near Nungba due to torrential downpour. Temporary bailey bridge construction underway by BRO.',
    category: 'infrastructure_damage',
    severity: 'critical',
    status: 'under_review',
    state: 'Manipur',
    district: 'Noney',
    node_id: 'imphal',
    road: 'NH37',
    lat: 24.78,
    lng: 93.55,
    affected_modes: ['road'],
    estimated_delay_minutes: 360,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000006',
    reporter_id: FIELD_PROFILES[1].id, // Amitabh Sharma
    reporter_role: 'field',
    title: 'Pavement Settling & Rutting on NH27 Saraighat Corridor',
    description: 'Deep pavement depressions slowing freight movement entering North Guwahati. Repair patches scheduled for night hours.',
    category: 'poor_road_condition',
    severity: 'minor',
    status: 'verified',
    state: 'Assam',
    district: 'Kamrup',
    node_id: 'guwahati',
    road: 'NH27',
    lat: 26.18,
    lng: 91.68,
    affected_modes: ['road'],
    estimated_delay_minutes: 30,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000007',
    reporter_id: FIELD_PROFILES[4].id, // Lalmingthanga
    reporter_role: 'field',
    title: 'Slope Instability on NH54 Aizawl-Lunglei Highway',
    description: 'Continuous soil creep observed along hillside edge near Hunthar. Traffic diverted via Durtlang bypass for heavy trailers.',
    category: 'road_blockage',
    severity: 'moderate',
    status: 'active',
    state: 'Mizoram',
    district: 'Aizawl',
    node_id: 'aizawl',
    road: 'NH54',
    lat: 23.75,
    lng: 92.70,
    affected_modes: ['road'],
    estimated_delay_minutes: 75,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000008',
    reporter_id: FIELD_PROFILES[9].id, // Subhash Deb
    reporter_role: 'field',
    title: 'Truck Breakdown Causing Choke on NH8 Churaibari Gate',
    description: 'A 14-wheeler container axle failure created a 3km bottleneck at Tripura-Assam inter-state boundary gate.',
    category: 'traffic',
    severity: 'moderate',
    status: 'verified',
    state: 'Tripura',
    district: 'North Tripura',
    node_id: 'agartala',
    road: 'NH8',
    lat: 24.52,
    lng: 92.24,
    affected_modes: ['road'],
    estimated_delay_minutes: 110,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000009',
    reporter_id: FIELD_PROFILES[5].id, // Zothanpari
    reporter_role: 'field',
    title: 'Dense Fog and Reduced Visibility on NH10 Sevoke Range',
    description: 'Visibility dropped below 15 meters on mountain curves. Speed limit 20 km/h enforced with warning flaggers deployed.',
    category: 'visibility_problem',
    severity: 'minor',
    status: 'active',
    state: 'Sikkim',
    district: 'East Sikkim',
    node_id: 'gangtok',
    road: 'NH10',
    lat: 27.15,
    lng: 88.55,
    affected_modes: ['road'],
    estimated_delay_minutes: 45,
    source: 'field_app',
  },
  {
    id: '66666666-6666-4000-8000-000000000010',
    reporter_id: FIELD_PROFILES[6].id, // Khupkholam
    reporter_role: 'field',
    title: 'Waterway Channel Siltation near Pandu Port (NW-2)',
    description: 'Low draft silt accumulation detected at terminal approach channel on Brahmaputra river. Dredging vessel active.',
    category: 'infrastructure_damage',
    severity: 'moderate',
    status: 'resolved',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    node_id: 'guwahati',
    road: 'NW2-Brahmaputra',
    lat: 26.15,
    lng: 91.70,
    affected_modes: ['waterway'],
    estimated_delay_minutes: 0,
    source: 'field_app',
    resolved_at: new Date(Date.now() - 3600000).toISOString(),
    resolution_notes: 'Channel cleared to 2.5m draft depth by Inland Waterways Authority.',
  },
];

// =============================================================================
// 4. DRIVER INCIDENTS DATA (EXACTLY 10 Realistic Reports from 10 Drivers)
// =============================================================================
const DRIVER_INCIDENTS = [
  {
    id: '77777777-7777-4000-8000-000000000001',
    reporter_id: DRIVER_PROFILES[0].id, // Arjun Bora
    reporter_role: 'driver',
    title: 'Truck Immobilized due to Radiator Overheating near Jagiroad',
    description: 'Radiator hose ruptured under heavy incline load on NH27. Parked safely on outer shoulder awaiting mobile mechanic.',
    category: 'vehicle_breakdown',
    severity: 'moderate',
    status: 'active',
    state: 'Assam',
    district: 'Marigaon',
    node_id: 'guwahati',
    road: 'NH27',
    lat: 26.12,
    lng: 92.21,
    affected_modes: ['road'],
    estimated_delay_minutes: 60,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000002',
    reporter_id: DRIVER_PROFILES[1].id, // Bikram Das
    reporter_role: 'driver',
    title: 'Water Accumulation Slowing Heavy Freight Vehicles',
    description: 'Severe gutter overflow near Raha toll plaza. Water depth 10 inches; trucks moving at 10-15 km/h.',
    category: 'flood',
    severity: 'moderate',
    status: 'verified',
    state: 'Assam',
    district: 'Nagaon',
    node_id: 'nagaon',
    road: 'NH27',
    lat: 26.24,
    lng: 92.51,
    affected_modes: ['road'],
    estimated_delay_minutes: 40,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000003',
    reporter_id: DRIVER_PROFILES[2].id, // Chandan Kalita
    reporter_role: 'driver',
    title: 'Traffic Queue at Numaligarh Refinery Checkpost',
    description: 'Heavy tanker safety inspection queue extending 2.5 km eastbound towards Jorhat on NH715.',
    category: 'traffic',
    severity: 'minor',
    status: 'active',
    state: 'Assam',
    district: 'Golaghat',
    node_id: 'jorhat',
    road: 'NH715',
    lat: 26.58,
    lng: 93.75,
    affected_modes: ['road'],
    estimated_delay_minutes: 50,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000004',
    reporter_id: DRIVER_PROFILES[3].id, // Dipankar Saikia
    reporter_role: 'driver',
    title: 'Low Visibility & Fallen Tree Limbs on NH8 Ambassa Sector',
    description: 'Sudden thunderstorm brought down bamboo clusters across left lane. Caution lights blinking.',
    category: 'visibility_problem',
    severity: 'minor',
    status: 'reported',
    state: 'Tripura',
    district: 'Dhalai',
    node_id: 'agartala',
    road: 'NH8',
    lat: 23.92,
    lng: 91.85,
    affected_modes: ['road'],
    estimated_delay_minutes: 30,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000005',
    reporter_id: DRIVER_PROFILES[4].id, // Eshaan Chettri
    reporter_role: 'driver',
    title: 'Brake Disc Thermal Warning on Steep Hill Descent',
    description: 'Vaccine refrigerated unit halted at Ranipool lay-by for 25 minutes brake cool down sequence.',
    category: 'vehicle_breakdown',
    severity: 'minor',
    status: 'verified',
    state: 'Sikkim',
    district: 'East Sikkim',
    node_id: 'gangtok',
    road: 'NH10',
    lat: 27.28,
    lng: 88.58,
    affected_modes: ['road'],
    estimated_delay_minutes: 25,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000006',
    reporter_id: DRIVER_PROFILES[5].id, // Farhan Ahmed
    reporter_role: 'driver',
    title: 'Minor Rock Impact on Suspension near Nongpoh',
    description: 'Fallen rock on blind turn caused suspension bracket vibration. Moving cautiously at reduced speed.',
    category: 'poor_road_condition',
    severity: 'minor',
    status: 'active',
    state: 'Meghalaya',
    district: 'Ri-Bhoi',
    node_id: 'shillong',
    road: 'NH6',
    lat: 25.90,
    lng: 91.88,
    affected_modes: ['road'],
    estimated_delay_minutes: 20,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000007',
    reporter_id: DRIVER_PROFILES[6].id, // Gautam Gogoi
    reporter_role: 'driver',
    title: 'Pothole Cluster Caused Tire Pressure Loss near Bokakhat',
    description: 'Deep rain rutted crater damaged front left tubeless tire. Replaced with spare; highway team alerted.',
    category: 'accident',
    severity: 'minor',
    status: 'resolved',
    state: 'Assam',
    district: 'Golaghat',
    node_id: 'jorhat',
    road: 'NH715',
    lat: 26.62,
    lng: 93.60,
    affected_modes: ['road'],
    estimated_delay_minutes: 0,
    source: 'driver_app',
    resolved_at: new Date(Date.now() - 7200000).toISOString(),
    resolution_notes: 'Spare tire fitted and journey resumed safely.',
  },
  {
    id: '77777777-7777-4000-8000-000000000008',
    reporter_id: DRIVER_PROFILES[7].id, // Haokip Zou
    reporter_role: 'driver',
    title: 'Fuel Station Pump Failure near Senapati Valley',
    description: 'Local diesel dispenser outage delayed convoy refuel by 45 minutes on NH2.',
    category: 'fuel_problem',
    severity: 'minor',
    status: 'resolved',
    state: 'Manipur',
    district: 'Senapati',
    node_id: 'imphal',
    road: 'NH2',
    lat: 25.26,
    lng: 94.02,
    affected_modes: ['road'],
    estimated_delay_minutes: 0,
    source: 'driver_app',
    resolved_at: new Date(Date.now() - 1800000).toISOString(),
    resolution_notes: 'Auxiliary generator restored pump power.',
  },
  {
    id: '77777777-7777-4000-8000-000000000009',
    reporter_id: DRIVER_PROFILES[8].id, // Inaobi Singh
    reporter_role: 'driver',
    title: 'Culvert Repair Single Lane Bottleneck near Chumukedima',
    description: 'Intermittent stop-and-go flagger operation on NH29 hill bypass.',
    category: 'traffic',
    severity: 'minor',
    status: 'active',
    state: 'Nagaland',
    district: 'Chumukedima',
    node_id: 'dimapur',
    road: 'NH29',
    lat: 25.80,
    lng: 93.78,
    affected_modes: ['road'],
    estimated_delay_minutes: 35,
    source: 'driver_app',
  },
  {
    id: '77777777-7777-4000-8000-000000000010',
    reporter_id: DRIVER_PROFILES[9].id, // Jiten Teron
    reporter_role: 'driver',
    title: 'Morning Frost Surface Slipperiness near Banderdewa Entry',
    description: 'Light frost creating slippery road surface on sharp descending switchbacks into Arunachal.',
    category: 'weather_hazard',
    severity: 'minor',
    status: 'reported',
    state: 'Arunachal Pradesh',
    district: 'Papum Pare',
    node_id: 'itanagar',
    road: 'NH415',
    lat: 27.10,
    lng: 93.82,
    affected_modes: ['road'],
    estimated_delay_minutes: 25,
    source: 'driver_app',
  },
];

// =============================================================================
// 5. SHIPMENTS DATA (18 Realistic Multi-Modal Shipments across NER)
// =============================================================================
const SHIPMENTS_DATA = [
  { id: '88888888-8888-4000-8000-000000000001', vehicle_id: VEHICLES_DATA[0].id, driver_id: DRIVER_PROFILES[0].id, created_by: LOGISTICS_PROFILES[0].id, origin_node: 'guwahati', destination_node: 'dibrugarh', cargo_type: 'Pharmaceutical', weight: 4500, priority: 'urgent', status: 'in_transit', eta_minutes: 360 },
  { id: '88888888-8888-4000-8000-000000000002', vehicle_id: VEHICLES_DATA[7].id, driver_id: DRIVER_PROFILES[7].id, created_by: LOGISTICS_PROFILES[6].id, origin_node: 'guwahati', destination_node: 'imphal', cargo_type: 'Emergency Supplies', weight: 6200, priority: 'emergency', status: 'in_transit', eta_minutes: 580 },
  { id: '88888888-8888-4000-8000-000000000003', vehicle_id: VEHICLES_DATA[5].id, driver_id: DRIVER_PROFILES[5].id, created_by: LOGISTICS_PROFILES[0].id, origin_node: 'guwahati', destination_node: 'shillong', cargo_type: 'General', weight: 8000, priority: 'normal', status: 'delivered', eta_minutes: 150 },
  { id: '88888888-8888-4000-8000-000000000004', vehicle_id: VEHICLES_DATA[2].id, driver_id: DRIVER_PROFILES[2].id, created_by: LOGISTICS_PROFILES[4].id, origin_node: 'dibrugarh', destination_node: 'itanagar', cargo_type: 'Heavy Cargo', weight: 14000, priority: 'high', status: 'in_transit', eta_minutes: 240 },
  { id: '88888888-8888-4000-8000-000000000005', vehicle_id: VEHICLES_DATA[3].id, driver_id: DRIVER_PROFILES[3].id, created_by: LOGISTICS_PROFILES[2].id, origin_node: 'agartala', destination_node: 'guwahati', cargo_type: 'Perishable', weight: 5200, priority: 'high', status: 'delayed', eta_minutes: 620 },
  { id: '88888888-8888-4000-8000-000000000006', vehicle_id: VEHICLES_DATA[7].id, driver_id: DRIVER_PROFILES[7].id, created_by: LOGISTICS_PROFILES[7].id, origin_node: 'silchar', destination_node: 'imphal', cargo_type: 'High Value', weight: 3500, priority: 'urgent', status: 'in_transit', eta_minutes: 420 },
  { id: '88888888-8888-4000-8000-000000000007', vehicle_id: VEHICLES_DATA[11].id, driver_id: null, created_by: LOGISTICS_PROFILES[5].id, origin_node: 'guwahati', destination_node: 'aizawl', cargo_type: 'General', weight: 9500, priority: 'normal', status: 'loading', eta_minutes: 540 },
  { id: '88888888-8888-4000-8000-000000000008', vehicle_id: VEHICLES_DATA[8].id, driver_id: DRIVER_PROFILES[8].id, created_by: LOGISTICS_PROFILES[3].id, origin_node: 'dimapur', destination_node: 'imphal', cargo_type: 'Heavy Cargo', weight: 12000, priority: 'normal', status: 'planned', eta_minutes: 380 },
  { id: '88888888-8888-4000-8000-000000000009', vehicle_id: VEHICLES_DATA[4].id, driver_id: DRIVER_PROFILES[4].id, created_by: LOGISTICS_PROFILES[0].id, origin_node: 'gangtok', destination_node: 'guwahati', cargo_type: 'Pharmaceutical', weight: 2800, priority: 'urgent', status: 'in_transit', eta_minutes: 480 },
  { id: '88888888-8888-4000-8000-000000000010', vehicle_id: VEHICLES_DATA[6].id, driver_id: DRIVER_PROFILES[6].id, created_by: LOGISTICS_PROFILES[4].id, origin_node: 'jorhat', destination_node: 'guwahati', cargo_type: 'General', weight: 11500, priority: 'normal', status: 'in_transit', eta_minutes: 310 },
  { id: '88888888-8888-4000-8000-000000000011', vehicle_id: VEHICLES_DATA[1].id, driver_id: DRIVER_PROFILES[1].id, created_by: LOGISTICS_PROFILES[8].id, origin_node: 'tezpur', destination_node: 'nagaon', cargo_type: 'Perishable', weight: 4200, priority: 'normal', status: 'loading', eta_minutes: 120 },
  { id: '88888888-8888-4000-8000-000000000012', vehicle_id: VEHICLES_DATA[9].id, driver_id: DRIVER_PROFILES[9].id, created_by: LOGISTICS_PROFILES[9].id, origin_node: 'itanagar', destination_node: 'tawang', cargo_type: 'Emergency Supplies', weight: 3200, priority: 'urgent', status: 'in_transit', eta_minutes: 460 },
  { id: '88888888-8888-4000-8000-000000000013', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[1].id, origin_node: 'guwahati', destination_node: 'tezpur', cargo_type: 'Heavy Cargo', weight: 18000, priority: 'normal', status: 'planned', eta_minutes: 220 },
  { id: '88888888-8888-4000-8000-000000000014', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[2].id, origin_node: 'agartala', destination_node: 'dharmanagar', cargo_type: 'General', weight: 7000, priority: 'normal', status: 'assigned', eta_minutes: 260 },
  { id: '88888888-8888-4000-8000-000000000015', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[7].id, origin_node: 'silchar', destination_node: 'aizawl', cargo_type: 'Perishable', weight: 5100, priority: 'high', status: 'planned', eta_minutes: 290 },
  { id: '88888888-8888-4000-8000-000000000016', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[3].id, origin_node: 'dimapur', destination_node: 'kohima', cargo_type: 'High Value', weight: 3800, priority: 'normal', status: 'delivered', eta_minutes: 140 },
  { id: '88888888-8888-4000-8000-000000000017', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[5].id, origin_node: 'aizawl', destination_node: 'lunglei', cargo_type: 'Pharmaceutical', weight: 2200, priority: 'urgent', status: 'planned', eta_minutes: 320 },
  { id: '88888888-8888-4000-8000-000000000018', vehicle_id: null, driver_id: null, created_by: LOGISTICS_PROFILES[0].id, origin_node: 'guwahati', destination_node: 'jorhat', cargo_type: 'Emergency Supplies', weight: 5500, priority: 'emergency', status: 'planned', eta_minutes: 300 },
];

// =============================================================================
// 6. ALERTS DATA (12 Realistic Regional Alerts)
// =============================================================================
const ALERTS_DATA = [
  { id: '99999999-9999-4000-8000-000000000001', type: 'Weather warning', tone: 'amber', icon: 'cloud', title: 'Heavy Rainfall Warning across Central Assam', text: 'IMD predicts 80-120mm downpour over Nagaon, Marigaon, and Kamrup districts. Plan for slower speeds on NH27.', node_id: 'nagaon', road: 'NH27', severity: 'moderate', created_by: OFFICIAL_PROFILES[0].id },
  { id: '99999999-9999-4000-8000-000000000002', type: 'Disruption alert', tone: 'red', icon: 'alert', title: 'NH6 Landslide at Sonapur Tunnel - Full Roadblock', text: 'Meghalaya-Assam-Tripura arterial link blocked. All commercial heavy vehicles diverted via secondary ridge roads.', node_id: 'shillong', road: 'NH6', severity: 'critical', created_by: OFFICIAL_PROFILES[3].id },
  { id: '99999999-9999-4000-8000-000000000003', type: 'Infrastructure notice', tone: 'amber', icon: 'shield', title: 'Bridge Load Restriction at Kolia Bhomora (NH15)', text: 'Maximum permissible gross vehicle weight reduced to 15T due to foundation assessment.', node_id: 'tezpur', road: 'NH15', severity: 'major', created_by: OFFICIAL_PROFILES[2].id },
  { id: '99999999-9999-4000-8000-000000000004', type: 'High Altitude Hazard', tone: 'red', icon: 'snow', title: 'Snow and Black Ice near Sela Pass (NH13)', text: 'Sub-zero temperatures and high slipperiness between Dirang and Tawang. 4x4 or snow-chains mandatory.', node_id: 'tawang', road: 'NH13', severity: 'critical', created_by: OFFICIAL_PROFILES[8].id },
  { id: '99999999-9999-4000-8000-000000000005', type: 'Flood advisory', tone: 'amber', icon: 'water', title: 'River Rising Advisory - Barak Basin', text: 'Water level crossing alert mark near Silchar Sadarghat. Low-lying warehousing instructed to elevate stock.', node_id: 'silchar', road: 'NH37', severity: 'moderate', created_by: OFFICIAL_PROFILES[0].id },
  { id: '99999999-9999-4000-8000-000000000006', type: 'Railway status', tone: 'blue', icon: 'train', title: 'Lumding-Badarpur Hill Section Rail Operations Normal', text: 'Freight rakes moving on schedule through Dima Hasao tunnel network.', node_id: 'silchar', road: 'NF-Railway', severity: 'minor', created_by: OFFICIAL_PROFILES[1].id },
  { id: '99999999-9999-4000-8000-000000000007', type: 'Waterway bulletin', tone: 'blue', icon: 'ship', title: 'NW-2 Brahmaputra Pandu-Dhubri Ro-Ro Active', text: 'Daily river Ro-Ro vessel service operating at full capacity for 16T payload trucks.', node_id: 'guwahati', road: 'NW2-Brahmaputra', severity: 'minor', created_by: LOGISTICS_PROFILES[1].id },
  { id: '99999999-9999-4000-8000-000000000008', type: 'Border transit', tone: 'amber', icon: 'truck', title: 'Churaibari Inter-State Checkpoint Congestion', text: 'Electronic weighbridge maintenance causing 90-minute delay entering Tripura.', node_id: 'agartala', road: 'NH8', severity: 'moderate', created_by: OFFICIAL_PROFILES[10].id },
  { id: '99999999-9999-4000-8000-000000000009', type: 'Aviation cargo', tone: 'blue', icon: 'plane', title: 'Imphal & Guwahati Air Cargo Terminals Clear', text: 'All scheduled freighter slots operating with zero weather delays.', node_id: 'imphal', road: 'Air-Corridor', severity: 'minor', created_by: OFFICIAL_PROFILES[5].id },
  { id: '99999999-9999-4000-8000-000000000010', type: 'Traffic advisory', tone: 'blue', icon: 'route', title: 'Dimapur-Kohima 4-Lane Section Open with Caution', text: 'Debris clearing concluded on Package 2. Dual carriageway open to standard traffic.', node_id: 'kohima', road: 'NH29', severity: 'minor', created_by: OFFICIAL_PROFILES[6].id },
  { id: '99999999-9999-4000-8000-000000000011', type: 'Emergency logistics', tone: 'red', icon: 'bell', title: 'Green Corridor Active for Disaster Relief to Manipur', text: 'Essential medicine consignments flagged for priority bypass across all highway toll points.', node_id: 'imphal', road: 'NH37', severity: 'critical', created_by: OFFICIAL_PROFILES[5].id },
  { id: '99999999-9999-4000-8000-000000000012', type: 'Weather watch', tone: 'blue', icon: 'sun', title: 'Favorable Weather Window in Western Arunachal', text: 'Clear conditions expected for the next 36 hours for Itanagar-Pasighat deliveries.', node_id: 'itanagar', road: 'NH415', severity: 'minor', created_by: OFFICIAL_PROFILES[8].id },
];

// =============================================================================
// SEED RUNNER FUNCTION (Idempotent upsert)
// =============================================================================
async function runSeed() {
  if (!checkSupabaseConfig()) {
    throw new Error('Supabase configuration missing in backend/.env');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('--------------------------------------------------');
  console.log('[Supabase Seed] Starting Idempotent Demo Seed...');
  console.log('--------------------------------------------------');

  const allProfiles = [
    ...DRIVER_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      password_hash: passwordHash,
      phone: p.phone,
      role: p.role,
      organisation: p.organisation,
      vehicle_number: p.vehicle_number,
      state: p.state,
      district: p.district,
      language: p.language,
      is_demo: true,
    })),
    ...LOGISTICS_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      password_hash: passwordHash,
      phone: p.phone,
      role: p.role,
      organisation: p.organisation,
      hub: p.hub,
      state: p.state,
      district: p.district,
      language: p.language,
      is_demo: true,
    })),
    ...FIELD_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      password_hash: passwordHash,
      phone: p.phone,
      role: p.role,
      organisation: p.organisation,
      department: p.department,
      state: p.state,
      district: p.district,
      language: p.language,
      is_demo: true,
    })),
    ...OFFICIAL_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      password_hash: passwordHash,
      phone: p.phone,
      role: p.role,
      organisation: p.organisation,
      department: p.department,
      state: p.state,
      district: p.district,
      language: p.language,
      is_demo: true,
    })),
  ];

  // 1. Upsert Profiles
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(allProfiles, { onConflict: 'id' });
  if (profileErr) throw new Error(`Profiles upsert failed: ${profileErr.message}`);

  // 2. Upsert Drivers
  const driverRecords = DRIVER_PROFILES.map((d) => ({
    id: d.id,
    profile_id: d.id,
    vehicle_number: d.vehicle_number,
    cargo_type: d.cargoType,
    experience_years: d.experienceYears,
    status: 'available',
    is_demo: true,
  }));
  const { error: drvErr } = await supabase
    .from('drivers')
    .upsert(driverRecords, { onConflict: 'id' });
  if (drvErr) console.warn('[Supabase Seed] Notice on drivers upsert:', drvErr.message);

  // 3. Upsert Logistics Operators
  const logisticsRecords = LOGISTICS_PROFILES.map((l) => ({
    id: l.id,
    profile_id: l.id,
    organisation: l.organisation,
    hub: l.hub,
    state: l.state,
    district: l.district,
    designation: l.designation,
    is_demo: true,
  }));
  const { error: logErr } = await supabase
    .from('logistics_operators')
    .upsert(logisticsRecords, { onConflict: 'id' });
  if (logErr) console.warn('[Supabase Seed] Notice on logistics upsert:', logErr.message);

  // 4. Upsert Field Officers
  const fieldRecords = FIELD_PROFILES.map((f) => ({
    id: f.id,
    profile_id: f.id,
    designation: f.designation,
    department: f.department,
    state: f.state,
    district: f.district,
    assigned_area: f.assigned_area,
    is_demo: true,
  }));
  const { error: fldErr } = await supabase
    .from('field_officers')
    .upsert(fieldRecords, { onConflict: 'id' });
  if (fldErr) console.warn('[Supabase Seed] Notice on field officers upsert:', fldErr.message);

  // 5. Upsert Vehicles
  const vehicleRecords = VEHICLES_DATA.map((v) => ({
    id: v.id,
    owner_id: v.driver_id,
    driver_id: v.driver_id,
    vehicle_number: v.vehicle_number,
    vehicle_type: v.vehicle_type,
    cargo_type: v.cargo_type,
    capacity_tonnes: v.capacity_tonnes,
    origin_node: v.origin_node,
    destination_node: v.destination_node,
    status: v.status,
    lat: v.lat,
    lng: v.lng,
    is_demo: true,
    last_updated: new Date().toISOString(),
  }));
  const { error: vehErr } = await supabase
    .from('vehicles')
    .upsert(vehicleRecords, { onConflict: 'id' });
  if (vehErr) throw new Error(`Vehicles upsert failed: ${vehErr.message}`);

  // 6. Upsert Incidents (10 Field + 10 Driver)
  const allIncidents = [...FIELD_INCIDENTS, ...DRIVER_INCIDENTS].map((inc) => ({
    id: inc.id,
    reporter_id: inc.reporter_id,
    reporter_role: inc.reporter_role,
    title: inc.title,
    description: inc.description,
    category: inc.category,
    severity: inc.severity,
    status: inc.status,
    state: inc.state,
    district: inc.district,
    node_id: inc.node_id,
    road: inc.road,
    lat: inc.lat,
    lng: inc.lng,
    affected_modes: inc.affected_modes,
    estimated_delay_minutes: inc.estimated_delay_minutes,
    source: inc.source,
    is_demo: true,
    resolved_at: inc.resolved_at || null,
    resolution_notes: inc.resolution_notes || null,
  }));
  const { error: incErr } = await supabase
    .from('incidents')
    .upsert(allIncidents, { onConflict: 'id' });
  if (incErr) throw new Error(`Incidents upsert failed: ${incErr.message}`);

  // 7. Upsert Shipments (18)
  const shipmentRecords = SHIPMENTS_DATA.map((s) => ({
    id: s.id,
    vehicle_id: s.vehicle_id,
    driver_id: s.driver_id,
    created_by: s.created_by,
    origin_node: s.origin_node,
    destination_node: s.destination_node,
    cargo_type: s.cargo_type,
    weight: s.weight,
    priority: s.priority,
    status: s.status,
    eta_minutes: s.eta_minutes,
    is_demo: true,
  }));
  const { error: shpErr } = await supabase
    .from('shipments')
    .upsert(shipmentRecords, { onConflict: 'id' });
  if (shpErr) throw new Error(`Shipments upsert failed: ${shpErr.message}`);

  // 8. Upsert Alerts (12)
  const alertRecords = ALERTS_DATA.map((a) => ({
    id: a.id,
    type: a.type,
    tone: a.tone,
    icon: a.icon,
    title: a.title,
    text: a.text,
    node_id: a.node_id,
    road: a.road,
    severity: a.severity,
    created_by: a.created_by,
    is_demo: true,
  }));
  const { error: altErr } = await supabase
    .from('alerts')
    .upsert(alertRecords, { onConflict: 'id' });
  if (altErr) throw new Error(`Alerts upsert failed: ${altErr.message}`);

  // 9. Initial Incident Updates and Activity Logs
  const initialUpdates = [
    {
      id: 'aaaaaaaa-aaaa-4000-8000-000000000001',
      incident_id: FIELD_INCIDENTS[0].id,
      updated_by: OFFICIAL_PROFILES[3].id,
      old_status: 'reported',
      new_status: 'active',
      comment: 'Disaster response team and BRO heavy equipment verified and deployed at Sonapur tunnel.',
    },
    {
      id: 'aaaaaaaa-aaaa-4000-8000-000000000002',
      incident_id: FIELD_INCIDENTS[9].id,
      updated_by: FIELD_PROFILES[6].id,
      old_status: 'active',
      new_status: 'resolved',
      comment: 'Dredging completed; full navigable draft depth restored for freight vessels.',
    },
  ];
  await supabase.from('incident_updates').upsert(initialUpdates, { onConflict: 'id' });

  const initialActivities = [
    {
      id: 'bbbbbbbb-bbbb-4000-8000-000000000001',
      user_id: OFFICIAL_PROFILES[0].id,
      action: 'incident_verified',
      entity_type: 'incident',
      entity_id: FIELD_INCIDENTS[0].id,
      description: 'Official verified critical landslide on NH6 near Sonapur Tunnel.',
    },
    {
      id: 'bbbbbbbb-bbbb-4000-8000-000000000002',
      user_id: LOGISTICS_PROFILES[0].id,
      action: 'shipment_created',
      entity_type: 'shipment',
      entity_id: SHIPMENTS_DATA[0].id,
      description: 'Pharmaceutical shipment from Guwahati to Dibrugarh scheduled.',
    },
  ];
  await supabase.from('activity_logs').upsert(initialActivities, { onConflict: 'id' });

  // 10. Live Count Verification from Supabase Database Tables
  const { count: driversCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver');
  const { count: logisticsCount } = await supabase.from('logistics_operators').select('*', { count: 'exact', head: true });
  const { count: fieldOfficersCount } = await supabase.from('field_officers').select('*', { count: 'exact', head: true });
  const { count: officialsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'official');
  const { count: vehiclesCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true });
  const { count: fieldIncidentsCount } = await supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('reporter_role', 'field');
  const { count: driverIncidentsCount } = await supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('reporter_role', 'driver');
  const { count: shipmentsCount } = await supabase.from('shipments').select('*', { count: 'exact', head: true });
  const { count: alertsCount } = await supabase.from('alerts').select('*', { count: 'exact', head: true });

  console.log('\nSupabase seed completed & verified from live database:\n');
  console.log(`Drivers: ${driversCount} existing`);
  console.log(`Logistics Operators: ${logisticsCount}`);
  console.log(`Field Officers: ${fieldOfficersCount}`);
  console.log(`Government Officials: ${officialsCount}`);
  console.log(`Vehicles: ${vehiclesCount}`);
  console.log(`Field Incidents: ${fieldIncidentsCount}`);
  console.log(`Driver Incidents: ${driverIncidentsCount}`);
  console.log(`Shipments: ${shipmentsCount}`);
  console.log(`Alerts: ${alertsCount}`);
  console.log('--------------------------------------------------');
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Supabase Seed] Seed failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runSeed,
  DRIVER_PROFILES,
  LOGISTICS_PROFILES,
  FIELD_PROFILES,
  OFFICIAL_PROFILES,
  VEHICLES_DATA,
  FIELD_INCIDENTS,
  DRIVER_INCIDENTS,
  SHIPMENTS_DATA,
  ALERTS_DATA,
};
