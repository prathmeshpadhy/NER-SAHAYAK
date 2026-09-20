const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Core UI + notification strings translated for every supported NER language.
// Used by the frontend to render alerts/notifications in the user's
// preferred language (set on their profile), and for SMS/push templates.
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'as', label: 'Assamese' },
  { id: 'bn', label: 'Bengali' },
  { id: 'hi', label: 'Hindi' },
  { id: 'mni', label: 'Manipuri (Meitei)' },
  { id: 'kha', label: 'Khasi' },
  { id: 'lus', label: 'Mizo' },
  { id: 'nag', label: 'Nagamese' },
];

const STRINGS = {
  en: {
    weather_watch: 'Weather watch',
    route_update: 'Route update',
    field_report: 'Field report',
    road_blocked: 'Road blocked',
    heavy_rain_warning: 'Heavy rainfall expected on your route. Please plan for delays.',
    route_clear: 'Your route is currently clear.',
    delivery_delayed: 'Delivery delayed due to route conditions.',
    new_alert: 'New alert on your route',
    sync_complete: 'Offline reports synced successfully.',
  },
  as: {
    weather_watch: 'বতৰৰ বতৰা',
    route_update: 'পথৰ আপডেট',
    field_report: 'ক্ষেত্ৰ প্ৰতিবেদন',
    road_blocked: 'পথ অৱৰুদ্ধ',
    heavy_rain_warning: 'আপোনাৰ পথত ধুমুহা বৰষুণৰ সম্ভাৱনা আছে। বিলম্বৰ বাবে পৰিকল্পনা কৰক।',
    route_clear: 'আপোনাৰ পথ বৰ্তমান পৰিষ্কাৰ।',
    delivery_delayed: 'পথৰ অৱস্থাৰ বাবে ডেলিভাৰী বিলম্বিত হৈছে।',
    new_alert: 'আপোনাৰ পথত নতুন সতৰ্কবাণী',
    sync_complete: 'অফলাইন প্ৰতিবেদন সফলভাৱে ছিংক হৈছে।',
  },
  bn: {
    weather_watch: 'আবহাওয়া সতর্কতা',
    route_update: 'রুট আপডেট',
    field_report: 'ফিল্ড রিপোর্ট',
    road_blocked: 'রাস্তা অবরুদ্ধ',
    heavy_rain_warning: 'আপনার রুটে ভারী বৃষ্টির সম্ভাবনা রয়েছে। বিলম্বের জন্য প্রস্তুত থাকুন।',
    route_clear: 'আপনার রুট বর্তমানে পরিষ্কার।',
    delivery_delayed: 'রুটের অবস্থার কারণে ডেলিভারি বিলম্বিত।',
    new_alert: 'আপনার রুটে নতুন সতর্কতা',
    sync_complete: 'অফলাইন রিপোর্ট সফলভাবে সিঙ্ক হয়েছে।',
  },
  hi: {
    weather_watch: 'मौसम चेतावनी',
    route_update: 'रूट अपडेट',
    field_report: 'फील्ड रिपोर्ट',
    road_blocked: 'सड़क अवरुद्ध',
    heavy_rain_warning: 'आपके मार्ग पर भारी वर्षा की संभावना है। देरी के लिए तैयार रहें।',
    route_clear: 'आपका मार्ग फिलहाल साफ है।',
    delivery_delayed: 'मार्ग की स्थिति के कारण डिलीवरी में देरी।',
    new_alert: 'आपके मार्ग पर नई चेतावनी',
    sync_complete: 'ऑफ़लाइन रिपोर्ट सफलतापूर्वक सिंक हो गई।',
  },
  mni: {
    weather_watch: 'নোংমাদগী চেক',
    route_update: 'লম্বীগী আপডেট',
    field_report: 'ফীল্ড রিপোর্ত',
    road_blocked: 'লম্বী থিংবা',
    heavy_rain_warning: 'নহাক্কী লম্বীদা ঋৎ চম্বা য়াই। থামথীবা লৈনবা তৌবীয়ু।',
    route_clear: 'নহাক্কী লম্বী হৌজিক্তু সেংনা লৈ।',
    delivery_delayed: 'লম্বীগী মতাংদা ডেলিভারী থামলে।',
    new_alert: 'নহাক্কী লম্বীদা অনৌবা চেক',
    sync_complete: 'অফলাইন রিপোর্তশিং মপুং ফানা সিংক তৌরে।',
  },
  kha: {
    weather_watch: 'Ka jingpynbna slap bnai',
    route_update: 'Ka jingthrang lynti',
    field_report: 'Ka report jong ka field',
    road_blocked: 'Ka lynti ka la khang',
    heavy_rain_warning: 'Slap khyndew baiap ha ka lynti jong phi. Wanrah ïa ka jingiaseng.',
    route_clear: 'Ka lynti jong phi la dei ban leit noh mynta.',
    delivery_delayed: 'Ka delivery ka la iarap namar ka jinglong jong ka lynti.',
    new_alert: 'U bnai u thymmai ha ka lynti jong phi',
    sync_complete: 'Ki report offline ki la sync bha.',
  },
  lus: {
    weather_watch: 'Thlipui thlirna',
    route_update: 'Kawng thar hriattirna',
    field_report: 'Hnathawh report',
    road_blocked: 'Kawng a khar',
    heavy_rain_warning: 'I kawngah ruah nasa tak a lo chuak dawn a ni. Hun buatsaih hi ruahmanna nei rawh.',
    route_clear: 'I kawng hi tunah a fel a ni.',
    delivery_delayed: 'Kawng dinhmun avangin thil thlen a hun awm.',
    new_alert: 'I kawngah hriattirna thar',
    sync_complete: 'Offline report te chu an sync ṭha ta.',
  },
  nag: {
    weather_watch: 'Weather laga khobor',
    route_update: 'Route laga update',
    field_report: 'Field laga report',
    road_blocked: 'Rasta bondh ase',
    heavy_rain_warning: 'Apuni laga route te bhari borokhun hobo pare. Deri hobole pare, taiyar thakibi.',
    route_clear: 'Apuni laga route etiya safa ase.',
    delivery_delayed: 'Route laga condition nimite delivery deri hoise.',
    new_alert: 'Apuni laga route te notun alert',
    sync_complete: 'Offline report gulu thik pora sync hoise.',
  },
};

router.get('/languages', requireAuth, (req, res) => {
  res.json({ languages: LANGUAGES });
});

router.get('/strings/:lang', requireAuth, (req, res) => {
  const lang = STRINGS[req.params.lang] ? req.params.lang : 'en';
  res.json({ lang, strings: STRINGS[lang] });
});

module.exports = router;
module.exports.LANGUAGES = LANGUAGES;
module.exports.STRINGS = STRINGS;
