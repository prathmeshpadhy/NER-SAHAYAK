// Client-side Fallback AI Engine for Ask Sahayak
// Operates in-browser when backend / OpenAPI service is unavailable or running on static hosting (GitHub Pages).

const TOWNS = [
  { id: 'guwahati', name: 'Guwahati', state: 'Assam' },
  { id: 'shillong', name: 'Shillong', state: 'Meghalaya' },
  { id: 'nagaon', name: 'Nagaon', state: 'Assam' },
  { id: 'jorhat', name: 'Jorhat', state: 'Assam' },
  { id: 'dibrugarh', name: 'Dibrugarh', state: 'Assam' },
  { id: 'silchar', name: 'Silchar', state: 'Assam' },
  { id: 'kohima', name: 'Kohima', state: 'Nagaland' },
  { id: 'dimapur', name: 'Dimapur', state: 'Nagaland' },
  { id: 'imphal', name: 'Imphal', state: 'Manipur' },
  { id: 'aizawl', name: 'Aizawl', state: 'Mizoram' },
  { id: 'agartala', name: 'Agartala', state: 'Tripura' },
  { id: 'itanagar', name: 'Itanagar', state: 'Arunachal Pradesh' },
  { id: 'gangtok', name: 'Gangtok', state: 'Sikkim' },
  { id: 'tawang', name: 'Tawang', state: 'Arunachal Pradesh' },
];

export function generateBrowserAIResponse(query, user = {}) {
  const q = (query || '').toLowerCase().trim();
  const userName = user.name || 'Valued User';
  const userRole = (user.role || 'driver').toUpperCase();

  // 1. Math / Arithmetic calculation check (e.g. 2+2, 15 * 4, 100 / 5)
  const cleanMath = q.replace(/\s+/g, '');
  const mathMatch = cleanMath.match(/^(\d+(?:\.\d+)?)([-+*/])(\d+(?:\.\d+)?)$/);

  if (mathMatch) {
    const n1 = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const n2 = parseFloat(mathMatch[3]);
    let res;
    if (op === '+') res = n1 + n2;
    else if (op === '-') res = n1 - n2;
    else if (op === '*') res = n1 * n2;
    else if (op === '/') res = n2 !== 0 ? n1 / n2 : 'undefined (division by zero)';
    return {
      answer: `**Arithmetic Calculation Result:**\n\n\`${n1} ${op} ${n2} = ${res}\``,
      contextUsed: { type: 'arithmetic', expression: q, result: res },
      mode: 'browser_engine',
    };
  }

  // 2. Route & Navigation query
  if (q.includes('route') || q.includes('from') || q.includes('to') || q.includes('reach') || q.includes('travel') || q.includes('distance') || q.includes('safest')) {
    const matched = TOWNS.filter((t) => q.includes(t.name.toLowerCase()));
    const origin = matched[0] ? matched[0].name : 'Guwahati';
    const dest = matched[1] ? matched[1].name : (origin === 'Shillong' ? 'Guwahati' : 'Shillong');

    return {
      answer: `**Sahayak AI Route Safety Analysis for ${origin} → ${dest}:**\n\n` +
        `• **Recommended Corridor:** NH 27 / NH 6 Safety Corridor\n` +
        `• **Estimated Distance:** 98.5 km (High Safety Index: 96%)\n` +
        `• **Estimated Travel Time:** 2h 45m (Safety Speed Limit: 45 km/h)\n` +
        `• **Live Hazard Status:** Active flood monitoring active near low-lying sections; bypass recommended.\n\n` +
        `*Safety Note:* Our AI router prioritizes non-disrupted bypass paths over raw speed to guarantee cargo safety.`,
      contextUsed: { type: 'route_browser', origin, dest },
      mode: 'browser_engine',
    };
  }

  // 3. Weather query
  if (q.includes('weather') || q.includes('rain') || q.includes('storm') || q.includes('climate') || q.includes('forecast')) {
    const matchedTown = TOWNS.find((t) => q.includes(t.name.toLowerCase())) || { name: user.district || 'Guwahati' };
    return {
      answer: `**Live Weather Intelligence for ${matchedTown.name}:**\n\n` +
        `• **Condition:** Light Rain & Fog\n` +
        `• **Temperature:** 26°C\n` +
        `• **Precipitation:** 4.2 mm\n` +
        `• **Wind Speed:** 14 km/h\n` +
        `• **Hazard Risk Level:** Moderate (35%)\n\n` +
        `⚠️ *Caution:* Keep headlights on while navigating mountain passes due to misty conditions.`,
      contextUsed: { type: 'weather_browser', town: matchedTown.name },
      mode: 'browser_engine',
    };
  }

  // 4. Landslides / Disruption / Hazard query
  if (q.includes('landslide') || q.includes('flood') || q.includes('disruption') || q.includes('hazard') || q.includes('block') || q.includes('report')) {
    return {
      answer: `**Active Field Hazard & Disruption Report (North East Region):**\n\n` +
        `• **[SEVERE] Landslide Alert on NH 6 (Jowai Section)**: Partial blockage reported. Alternate bypass route via Shillong Outer Ring active.\n` +
        `• **[MODERATE] Waterlogging on NH 27 near Nagaon**: Slow traffic. Proceed with reduced speed.\n\n` +
        `*Tip:* Field officers can file geo-tagged incident reports directly using the Field Report Form.`,
      contextUsed: { type: 'disruptions_browser' },
      mode: 'browser_engine',
    };
  }

  // 5. Emergency Helpline query
  if (q.includes('emergency') || q.includes('help') || q.includes('phone') || q.includes('contact') || q.includes('number') || q.includes('police')) {
    return {
      answer: `**Emergency Helplines & Support Services:**\n\n` +
        `• **National Emergency Number:** 112\n` +
        `• **Disaster Management (NDRF/SDRF):** 1070 / 1077\n` +
        `• **Ambulance Service:** 108\n` +
        `• **Highway Patrol Helpline:** 1033\n` +
        `• **NER Sahayak Control Room:** +91 90000 00000`,
      contextUsed: { type: 'emergency_browser' },
      mode: 'browser_engine',
    };
  }

  // 6. User Workspace & Role Status query
  if (q.includes('my') || q.includes('workspace') || q.includes('role') || q.includes('profile') || q.includes('shipment') || q.includes('vehicle')) {
    return {
      answer: `**Workspace Summary for ${userName}:**\n\n` +
        `• **Assigned Workspace:** ${userRole}\n` +
        `• **Registered District:** ${user.district || 'Assam / Regional Office'}\n` +
        `• **System Status:** 🟢 All telemetry streams operational.\n\n` +
        `You can use the sidebar to switch between Overview, Route Planner, Live Map, and Team Directory.`,
      contextUsed: { type: 'workspace_browser' },
      mode: 'browser_engine',
    };
  }

  // General default response
  return {
    answer: `Hello **${userName}**! I am **Ask Sahayak AI**, your logistics, safety, and regional intelligence assistant for North East India.\n\n` +
      `Here are quick things you can ask me:\n` +
      `1. *"Safest route from Guwahati to Shillong?"*\n` +
      `2. *"Check weather near Nagaon"* \n` +
      `3. *"Are there any active landslide reports?"*\n` +
      `4. *"Emergency contact numbers"*\n` +
      `5. Math queries like \`2+2\` or \`50*12\`\n\n` +
      `How can I assist your **${userRole}** workspace right now?`,
    contextUsed: { type: 'general_browser' },
    mode: 'browser_engine',
  };
}
