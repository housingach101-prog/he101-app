import { useState, useEffect, useCallback } from "react";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://jmdhtqlzrslkbtxejhcx.supabase.co";
const SUPABASE_KEY = "sb_publishable_mMEa2LAqj2W9HsrrPtTVqw_VuuBAifq";

const supabase = {
  async query(table, options = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();
    if (options.select) params.append('select', options.select);
    if (options.filter) Object.entries(options.filter).forEach(([k,v]) => params.append(k, `eq.${v}`));
    if (params.toString()) url += '?' + params.toString();
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      }
    });
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase insert error on ${table}:`, res.status, errText);
      throw new Error(`Insert failed: ${res.status} ${errText}`);
    }
    return res.json();
  },
  async upsert(table, data, onConflict) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async update(table, data, filter) {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([k,v]) => params.append(k, `eq.${v}`));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};

// ─── FONTS ────────────────────────────────────────────────────────────────────
const FONT_STYLE = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=Playfair+Display:wght@700;900&display=swap');`;


// ─── OFFICIAL PROGRAM DESCRIPTION ──────────────────────────────────────────
const OFFICIAL_PROGRAM_DESC = "Housing Etiquette 101 is a structured, prevention-based digital housing education platform that prepares renters for successful tenancy by addressing the behavioral root causes of lease violations and housing instability. Through 8 interactive modules covering lease compliance, income reporting, communication, and eviction prevention, HE101 equips participants with the knowledge and accountability skills needed to obtain and maintain stable housing — while providing agencies, case managers, and housing authorities with real-time progress tracking, completion certificates, and funder-ready outcome reporting.";

// ─── BRAND ───────────────────────────────────────────────────────────────────
const B = {
  orange: "#CC5500",   // Burnt orange
  teal: "#00A3A3",     // Turquoise
  navy: "#1B2A4A",
  gold: "#F5C842",
  green: "#2E7D32",
  red: "#CC5500",      // Use burnt orange instead of red throughout
  light: "#F7F5F0",
  white: "#FFFFFF",
  gray: "#78909C",
  accent2: "#007A7A",  // Deeper turquoise for contrast
};





// ─── EMAIL NOTIFICATIONS ─────────────────────────────────────────────────────
// Uses EmailJS free tier - sends email when participant completes module or program
const sendNotification = async (type, participant, module, caseManagerEmail) => {
  try {
    const isComplete = type === 'program_complete';
    const msg = isComplete
      ? `🏆 ${participant.name} has completed all 8 modules of Housing Etiquette 101 and earned their Certificate of Completion!`
      : `✅ ${participant.name} completed Module ${module} of Housing Etiquette 101.`;

    // Notify participant
    await supabase.insert('notifications', {
      type,
      participant_name: participant.name,
      participant_id: participant.id,
      agency_id: participant.agency,
      module_id: module || null,
      message: msg + ` Participant email: ${participant.email || 'N/A'}`,
      created_at: new Date().toISOString(),
      read: false
    }).catch(() => {});

    // Notify agency case manager
    if (participant.agency) {
      await supabase.insert('notifications', {
        type: type + '_agency',
        participant_name: participant.name,
        participant_id: participant.id,
        agency_id: participant.agency,
        module_id: module || null,
        message: `AGENCY ALERT: ${msg} — Please follow up with ${participant.name}.`,
        created_at: new Date().toISOString(),
        read: false
      }).catch(() => {});
    }

    // Notify HE101 admin (super admin record)
    await supabase.insert('notifications', {
      type: type + '_admin',
      participant_name: participant.name,
      participant_id: participant.id,
      agency_id: participant.agency,
      module_id: module || null,
      message: `ADMIN RECORD: ${msg} — Agency: ${participant.agency || 'Self-enrolled'}`,
      created_at: new Date().toISOString(),
      read: false
    }).catch(() => {});

  } catch(err) {
    console.log('Notification logged:', type, participant.name);
  }
};

// ─── PDF CERTIFICATE GENERATOR ───────────────────────────────────────────────
const generateCertPDF = async (user, agencies) => {
  // Load jsPDF dynamically
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297; const H = 210;

  // Background
  doc.setFillColor(27, 42, 74);
  doc.rect(0, 0, W, H, 'F');

  // Orange border
  doc.setDrawColor(204, 85, 0);
  doc.setLineWidth(3);
  doc.rect(8, 8, W-16, H-16);
  doc.setLineWidth(1);
  doc.rect(12, 12, W-24, H-24);

  // Inner white area
  doc.setFillColor(255, 255, 255);
  doc.rect(16, 16, W-32, H-32, 'F');

  // Header bar
  doc.setFillColor(204, 85, 0);
  doc.rect(16, 16, W-32, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('HOUSING ETIQUETTE 101 (HE101) · ACH MANAGEMENT & SERVICES LLC', W/2, 27, {align:'center'});

  // Title banner
  doc.setFillColor(0, 163, 163);
  doc.rect(40, 38, W-80, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE OF COMPLETION', W/2, 50, {align:'center'});

  // This certifies that
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('This certifies that', W/2, 65, {align:'center'});

  // Participant name
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(user.name || 'Participant', W/2, 78, {align:'center'});

  // Underline
  doc.setDrawColor(27, 42, 74);
  doc.setLineWidth(0.5);
  doc.line(60, 81, W-60, 81);

  // Has completed
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('has successfully completed the', W/2, 90, {align:'center'});

  // Program name
  doc.setTextColor(0, 163, 163);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Housing Etiquette 101 (HE101) Certification Program', W/2, 100, {align:'center'});

  // Description
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('and has demonstrated competency in housing responsibility, respectful tenancy, and community-centered living standards.', W/2, 110, {align:'center'});

  // Curriculum areas - two columns
  const areas = [
    'Successful Renter Mindset & Accountability',
    'Housing Types & Shared Living',
    'Rent, Subsidies & Income Rules',
    'Lease Agreements & Compliance',
    'Unit Care & Property Damage',
    'Maintenance, Inspections & Recertification',
    'Communication & Conflict Resolution',
    'Evictions, Legal Consequences & Housing Stability'
  ];
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  areas.forEach((area, i) => {
    const col = i < 4 ? 30 : W/2 + 5;
    const row = 120 + (i % 4) * 8;
    doc.setFillColor(0, 163, 163);
    doc.rect(col, row - 3, 3, 3, 'F');
    doc.text(area, col + 6, row, {});
  });

  // Bottom info bar
  doc.setFillColor(245, 247, 250);
  doc.rect(16, H-52, W-32, 18, 'F');

  // Cert ID
  doc.setFillColor(245, 200, 66);
  doc.rect(20, H-50, 70, 13, 'F');
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cert ID: ${user.certId || 'HE101-' + Date.now()}`, 55, H-42, {align:'center'});

  // Date
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date Issued: ${user.certDate || new Date().toLocaleDateString()}`, W-30, H-42, {align:'right'});

  // Signature lines
  const sigs = [
    { name: 'Antwan Howard', role: 'Authorized HE101 Representative' },
    { name: agencies || 'Partner Agency', role: 'Licensing Partner / Agency' },
    { name: 'Chantell Howard', role: 'Program Facilitator' }
  ];
  sigs.forEach((s, i) => {
    const x = 35 + i * 85;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(x, H-28, x + 65, H-28);
    doc.setTextColor(27, 42, 74);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(s.name, x + 32, H-23, {align:'center'});
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(s.role, x + 32, H-18, {align:'center'});
  });

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(6.5);
  doc.text('© 2026 ACH Management & Services LLC · housingetiquette101.org · Building Stability Through Education & Accountability', W/2, H-10, {align:'center'});

  // Save
  doc.save(`HE101_Certificate_${(user.name||'participant').replace(/\s+/g,'_')}.pdf`);
};

// ─── RESPONSIVE BREAKPOINTS ───────────────────────────────────────────────────
const RESPONSIVE_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Montserrat', sans-serif; }

  /* Desktop login - two column layout */
  @media (min-width: 900px) {
    .he101-login-wrap {
      display: flex !important;
      max-width: 100% !important;
      min-height: 100vh;
      padding: 0 !important;
    }
    .he101-login-left {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1B2A4A 0%, #1B3A5A 50%, #00A3A3 100%);
      padding: 60px;
      min-height: 100vh;
    }
    .he101-login-right {
      width: 480px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      background: white;
      min-height: 100vh;
      overflow-y: auto;
    }
    .he101-login-card {
      max-width: 100% !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
      width: 100%;
    }
  }

  /* Desktop renter portal - two column */
  @media (min-width: 900px) {
    .he101-renter-content {
      max-width: 860px !important;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      align-items: start;
    }
    .he101-renter-hero {
      grid-column: 1 / -1;
    }
    .he101-renter-cert {
      grid-column: 1 / -1;
    }
  }

  /* Admin dashboard - wider content area */
  @media (min-width: 900px) {
    .he101-admin-content {
      padding: 32px 40px !important;
    }
    .he101-kpi-grid {
      grid-template-columns: repeat(5, 1fr) !important;
    }
  }

  /* Module detail - wider on desktop */
  @media (min-width: 900px) {
    .he101-module-wrap {
      max-width: 800px;
      margin: 0 auto;
    }
  }

  /* Smooth transitions */
  .he101-card { transition: box-shadow 0.2s; }
  .he101-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important; }
`;

// ─── LOGO ────────────────────────────────────────────────────────────────────
const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCADIAMgDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAAUBAwQCBgf/xABFEAACAQMDAQQHBAYHBwUAAAABAgMABBEFEiExEyJBUQYUYXGBkcEjMlKxFTNCcqHRJDRDYpLh8BYlU1Rjg/E1gpOisv/EABkBAQADAQEAAAAAAAAAAAAAAAABAgMEBf/EACcRAAICAQQBAwUBAQAAAAAAAAABAhEDBBIhMUETIlEUMkJxgWEz/9oADAMBAAIRAxEAPwD6ZRUVNCQooooAooooAooooAooooAooooAorl3VFLOwVR1JOAKFZWUMpBU9CDkGgOqKKKAKKKKAKKKKAKKKKAKKKKAKKKKAipqKmgCiiigCiiigCiiqbq4jtbd55iQiDJwMmhHRbRXn5PSKWdimm6fNM34mBx8h/OqzaekOof1m4W0jP7KnB+Q/nVtvyU9ReOR3d6haWY/pNwiH8OcsfgOaTP6Q3F45i0iyeRum9xwPh0+Zq+09GrGA75y9y/jvOF+Q+tOERYkCRoEQdAowBS4oipy74ECaFeXziXWL1mHXskPA+g+AqttD1LT3Mmj3pK+MTnGfof4U11bURYxAJhpn+6p8B5mrbTUIbq0M6cbQd6+KkCqLOt22zT6Z7d9f0URekc9q4h1eyeJ/wAaDGfgfoac2mpWd6P6NcI5/DnDD4GscesaXf7bdju7Q4CSx8Ems156LWM/etne3bwA7y/I9PgatGcJ9FZQy4+GP6mvKi09JNN/q063cQ/ZJ3fwPPyNXRek0sDBNT0+WJvNQR/A/wA6nb8Eeovy4PSUVTa3Ed3bR3EOdkg3LkYNXVU0QUUUUAUUUUAUUUUBFTUVNAFFFFAFFFFAFLteH+5br9wfmKY1h1pd2j3Y/wCkT8ualdlZ/ayrQP8A0S1/dP8A+jTGlfo427RYPYWH/wBjWjVNRh0yya4m5PRE8XbwFH2RB1BNmL0j1kaZbdnCQbqUdwfhH4j9K8/oNoyr+lr+SQwo32SFz9q/n7v9eFUafaTa5qEt3fSYhU755OmB4KKZXtx6zIAi7IYxtijHAUVlqMywxpdsvpsL1E9z+1GW5mkuZ3mlOXY/L2VFvcyWsjPGeGUqy+DA1rGmTtZG7Bj7MKW684FcXumXFpbieUxlSQO62TzXlqORe49rfjfs/hh0pT+lLQf9Vfzr3wr5ww5p5YXs+k2Hrl/cStHJ3be2JyZD589BXVpZ87Ujm1sFW9vo9XSb0jug2k3kKI77Y8uwHCc/nVmiaympq8ciiK6i+/GDwR4MPZ+VZta3w6dfWxjZ0uFOxgQOfIk8V3O0zzLUo2jT6NXMcukW0Sk7kiB5GMjJGfmCKb14rTZXia1jSQIVi27UOezySdu7306i1WS1dEusyxO2N/7ScePmOK5/qob9rNY4ZbeB5RUAggEHIPINTXQUCiiigCiiigIqaipoAooooAooqKAms2oLv0+5XziYfwNXSSCNCxBOPADrWNL0TOY5FCq42g586q5qLSZOxyTow+jMoXQyxBIjd8hRk+B6UgvY9U17Vl32k8EWdsYkQhY18Sfb/wCKd+iTEWlzCescv0x9KfVq5bZMwjHfBJiG/svUtPit4Nq2yEAj9p28zSvFeh1oZtF/fH5GkTCvG1f/AFZ7OldY0hpFHMdDYicCPs27nZjpz41XrUc40xDJcB13r3ezA8POsHbTCLshK4jxjbu4q6JXmhaa/uHWyh5csxwceAq8cimtkU7qiHDY98mquzFbW0FvbtqWonFrH9xPGVvACq9Ptrr0h1Nr27BSJeFUdI18FHtP+dZL67fV7wSuuy0h7sMXgB5n2/8AimSmNdBBlMuPXB+rxnOPb4V6WHCsUaXZ4+o1L1GTnpHOraZPpt1Hc2blSjZhk8j4q3sNbL/VotU9Eb5wvZzogSaE9UJI+YPga4jKHTdTCdrxcgHtMefh7Kx6jHDB6KXE6xqJppVjZ8clQc4/hWv7MYum0uqNOk26DTbNmUBuyUjw91Tc3MT3kECupEb75CDkDHQU9sLWJtHs4J4kdVgQYZc/silmo6bHYkzRQ77Zv1sS8EY/aXyYfxFeVn09Nyvg9XDkVJMLXVZ9PjWG5RWiTupIeAy+He6dPOmttq9rPjvFT7eR8xS+HSZliElhfLJFIAyiVOGB9o/lWy30i2aEeuWlq03iY0wPpWmNZ06sibxsZqwYAqQQfEVNcRRpFGscahUUYAHQV3XYv9OcKKKKkEVNRU0AUVl1K6NlYTXITeYxnbnGea8vL6U3z5EUcEfwLH+NWUW+jOeSMOz2OaK8HJrupvnN4y/uKF+lZpLm/nkCNPdO7dF3Nk/CremzN6heEfQ2YL94ge84rJ2lhC+4y26nOeZB/OvAdlNIhk2O6hwhPXvHoPfWltKvUljie3CvIGKguvgMnoeOKh4o+WFnl4R6HTXtNOvbyR9RtDFO2VVXyRyTz863treljrfR/AE/SvGxWFzItmwVQl5xExbj4+VTHY5tzcXV3BaxFzGjSk99h1wB+dWcYvlspHJNcJHp7zV9JuIgjX2ADnuxsfpWE3Wjf89L8IT/ACpDZWpvb5LVJVBckB8EjjPP8KshtbGa4WGLV4W3cBhA+N2cAVlPTYpO5I1hqsyVRHHrWi5/rs//AMJrnU7rSNQSKH9ITQwRdI1gOCfM0rm06NJbuOK9SVrSNnlAiZcEEDHNWLpAMiWzXkS3sib0typ54yAW6AkeFTjw4sfMeCMmfNkW2XJoEejYAXVGAHQG3NNtMvtKsrdov0ij7m3ZKFa8wLF82P2ij1wkKMfcw23mr/0WFhMk19awL2rxDtSRuKnBxxWrjHyzGDcXaieovL3Try0eGPULZWYg5ZsdDSnVNPa80iC0tbuzkKzmR/tgOMYH50rj0uSa2NxHd2RjGNxM4G0noDkcGofSLwQGfs4XiALFklUjAGT41CjFdMs3Ju3E99GU2KqMpAAAwc12VDLhlyD5186m0++tI+1ltpYoxjv+HPTkGogu7xM9jc3AC9drtxVXjTXZf12u0fRIIo7eFIYVCogwo8qtrwKa5qcfS9c+xsN+YrVF6Uagn31gkHtTH5GnpNdE/URfZ7SppPoesvqjyo9usfZqDlWznJpvVWq4NYyUlaJoooqCxFZLvU7KzbbcXKI34ep+QrXSzWtLTUrfu4W4Qdxz+R9lSqvkrK64Ml1rNnqNvc2Vv2rM8DkMVwOBn3153R4I7qS6jkEfNszI0nRGGOc+Fd6Orw65DDMpRyzRMp8MqRWS2uWsmkZYw5aJoiGOBzxWu2k0jkc9zTkOoIY41sGheCeRIbko8feVnGCPfjNVaPdTXNtaz3srTPFfIscrnnDDkZpKL+5jjtY4mEfqrs8br97LdfZiour+6vCnrEwIQkqqKEAPngePtpsZPqIawie1s7thERKmoRdmrKe8wY8e2tlraW0WpWl8tnLYz3M0iSQyNnd3CSw8cZpDJLqF6U7SS6uNnKZ3NtPmMePtoGmanO282l3I2MbnDE495o4/LCn8IeaTeRCHSbW5YCJ4Q6En7kiOce7I4qlvVr31dBcWoNncSiSOdwFeNnzuHnxS1NA1M5/oRXPXcyj61evo5qJGDFCo8jKtVe1eSbm1W0mxmtYPSMTJJGlqs77Wz3QvIHwriaZzqFrLcX9jcBHBzbKFCAMDzgCrh6OX/i1sP+7/AJV1/s3e+M1qP/ef5U3wvsbclVtKfWrf1rWn7ZNlxHKsTZ4clsjFb7cW99rEeqxXAJijEklsoJl3KuMAeI6Vm/2ZvP8AmLX/ABN/KpHo3fo4eO6t0deQyyMCPjioc4eJEqOTzEi1lt7iPTJp7y3tntHdpo5Ww2C+7u+flVyXZudMAtn03e9zNI0d4wBCseCAehqmT0d1F2LPcWzsTks0pyT8qpb0Z1A+Fs3/AHR/Km6D8ipr8SlSp9H7pCVJ9ai4z1wDUTop9HLQbRj1qU9P7ort/RzUxg+rxsR0xKtcHQtUU59SkJ/ukH61e4vyU2yXg2eksCfpCWX1O8V8R/blz2LDaPDz+tV6ZcTDStUg34iW2ZwMD7xIGc1kez1VFKSxX/Znkqxdl+XSq1e4gSRBvjWVdrgp94eXIolxQlL3WP8AtGOsx6VhfUDajMe0ckoW3Z65z40uPYP6ORTLbIkonWMyZJZ+7kn2c+FUDVLsW3YK8X6sxCXswZFT8Ibyqv1pvUFshGoRZe13Z5zjGMUUWg5pjr0fvYtNsri6nV2V5UiG3GehNPbfX9Mn4FyEJ8JAV/yryMvc0K3X/iXEjfJQPrTb0b0XeUvrte71iQ+P94/Sokl2y+OUrUUesByM0UCisjqCs97cJaWstxJ92NS2PPyFaKX6xp8upW6QJOIk3bnyuc46VK75IldcHiIbp11OO8mJZhKJG+eTWt7W0uJ3kt7u2lVmLdjI5gbk5xkinCeilqv666nf91Qv86vX0c0pPvQyyfvyH6Vo5xOWOGfkXQiwtV3Xno9PGB/ar9uvzzTaynsLmDtdPWPYDtOIgpB8ulX21jZWn9VtkiPmuasdVwcADPXAxXNmna4OrFCnyZLy99UhDt2jlmCIidXY9AKySX9xvihFk3rUm49m8o2hRjLFhnjkDpmtV5ZR3NuIi7oUYOkiHvIw6GqG06SQxyPeTm4jLbZkRVwpxlduMY48fGuVPjk6P0ZBrca3FvHPCYRIZElLNnsnUgYPmDnr7RVA16SSKORRb26STSIGuM4CqoKnjxOaZLo9oIwkkTSja6t2pzv3kFi3mSQKtSwtopu2VMPvZxluAWAB49wFT7fgj3fJn0u/lvpGWWERYhikxzkFt2fy499YbjXmgsbOY9iJJVaWVWOPs1bB289fL3Gmkllby3RuCXEuACUmK5x0yAeetcxWdhD9xIfu7O8wbu5JxyfMmir4HPyL73XJbWe9TYnZIi+ry+DOVDbT7xyPdW2Ce8uZppY2hS3hmaLsyhLMF6nOeDnoMdKn1HTvV3gKQmKQKGUyZyFGF8fCu2tbB7n1kiHtcglhJjJHAJGcE+2pr/B/TNod7c31uk1yW76BsermMZPkxJ3Cs7apehI5GVIrfMgefsWkUFXKgHB7owM5phZ2dlZf1UqgxjHbFgB7ieKiTTrJwI2TC890SsAwJyQQDyMk1Hnoc12VatqyaZ2DOm9Jdw46kgDGD0GSepqu41Oa2u4rSZbNJXhDsXlZRuLEbVODmt81pBcNGZYw/ZhlUeGGGCMe6s66UiSRvBc3cTJGIhtcHKg5AOQc9aKq5Jdh+lNt4bPsn9Z7QKsat1QjO/PkBn48UzV26FiQOueazeqr67633t/ZdljHGM5q+NFVywHLdarfwP2LZtQ0y6JWDTpL9v8Ap2/H+I4pTd2UTPl4bTTF8RJdb2/wjNeteOKWLs5YkeP8JHFYH0DSJCf6EIz5xMVr0ITSOOeNs8vqEtv6vaW1tN2wgDlnCFQSxzxmvReid729k1o5y8B7vtQ/yPHyqJPRawb9VNcx+8hvpXem+j0mnaglzDeB0AKurJgkH4+6tHKLVGcYTjO6H4ooFFZHSFTUVNARRU1FAcsit4Y91VNbA/2soHsIH0q81wzbTk4CAZJJ6VV15J5KPVI/F5j/ANwj8qPU7fxQn3ux+tTHcwPIVSZWYnhf5VcpJALDB8qiLi+g012VC1gHSFPlmuuxiH9kn+EVbRirECXVNEE8ovNOk9Uvk6OB3ZPYw+tK2uIHmEGsW40698JAMxS+3NeuxVF1bQXcJhuYkljP7LD/AFirKRnKFnm5bGSEBmQFD0deVPxohsXnP2aDaOrHhR8avfQ7nTi02jX5ij6tBOcxn4+H+ua7Gj3mqIravfYgPK29qcJj2nxq9mHpcmRrm0t5uw0yAanf+G0fZx+0mmek6M0MzX2pSC5v5By2O7GPJR9aY2Vla2EPY2kKxJ446n3nxrRgVRyN4wSOOzT8C/IVyYIj1jQ/CraKqaFBtIP+Hj3MR9aPVYx0Mg90hri/vYrG3Mspz4Ko6sfKsmk6zFqAaNgI50ySmeo8xVHKG7a+y6xycdyXAyWJV8z7zmuwKzWV7BfRtJbOWVW2nKkc1qqypq0VaadMKKKKsQTRRRQEUUUUAUVyTUA1FknR5pbqjMiRx7iQck58aYnBGD41lu7dZYCiLgoMrxx7qx1EXKDSL42lJNiEtlshuRzkHpXordmkhjkYnLICR4Uogga4nWNgwU8k48MU6RVyMJgrwOOlc2jg02/Btnmmkiyiiob9n94V6Byk0i1e7v01OO0spAvaICAQOvOeT7qeUm1JQuvafIejAp+Y+tWj2ZZb2iq4JYZ1XUe3A57CFt273kcCs1tJIrEaJqqwg8m1uHClT7CeGFVi1mftEjjZjEDuCjoBxS7UrGG3uLa3Epe9dx2sYAKx5xhc/i860OWMm3dHrNAvtRm1G6tNRdWaBBkBRwc+Yr0FINGXd6QatKOm8Ln4/wCVPxWcuzrx9E1TdXCWsDzSZ2qOg6n2VYv7X7xrJdXbW9woKgx4y3nispy2o2hHczyt7czX1wZpQfJVHRR5UuPaxXPaRb1dWyCAcivZX901jZSXESq5XAAJ4OTWLStbn1C8NvLDGilGbKk54rkhppTTnZ1vXxg1j2h6JXCdlNbMGEpfeMjgjAFekpHZMV9JLhcnb6qpxnj71bhfFr3sY1BXJBPtrohUIpMwyP1JuSRuqarVjnmrK2MQooooCKhmC9amq3VmbpQAHDHFQ7beAOa52OPCgK4HQ/OoFnYYHFZbq+shFJFJdRAspXGd2PgKvXeGyQT7zXn77Q5Y3Z7Nd0ZOez8V93nVopeTPLKSXtVmeym0/Tr9JZdUiO0HKiFxnI88mvQ2upWN2wW2vIZWP7Ktz8uteEvNNv7m82QWc7sFGe4QB7yeK9J6N+j501jdXZVrphhQvIjB68+Jq0kjLDKXVcHpBUEdPeKBR5e+qHSBpTr8LtZieL9ZbtvHu8fofhTU1imSVnLFD8BUp0Uycxo87eyPganZuUWX7xU8xyY5B/Ok+kQrDcHVbrJhtm3DJ5ll8FHnzyad3FndabLJPZRGWCT9bbspII9316iqLawudRmiudRhMVpD+otI1IBHu8B5k8mtL4OVLmx36N2zxaeZ5v1ty3aH3eH1PxpyKR9rqZu45Et5HRc9zG1cGnaklQSMHHIz0rN/J04mqpABjd7zWPVEzCsgH3Dz7jW0ePvqCAQQcEGs5x3KjaEtrs81emafT3tV2EHG0nIPBzSnSPXLfUn2RKrxqVftM4XPu616i60/Yd1sCR4p5e6s72s4RdsRJJOQByPLP8awjPJji40aSw4sk4zujDOiTzdpIgklwAXI4AHsprpEON0hHAG1frXNrpxGGnjJ8kH1pge0CbUi2rjGAOlMWKTe6RfLlgltgWEkHjyz0rntm7TacdcdKr2yY6NUbJN2SjH4V1HJZsoriMkr3gQfbRQsd+Fc7fa3zrqigOdn95vnXEziGF5GyVRSx88AZq2qrmIzW0sQOC6MufLIxQGSO/U23rF1GbWIgFWkdTuz06E1NtfQXNu0wkQKu453Z7qsRu93FY7fSpreKHsksopIHDr2attc7Sp3fA8EVH6Iult5I47mENNHJHITGcDezNlRnw3Ec0Bva9tVkaJrqIOi72Uv0GM5+VV/pSw326rcoxuGKpt5yR1HsqtbG7hjuIbe4iSOUs6uUO9WP8Me3riqrfSriGQSmdGcztIwJY91kCkZJzkYzk0IGUF1bzu6QTRyNGcMFbOKuPGPbSvSdLNgwLur7IhEjBnJ25zyCSB0HApmRnHvoCq7nW1tZZ3UssaliF6msy6nAjPHeA2kqY7krDnOcEEEg9D8quv7c3djPbhtplQruPhVI0y3SeCWBAvZzdqxYlmY7So5PPGaEkzanYwrOXuo8wKWkUNkgDrXS39mxhAuo8zjMYLctWM6RKyC3eaMW8ayiLap3kuCO94cbj068Vy2kSS3AmnkjbeIxKgaQL3DxgA8/HxoQbJdVsIVkMl1H9kQrgHJUk4/OtikMoZTkEZB86WLp9wunvZLLDsXBhbYd2Q+7vf5e+mabto343Y723pn2UBI5B9+KzXN52M6QRwSTSupcKpUd0YBPJHn0rSBj51h1Sye9jEYW2IwcNKpLIfxKQeDQGnt4sZMiDv7OT0by99Zm1ewXssXaMJZOzUqcjOM/wCvfVH6MuO1VDcRvbiYTHepLsQu0g+GD1qINOu4Vj2zx/Yyh4ojuKIoUqQCefHOOgxQk2m/tvtRHPG7xEBl3gYycePtruK9tZp2hiuInkXOVVskYODSs6PdSTvLPeCQlSgJ3dO0V84zgcLjArbb6eYTbnev2UsshwOu8sfrQg3YqNv99vnXQqaEkKMeJPvoqaKAKKKKAKKKKAjFRiuqyCeU3piIG3OANpzjzzQGmjFLXvphIyqY3UMQCFPePHd69eTz7K6ivpXljVV7RGlKmREOMfTn+HvoBhiisEl7KJmXZ2ce7uyuhwAM5Pzx867iuZnl2mLud/DjocYxx18aA2UUsOozRKrT2xAKrwM5Zj1x7KmXVDCF7W2YFuQAc8Yz5UAyoxS2HVHmYKlsSxAwd3HJx5Z/hUNqkilVNm+4ru+97M46dfOgGeKKweuy7LnMSq0S5AyTk5I8unHWoN+5tIZgFG5tr5XJ+Azz/rrQDGil8WovIGb1Vwq5LZbkAEZ4x156eyoOouquWt2BUZCk8n3cc+3yoBhijFYVv2eKZuy2NGgcAnOc+6unvRmRY3ThlAbqApxlvaKA24oxXELb41ber5H3lGAasoAooqaAKKKKAiiiigCiiigCooooAxRiiigDFGKKKAMVDKGUqwBBGCD40UUBCRpGgSNQqjoAMCusUUUAYoxRRQBijFFFAGKMUUUAVNFFATRRRQBRRRQH/9k="; // HE101 Logo embedded

// ─── MODULE COVERS ───────────────────────────────────────────────────────────
const MODULE_COVERS = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
  7: null,
  8: null,
};

// ─── GOOGLE FORM QUIZ LINKS (your actual links) ───────────────────────────────
const QUIZ_LINKS = [
  "https://forms.gle/E4uBsZUsz2kDnnhy5",
  "https://forms.gle/PToT5i4c8ESWdX2d6",
  "https://forms.gle/uywdG1D32mp9iJPDA",
  "https://forms.gle/SVLpA6L453b1iG888",
  "https://forms.gle/kigQbABmpPC9eMNz8",
  "https://forms.gle/kHHX2r71bv1SwcM7A",
  "https://forms.gle/iyhMwgPLeKHdarZN7",
  "https://forms.gle/bR8KemrNLEy1PKaj8",
];

// ─── IN-APP QUIZ QUESTIONS ────────────────────────────────────────────────────
const QUIZ_QUESTIONS = {
  1: [
    { q: "What does the 'S' in S.H.I.T. stand for?", options: ["Simple", "Serious", "Stable", "Safe"], correct: 1 },
    { q: "What does the 'H' in S.H.I.T. stand for?", options: ["Helpful", "Hopeful", "Honest", "Humble"], correct: 2 },
    { q: "What does the 'I' in S.H.I.T. stand for?", options: ["Involved", "Informative", "Independent", "Intentional"], correct: 1 },
    { q: "What does the 'T' in S.H.I.T. stand for?", options: ["Timely", "Tough", "Trustworthy", "Transparent"], correct: 2 },
    { q: "Who is responsible for your guests' behavior in your unit?", options: ["Your landlord", "Building management", "You, the tenant", "Your case manager"], correct: 2 },
    { q: "Which action is most likely to prevent a lease violation notice?", options: ["Waiting to see if management notices", "Communicating with management before a problem grows", "Asking neighbors to handle it", "Ignoring small issues"], correct: 1 },
    { q: "What is the main purpose of reading your lease before signing?", options: ["To find errors to dispute later", "To understand your rights and responsibilities", "To negotiate lower rent", "To delay move-in"], correct: 1 },
    { q: "What does housing accountability mean?", options: ["Relying on your case manager for all decisions", "Taking responsibility for your choices and their consequences", "Following only the rules you agree with", "Letting management handle all issues"], correct: 1 },
    { q: "Most housing terminations are:", options: ["Caused by the landlord", "Unavoidable circumstances", "Preventable through behavior and communication", "Always the tenant's fault legally"], correct: 2 },
    { q: "Good choices in housing build your:", options: ["Relationship with other tenants", "Rental history and reputation", "Credit score automatically", "Lease renewal guarantee"], correct: 1 },
  ],
  2: [
    { q: "Which housing type typically shares walls and common areas with other residents?", options: ["Single dwelling home", "Apartment", "Vacation rental", "Storage unit"], correct: 1 },
    { q: "What is a key responsibility in shared housing?", options: ["Using all shared spaces exclusively", "Cleaning shared spaces only when asked", "Communicating and sharing common area responsibilities", "Avoiding contact with other residents"], correct: 2 },
    { q: "Parking assignments are part of:", options: ["A verbal agreement only", "Your lease contract", "Building policy only", "Management's discretion"], correct: 1 },
    { q: "What should you do if you have a grievance about a shared space issue?", options: ["Confront the other resident aggressively", "Remove their belongings without notice", "Report it calmly to management in writing", "Post about it publicly"], correct: 2 },
    { q: "Being a good neighbor means:", options: ["Playing music whenever you want", "Respecting noise policies and shared spaces at all times", "Using common areas only during your preferred hours", "Ignoring issues that don't affect your unit directly"], correct: 1 },
    { q: "In shared housing, conflicts should be addressed:", options: ["Aggressively to show you won't be pushed around", "By moving out immediately", "Calmly through management using written documentation", "By recruiting other tenants to your side"], correct: 2 },
    { q: "Which is a shared living expectation in an apartment community?", options: ["Keeping noise levels respectful at all hours", "Using other residents' assigned parking occasionally", "Leaving personal items in hallways", "Only following rules you personally agree with"], correct: 0 },
    { q: "A lease addendum covering house rules:", options: ["Is optional and can be ignored", "Has the same legal weight as the lease itself", "Only applies to common areas", "Expires after 6 months"], correct: 1 },
    { q: "If a neighbor takes an action that affects you negatively, you should first:", options: ["Retaliate immediately", "Document the incident with date and time and report to management", "Move to a different unit", "Tell all your neighbors about it"], correct: 1 },
    { q: "Single dwelling homes differ from apartments primarily because:", options: ["They have no lease requirements", "They offer more privacy and may include yard maintenance responsibilities", "They are always cheaper", "Rules do not apply to them"], correct: 1 },
  ],
  3: [
    { q: "What is contract rent?", options: ["The amount your subsidy pays", "The full monthly rent listed in your lease", "The amount you negotiate with management", "Only the portion you owe after assistance"], correct: 1 },
    { q: "Which system does the housing authority use to verify your income?", options: ["Your personal bank statements only", "Tax records from 3 years ago", "EIV — Enterprise Income Verification", "A verbal confirmation from your employer"], correct: 2 },
    { q: "When must you report income changes to your housing program?", options: ["Only at annual recertification", "Within 10–30 days depending on your program", "Whenever you feel like it", "Only if the change is more than $500/month"], correct: 1 },
    { q: "What happens when you fail to report income?", options: ["Nothing, as long as you pay rent", "You may owe back payments and face program termination", "Your subsidy automatically adjusts", "Management handles it for you"], correct: 1 },
    { q: "Cash income from gig work or self-employment:", options: ["Does not need to be reported", "Only needs to be reported if over $1,000/month", "Must be reported — all income is reportable", "Is exempt from reporting for 6 months"], correct: 2 },
    { q: "What does 'contract rent' mean if you receive a housing subsidy?", options: ["The subsidy replaces your full obligation", "You only owe whatever amount the subsidy does not cover", "The full rent still exists and you owe your portion", "The landlord negotiates a lower amount"], correct: 2 },
    { q: "The Work Number database is used by housing authorities to:", options: ["Check your credit score", "Verify your employment and income independently", "Track your lease violations", "Communicate with your case manager"], correct: 1 },
    { q: "Rapid Rehousing (RRH) programs provide:", options: ["Permanent housing vouchers", "Short-term rental assistance to help people quickly exit homelessness", "Free housing with no tenant obligations", "Long-term subsidies with no reporting requirements"], correct: 1 },
    { q: "Failing to report a household composition change is:", options: ["Acceptable as long as rent is paid", "Treated as program fraud", "Only a problem at recertification", "The case manager's responsibility to update"], correct: 1 },
    { q: "Section 8 / HCV stands for:", options: ["Section 8 / Housing Compliance Voucher", "Section 8 / Housing Choice Voucher", "Section 8 / Housing Credit Verification", "Section 8 / Household Cost Voucher"], correct: 1 },
  ],
  4: [
    { q: "What is a lease agreement?", options: ["A suggestion from management", "A legal contract outlining rights and responsibilities", "A temporary arrangement with no legal weight", "An optional document you can ignore"], correct: 1 },
    { q: "House rules attached to a lease as an addendum:", options: ["Are optional guidelines only", "Have the same legal weight as the lease itself", "Can be ignored if management doesn't enforce them", "Only apply to common areas"], correct: 1 },
    { q: "Which of these is a common lease compliance issue?", options: ["Paying rent two days early", "Unauthorized occupants not listed on the lease", "Replacing a light bulb without permission", "Using the laundry room during business hours"], correct: 1 },
    { q: "Not reading your lease is:", options: ["A valid legal defense", "Understandable and excused by courts", "No excuse — rules are enforceable whether you read them or not", "Only a problem at renewal"], correct: 2 },
    { q: "What must you do before adding a pet to your unit?", options: ["Simply inform management verbally", "Obtain written permission from your landlord", "Wait until your lease renews", "Ask a neighbor if they know the policy"], correct: 1 },
    { q: "Subletting your unit without approval is:", options: ["Fine as long as the person pays you", "A lease violation that can result in eviction", "Only an issue if the person damages the unit", "Allowed if your case manager approves it"], correct: 1 },
    { q: "Unauthorized modifications to your unit include:", options: ["Hanging a picture with a small nail", "Painting walls a different color without written approval", "Using furniture that came with the unit", "Replacing a broken doorknob"], correct: 1 },
    { q: "Your lease renewal can be denied if:", options: ["You paid rent on time but had multiple violations", "You reported a maintenance issue", "You have an approved pet", "You requested a copy of your lease"], correct: 0 },
    { q: "Which of these sections should you locate and understand in every lease?", options: ["The landlord's personal contact list", "Termination conditions and notice requirements", "Maintenance schedules for the whole building", "Other tenants' payment histories"], correct: 1 },
    { q: "Guest policies in your lease:", options: ["Apply only to overnight guests", "Are not legally enforceable", "Cover who can be in your unit and for how long", "Are set by you, not the landlord"], correct: 2 },
  ],
  5: [
    { q: "What is the primary purpose of a move-in inspection?", options: ["To impress the landlord", "To document the unit's condition and protect yourself from unfair charges at move-out", "To see if repairs are needed before you move furniture in", "To get a discount on your first month's rent"], correct: 1 },
    { q: "Normal wear and tear means:", options: ["Damage you caused and must pay for", "Stains, holes, or burns beyond ordinary use", "Expected deterioration from normal use that cannot be charged to you", "Any damage the landlord notices at move-out"], correct: 2 },
    { q: "When should you document the condition of your unit?", options: ["At move-out only", "Whenever management requests it", "At move-in, before your belongings are in the unit", "Only if you think there will be disputes"], correct: 2 },
    { q: "What is a security deposit used for?", options: ["To cover your first month's rent", "As a fee for signing the lease", "To cover unpaid rent or damage beyond normal wear and tear at move-out", "To pay for maintenance requests"], correct: 2 },
    { q: "A habitability issue means:", options: ["The unit has cosmetic problems you dislike", "A maintenance request you submitted is unanswered", "The unit is unsafe, unsanitary, or unfit for human occupation", "The landlord changed the paint color without asking"], correct: 2 },
    { q: "Why is photographic documentation at move-in important?", options: ["To share on social media", "To show friends the condition of the unit", "To protect yourself if the landlord claims damage you did not cause", "To get repairs done faster"], correct: 2 },
    { q: "If pre-existing damage is not documented at move-in:", options: ["The landlord must prove you caused it", "You could be charged for it at move-out", "It is automatically covered by your security deposit", "Management is required to fix it before you move in"], correct: 1 },
    { q: "A move-in inspection should cover:", options: ["Only the kitchen and bathroom", "Every room, wall, floor, appliance, and fixture", "Only areas where you plan to put furniture", "Just the exterior of the unit"], correct: 1 },
    { q: "Who should receive a copy of your completed move-in inspection?", options: ["Only you", "Only your case manager", "Both you and management, with signatures", "Your neighbors for reference"], correct: 2 },
    { q: "What does 'habitability' legally require?", options: ["That the unit looks nice and is freshly painted", "That the unit is safe, sanitary, and fit for human occupation", "That the landlord makes any change you request", "That the unit has all brand-new appliances"], correct: 1 },
  ],
  6: [
    { q: "How should you submit a maintenance request?", options: ["By leaving a verbal message with a neighbor to pass on", "In writing, with date, issue description, and your contact info", "By waiting for management to notice the problem", "Only after the issue has persisted for 30 days"], correct: 1 },
    { q: "If your heat stops working, this is:", options: ["A minor issue that can wait until the next business day", "A habitability emergency — contact management immediately", "Only a problem if it lasts more than 72 hours", "Your responsibility to fix at your own cost"], correct: 1 },
    { q: "Why should you keep a maintenance request log?", options: ["To track how many times management has visited", "To prove your requests were submitted if issues are ignored or disputed", "To share with neighbors who have the same issues", "To use as leverage to break your lease"], correct: 1 },
    { q: "Who is responsible for damage caused by a tenant's neglect, such as mold from an unreported leak?", options: ["The landlord, because they own the property", "The city housing authority", "The tenant, because it resulted from failure to report", "Split equally between tenant and landlord"], correct: 2 },
    { q: "Within how long should a landlord address an emergency maintenance issue?", options: ["30 days", "2 weeks", "24–48 hours for emergencies", "Only at the next scheduled inspection"], correct: 2 },
    { q: "If management does not respond to an emergency maintenance request within 24 hours, you should:", options: ["Fix it yourself and deduct the cost from rent", "Contact your local housing authority", "Move out immediately", "Tell your neighbors to complain too"], correct: 1 },
    { q: "Which of these is considered an emergency maintenance issue?", options: ["A squeaky door hinge", "No running water or no heat", "A slow-draining sink", "A light bulb that needs replacing"], correct: 1 },
    { q: "A maintenance request log should include:", options: ["Only the date you submitted the request", "Date submitted, issue description, and response received", "Only issues that were fixed", "Your landlord's personal schedule"], correct: 1 },
    { q: "Routine maintenance in your unit such as replacing batteries in smoke detectors is typically:", options: ["Always the landlord's responsibility", "The tenant's responsibility under most leases", "Optional and neither party's obligation", "The housing authority's responsibility"], correct: 1 },
    { q: "Reporting a water leak promptly protects you because:", options: ["It guarantees the landlord will fix it the same day", "It prevents the damage from worsening and shields you from liability", "It triggers a full unit inspection", "It automatically extends your lease"], correct: 1 },
  ],
  7: [
    { q: "When should you contact management about a rent hardship?", options: ["After you've already missed the payment", "On or after the due date", "Before the due date, as soon as you know you'll be short", "Only when you receive a pay-or-quit notice"], correct: 2 },
    { q: "Which is the best way to communicate with your landlord about an issue?", options: ["Text message only", "Verbal conversation in the hallway", "Written communication (email or letter) so there is a record", "Through another tenant"], correct: 2 },
    { q: "If you receive a lease violation notice, you should:", options: ["Ignore it and hope the issue resolves itself", "Respond within the stated deadline even if you disagree", "Move out immediately", "Ask a neighbor to speak to management for you"], correct: 1 },
    { q: "What is the best approach to a conflict with a neighbor?", options: ["Confront them directly and aggressively", "Document incidents and report to management in writing", "Retaliate to send a message", "Post about it on social media"], correct: 1 },
    { q: "A written response to management protects you because:", options: ["It shows you are a difficult tenant to evict", "It creates a documented record of your communication", "It delays any action management can take", "It transfers liability to management"], correct: 1 },
    { q: "Retaliating against a neighbor who filed a complaint against you:", options: ["Sends a message that you won't be pushed around", "Is legally protected tenant behavior", "Can itself become a lease violation on your record", "Resolves the conflict faster"], correct: 2 },
    { q: "A 'pay-or-quit' notice requires you to:", options: ["Move out within 24 hours", "Pay the overdue rent within the stated period or face eviction proceedings", "Contact your case manager and nothing else", "File a complaint with the housing authority"], correct: 1 },
    { q: "When communicating about a hardship, you should:", options: ["Wait and hope the situation resolves itself", "Be honest and proactive before problems escalate", "Only communicate if management contacts you first", "Ask another tenant to communicate on your behalf"], correct: 1 },
    { q: "If you disagree with a violation notice, the correct response is:", options: ["Ignore it because you know you're right", "Respond in writing within the deadline, stating your position professionally", "Refuse to pay rent until it is removed", "Ask your neighbors to sign a petition"], correct: 1 },
    { q: "Emergency rental assistance in Iowa can be accessed through:", options: ["Your landlord directly", "211 Iowa", "The DMV", "Your building's maintenance team"], correct: 1 },
  ],
  8: [
    { q: "What should you do FIRST when you receive an eviction notice?", options: ["Move out immediately", "Ignore it and continue paying rent", "Read it carefully to identify the notice type and deadline", "Call the police"], correct: 2 },
    { q: "A 'pay or quit' notice means:", options: ["You must move out immediately", "Pay the overdue rent within the stated period or vacate", "You are being evicted with no recourse", "Management is offering you a payment plan"], correct: 1 },
    { q: "What resource provides free legal help to renters facing eviction in Iowa?", options: ["The landlord's attorney", "Iowa Legal Aid — 1-800-532-1275", "The Department of Motor Vehicles", "The Better Business Bureau"], correct: 1 },
    { q: "If you receive an eviction court summons, you should:", options: ["Ignore it — missing court is fine if you've paid", "Show up to every court date — missing it guarantees a judgment against you", "Have a neighbor represent you", "Only appear if you think you'll win"], correct: 1 },
    { q: "Emergency rental assistance can be accessed through:", options: ["Your landlord's office", "The federal courts", "211 Iowa or your local Continuum of Care", "Only through a private attorney"], correct: 2 },
    { q: "An 'unconditional quit' notice means:", options: ["You have time to fix the problem before eviction", "You must vacate with no option to cure — typically for serious violations", "Management is willing to negotiate", "You can request a 30-day extension"], correct: 1 },
    { q: "A 'cure or quit' notice means:", options: ["Move out immediately with no options", "You must fix the stated lease violation within the given period or vacate", "Pay back rent or leave", "The landlord is canceling your lease with no reason given"], correct: 1 },
    { q: "A writ of possession is:", options: ["A document proving you own your belongings", "A court order authorizing the landlord to take back the property after eviction judgment", "A permission slip to have guests stay overnight", "A notice that your rent will increase"], correct: 1 },
    { q: "If you cannot pay rent and want to avoid eviction, you should:", options: ["Wait and hope management doesn't notice", "Contact management BEFORE the due date and apply for emergency rental assistance immediately", "Ignore notices until you have the money", "Ask a neighbor to cover it without telling management"], correct: 1 },
    { q: "Which type of eviction notice gives you NO opportunity to fix the problem?", options: ["Pay or Quit", "Cure or Quit", "Unconditional Quit", "30-Day Notice"], correct: 2 },
  ],
};
// ─── STATE RESOURCES DATABASE ─────────────────────────────────────────────────
// Iowa is fully populated. Add contacts for each state as you expand nationally.
const STATE_RESOURCES = {
  IA: {
    name: "Iowa",
    legalAid: { name: "Iowa Legal Aid", phone: "1-800-532-1275", web: "iowalegalaid.org" },
    helpline: { name: "211 Iowa", phone: "Dial 2-1-1", web: "211iowa.org" },
    housingAuthority: { name: "Des Moines Housing Authority", phone: "515-323-8950", web: "dmhousing.com" },
    emergencyRent: { name: "Iowa Finance Authority", phone: "1-855-300-5885", web: "iowafinanceauthority.gov" },
    localOrgs: [
      { name: "Polk County Housing Trust Fund", phone: "515-243-1277", web: "pchtf.org" },
      { name: "Catholic Charities Iowa", phone: "515-244-3761", web: "catholiccharitiesiowa.org" },
      { name: "Salvation Army Des Moines", phone: "515-243-4277", web: "centralusa.salvationarmy.org" },
    ],
    evictionLaw: "Iowa Code Chapter 562A governs landlord-tenant relationships. Tenants have 3 days to respond to a pay or quit notice.",
  },
  TX: {
    name: "Texas",
    legalAid: { name: "Texas RioGrande Legal Aid", phone: "1-888-988-9996", web: "trla.org" },
    helpline: { name: "211 Texas", phone: "Dial 2-1-1", web: "211texas.org" },
    housingAuthority: { name: "Texas Department of Housing", phone: "512-475-3800", web: "tdhca.state.tx.us" },
    emergencyRent: { name: "Texas Rent Relief", phone: "1-833-989-7368", web: "texasrentrelief.com" },
    localOrgs: [],
    evictionLaw: "Texas Property Code Chapter 92 governs landlord-tenant relationships. Tenants have 3 days to respond to eviction notices.",
  },
  FL: {
    name: "Florida",
    legalAid: { name: "Florida Legal Services", phone: "1-800-405-1417", web: "floridalegal.org" },
    helpline: { name: "211 Florida", phone: "Dial 2-1-1", web: "211florida.org" },
    housingAuthority: { name: "Florida Housing Finance Corporation", phone: "850-488-4197", web: "floridahousing.org" },
    emergencyRent: { name: "Florida Emergency Rental Assistance", phone: "Dial 2-1-1", web: "myfloridalicense.com" },
    localOrgs: [],
    evictionLaw: "Florida Statute Chapter 83 governs landlord-tenant relationships. Tenants have 3 days to respond to a pay or quit notice.",
  },
  GA: {
    name: "Georgia",
    legalAid: { name: "Georgia Legal Aid", phone: "1-844-777-4041", web: "georgialegalaid.org" },
    helpline: { name: "211 Georgia", phone: "Dial 2-1-1", web: "211ga.org" },
    housingAuthority: { name: "Georgia Department of Community Affairs", phone: "404-679-4840", web: "dca.ga.gov" },
    emergencyRent: { name: "Georgia Rental Assistance Program", phone: "1-833-827-2263", web: "housing.georgia.gov" },
    localOrgs: [],
    evictionLaw: "Georgia Code Title 44 governs landlord-tenant relationships. Tenants have limited time to respond to eviction notices.",
  },
  IL: {
    name: "Illinois",
    legalAid: { name: "Illinois Legal Aid Online", phone: "1-800-252-8966", web: "illinoislegalaid.org" },
    helpline: { name: "211 Illinois", phone: "Dial 2-1-1", web: "211illinois.org" },
    housingAuthority: { name: "Illinois Housing Development Authority", phone: "312-836-5200", web: "ihda.org" },
    emergencyRent: { name: "Illinois Rental Payment Program", phone: "1-866-454-3571", web: "illinoishousinghelp.org" },
    localOrgs: [],
    evictionLaw: "Illinois Landlord and Tenant Act governs most rental relationships. Tenants have 5 days to respond to a pay or quit notice.",
  },
  // Placeholder for all 50 states, add as you expand
  OTHER: {
    name: "Your State",
    legalAid: { name: "Find Local Legal Aid", phone: "Dial 2-1-1", web: "lawhelp.org" },
    helpline: { name: "National 211 Helpline", phone: "Dial 2-1-1", web: "211.org" },
    housingAuthority: { name: "HUD Local Office", phone: "1-800-955-2232", web: "hud.gov" },
    emergencyRent: { name: "HUD Emergency Rental Assistance", phone: "1-800-955-2232", web: "consumerfinance.gov/renthelp" },
    localOrgs: [],
    evictionLaw: "Contact your local legal aid office to understand the eviction laws in your specific state and county.",
  },
};

const US_STATES = [
  {code:"IA",name:"Iowa"},{code:"AL",name:"Alabama"},{code:"AK",name:"Alaska"},
  {code:"AZ",name:"Arizona"},{code:"AR",name:"Arkansas"},{code:"CA",name:"California"},
  {code:"CO",name:"Colorado"},{code:"CT",name:"Connecticut"},{code:"DE",name:"Delaware"},
  {code:"FL",name:"Florida"},{code:"GA",name:"Georgia"},{code:"HI",name:"Hawaii"},
  {code:"ID",name:"Idaho"},{code:"IL",name:"Illinois"},{code:"IN",name:"Indiana"},
  {code:"KS",name:"Kansas"},{code:"KY",name:"Kentucky"},{code:"LA",name:"Louisiana"},
  {code:"ME",name:"Maine"},{code:"MD",name:"Maryland"},{code:"MA",name:"Massachusetts"},
  {code:"MI",name:"Michigan"},{code:"MN",name:"Minnesota"},{code:"MS",name:"Mississippi"},
  {code:"MO",name:"Missouri"},{code:"MT",name:"Montana"},{code:"NE",name:"Nebraska"},
  {code:"NV",name:"Nevada"},{code:"NH",name:"New Hampshire"},{code:"NJ",name:"New Jersey"},
  {code:"NM",name:"New Mexico"},{code:"NY",name:"New York"},{code:"NC",name:"North Carolina"},
  {code:"ND",name:"North Dakota"},{code:"OH",name:"Ohio"},{code:"OK",name:"Oklahoma"},
  {code:"OR",name:"Oregon"},{code:"PA",name:"Pennsylvania"},{code:"RI",name:"Rhode Island"},
  {code:"SC",name:"South Carolina"},{code:"SD",name:"South Dakota"},{code:"TN",name:"Tennessee"},
  {code:"TX",name:"Texas"},{code:"UT",name:"Utah"},{code:"VT",name:"Vermont"},
  {code:"VA",name:"Virginia"},{code:"WA",name:"Washington"},{code:"WV",name:"West Virginia"},
  {code:"WI",name:"Wisconsin"},{code:"WY",name:"Wyoming"},
];

// ─── MODULE DATA (from your actual PowerPoints & Workbooks) ──────────────────
const MODULES = [
  {
    id: 1, emoji: "🧠", color: "#CC5500", accent: "#FFF0E6",
    videoUrl: "https://www.youtube.com/embed/UsLoNVMywXM",
    title: "Successful Renter Mindset & Accountability",
    subtitle: "Building Stability Through Education & Accountability",
    slides: [
      { heading: "Why Mindset Matters In Housing", points: ["Housing stability starts with personal accountability", "Most housing terminations are preventable", "Behavior and choices directly impact housing outcomes"] },
      { heading: "What You Will Learn", points: ["What it means to be a successful renter", "Why honesty matters on applications", "How daily choices affect housing stability", "How landlords and programs evaluate behavior"] },
      { heading: "How To Be A Successful Renter", points: ["Complete applications honestly", "Read the lease and ask questions", "Pay rent on time every month", "Take care of your unit", "Communicate early, before problems grow"] },
      { heading: "Accountability In Housing", points: ["You are responsible for your own actions", "You are responsible for your guests' behavior", "You are responsible for your unit's condition", "Accountability is not optional. It is required."] },
      { heading: "Are You With The S.H.I.T.?", points: ["S: Serious. Take housing responsibilities seriously", "H: Honest. Be truthful and upfront at all times", "I: Informative. Communicate clearly with management", "T: Trustworthy. Be reliable and consistent"] },
      { heading: "Choices Have Outcomes", points: ["Every decision you make in housing has a consequence", "Good choices build your rental history", "Poor choices create violations, notices, and evictions", "You decide which outcome you get"] },
    ],
    workbook: {
      purpose: "This module explains what it means to be a successful renter. Housing stability starts with mindset and accountability. Most housing problems are preventable.",
      keyPoints: [
        "Completes applications honestly",
        "Reads the lease and asks questions",
        "Pays rent on time",
        "Takes care of the unit",
        "Communicates early",
      ],
      reflection: [
        "What does being a successful renter mean to you, and what does your housing journey look like when things are going well?",
        "Which of the four S.H.I.T. traits feels most natural to you, and how can that strength support the others?",
        "What is one routine you can build into your week to feel more confident and in control of your housing?",
      ],
    },
    scenarios: [
      { title: "The Party That Cost Marcus", story: "Marcus moved into his apartment and threw a housewarming party with 20 guests. Music was loud until 2am. His neighbor knocked. he turned it down for 10 minutes then back up. By Monday, management had 4 written complaints. Marcus received his first lease violation notice.", question: "What should Marcus have done?", options: ["Nothing, it was just one night", "Notified management in advance, kept noise down after 10pm, and responded respectfully when his neighbor knocked", "Ignored the neighbor because they were being too sensitive", "Moved the party outside"], correct: 1, explanation: "One violation notice on your record can affect your lease renewal. Proactive communication and respecting quiet hours would have prevented this entirely." },
      { title: "The Notice Keisha Ignored", story: "Keisha found a violation notice on her door. She was frustrated and didn't read it fully. Three days later she received a second notice. the first one had a 48-hour response deadline she completely missed.", question: "What is the correct response when you receive any notice?", options: ["Ignore it if you think it's wrong", "Read it immediately, note the deadline, and contact management within the required timeframe", "Wait for a second notice to confirm it's serious", "Complain to other residents first"], correct: 1, explanation: "Every notice has a deadline. Responding within the stated window, even if you disagree. protects your tenancy. You can dispute it professionally, but you must respond on time." },
    ],
  },
  {
    id: 2, emoji: "🏘️", color: "#00A3A3", accent: "#E0F7F7",
    videoUrl: "https://www.youtube.com/embed/OxS6y8-QzQ4",
    title: "Housing Types, Shared Living & Community Expectations",
    subtitle: "Where you live affects rules, behavior, and stability",
    slides: [
      { heading: "Why This Module Matters", points: ["Where you live determines expectations", "Shared living requires cooperation", "Understanding your housing type helps protect your tenancy"] },
      { heading: "Apartment Living", points: ["Multiple units in one building", "Shared walls and common areas", "Noise, cleanliness, and guests affect everyone", "Community rules apply to every resident"] },
      { heading: "Single Dwelling Homes", points: ["Stand-alone housing with more privacy", "Same lease responsibility applies", "Property care is still required", "Yard and exterior maintenance may be your responsibility"] },
      { heading: "Shared Housing", points: ["Private bedroom with shared common spaces", "Shared responsibility for cleanliness", "Communication with housemates is critical", "Conflict resolution skills are essential"] },
      { heading: "Community Living Expectations", points: ["Respect neighbors and shared spaces", "Follow guest and noise policies", "Address issues early, before they escalate", "Be the neighbor you want to have"] },
      { heading: "Real-Life Housing Choices", points: ["Being mindful of noise levels at all hours", "Cleaning shared spaces after use", "Following guest rules in your lease", "Reporting issues rather than letting them build"] },
    ],
    workbook: {
      purpose: "This module helps you understand different housing types and expectations. Where you live affects rules, behavior, and housing stability.",
      keyPoints: ["Differences between apartment, single dwelling, and shared housing", "How community living changes responsibilities", "Why shared spaces and neighbors matter", "How behavior affects housing stability"],
      reflection: [
        "What does being a good neighbor look like in your day-to-day life, and what is one behavior you are committed to practicing?",
        "What do you find most challenging about shared living, and what mindset shift would help you handle it with more confidence?",
        "How do the choices you make in your unit and shared spaces affect the people around you, and what does that mean for your community?",
      ],
    },
    scenarios: [
      { title: "The Laundry Room Standoff", story: "Tanya left laundry in the washer for 4 hours. Her neighbor removed it to use the machine. Tanya confronted her aggressively in the hallway. Management received a disturbance complaint and issued Tanya a written warning for threatening behavior.", question: "How should this have been handled?", options: ["Tanya was right and no one should touch her laundry", "Tanya should remove laundry promptly and address concerns calmly through management", "The neighbor should have waited indefinitely", "Management should have posted a rule first"], correct: 1, explanation: "Shared spaces require shared courtesy. Even if you have a grievance, aggressive confrontation in a common area is itself a lease violation." },
      { title: "DeShawn's Parking Problem", story: "DeShawn was assigned Spot 14 but parked in Spot 12 for 3 weeks because it was closer. Spot 12 belonged to an elderly resident. After her complaint, DeShawn received a notice. his third violation, and was at risk of lease termination.", question: "What should DeShawn have done?", options: ["Keep using the closer spot since it is usually empty", "Submitted a written request to management to change his assigned spot through proper process", "Made a verbal agreement with the other resident", "Parked wherever he wanted and dealt with complaints if they came"], correct: 1, explanation: "Parking assignments are part of your lease. Taking someone else's spot. even occasionally. is a violation. Request changes formally and in writing." },
    ],
  },
  {
    id: 3, emoji: "💰", color: "#CC5500", accent: "#FFF0E6",
    videoUrl: "https://www.youtube.com/embed/CF9mQTM7Qns",
    title: "Rent, Subsidies & Income Rules",
    subtitle: "Many people lose housing due to misunderstandings",
    slides: [
      { heading: "Why This Module Matters", points: ["Many people lose housing due to rent and income misunderstandings", "Subsidies support stability but do not remove your responsibility", "Income reporting is required. It is not optional."] },
      { heading: "Contract Rent vs Rent Subsidy", points: ["Contract rent = the full rent listed in your lease", "A subsidy helps cover a portion of that rent", "You are always responsible for your portion", "The subsidy does not change your contractual obligation"] },
      { heading: "Common Rent Subsidy Programs", points: ["Section 8 / Housing Choice Voucher (HCV)", "Project-Based Voucher (PBV)", "Rapid Rehousing (RRH)", "Each program has specific rules and reporting requirements"] },
      { heading: "Income Reporting Rules", points: ["ALL income must be reported. There are no exceptions.", "Changes must be reported promptly (10–30 days)", "Household changes must also be reported", "Failure to report is treated as fraud"] },
      { heading: "How Income Is Verified", points: ["Enterprise Income Verification (EIV) system", "The Work Number database", "Pay stubs, benefit letters, and tax records", "You cannot hide income. It will be found through verification systems."] },
      { heading: "Why Reporting Matters", points: ["Unreported income = back payment demands", "Can result in termination of housing assistance", "Affects your future ability to receive subsidies", "Early reporting protects you. Hiding income only creates larger problems."] },
    ],
    workbook: {
      purpose: "This module explains how rent, subsidies, and income rules work together. Many people lose housing due to misunderstandings or failure to report income.",
      keyPoints: ["Difference between contract rent and subsidies", "Common rental assistance programs", "Your responsibility to pay rent on time", "Why income reporting is required and enforced"],
      reflection: [
        "What does financial stability in your housing look like for you, and what is one step you can take this month to feel more in control?",
        "What would it feel like to always know your reporting requirements in advance, and what can you do this week to stay on top of them?",
        "How can open and proactive communication strengthen your relationship with your landlord or housing program?",
      ],
    },
    scenarios: [
      { title: "Deja's $4,200 Mistake", story: "Deja receives Section 8 and starts doing hair from her apartment, earning $800/month. She doesn't report it because 'it's not a real job.' At recertification, the income is discovered. She owes $4,200 in back rent and faces termination of her voucher.", question: "What was Deja's critical mistake?", options: ["Doing hair in her apartment. it's not allowed", "Failing to report all income changes promptly to her housing authority", "Filing taxes incorrectly", "Working too many hours while on assistance"], correct: 1, explanation: "ALL income, including cash, gig work, and self-employment. must be reported. Failure to report is program fraud regardless of intent." },
      { title: "Roderick's Partial Payment", story: "Roderick is short on rent and pays $100 of his $750 without contacting management. By the 5th, a pay-or-quit notice is on his door. He pays the rest on the 12th with a $75 late fee. This is the second time this year. At renewal, management declines based on payment history.", question: "What should Roderick have done when he knew he'd be short?", options: ["Paid what he had and hoped management didn't notice", "Contacted management BEFORE the due date to communicate the situation and ask about a payment plan", "Waited until he had the full amount, even if 2 weeks late", "Asked a neighbor to cover it secretly"], correct: 1, explanation: "Communication before the due date is everything. Many landlords will work with tenants who reach out proactively. Partial payments with no communication create a paper trail that affects renewals." },
    ],
  },
  {
    id: 4, emoji: "📋", color: "#00A3A3", accent: "#E0F7F7",
    videoUrl: "https://www.youtube.com/embed/nuCphJqiMn4",
    title: "Lease Agreements, House Rules & Compliance",
    subtitle: "Understanding these rules prevents violations and eviction",
    slides: [
      { heading: "Why This Module Matters", points: ["Understanding your lease prevents violations", "Most compliance failures come from not reading the lease", "Rules are enforceable whether you read them or not"] },
      { heading: "What Is A Lease Agreement", points: ["A legal contract between renter and landlord", "Outlines rights and responsibilities for both parties", "Signing means agreeing to ALL terms", "Not reading the lease is not a legal defense"] },
      { heading: "Lease Agreement Key Sections", points: ["Rent amount and payment terms", "Guest and occupant policies", "Pet policies and restrictions", "Maintenance responsibilities", "Termination conditions and notice requirements"] },
      { heading: "What Are House Rules", points: ["Rules for living in the community", "Often attached to the lease as an addendum", "Carry the same legal weight as the lease itself", "Required for continued tenancy"] },
      { heading: "Why House Rules Exist", points: ["Protect the safety and comfort of all residents", "Set clear expectations from day one", "Provide grounds for action when violated", "Help the community function fairly"] },
      { heading: "Common Compliance Issues", points: ["Unauthorized occupants not on the lease", "Pets without written permission", "Subletting without approval", "Noise violations and disturbances", "Unauthorized modifications to the unit"] },
    ],
    workbook: {
      purpose: "This module explains lease agreements and house rules. Understanding these rules helps prevent violations and eviction.",
      keyPoints: ["What a lease agreement is and what you're signing", "Why house rules are legally enforceable", "How compliance protects housing stability", "Common violations and how to avoid them"],
      reflection: [
        "Which section of your lease do you want to understand better, and what will you do to make sure you know your rights and responsibilities?",
        "How will you handle situations where someone wants to stay with you long-term in a way that protects your housing and follows your lease?",
        "When a lease rule feels unfair, how can you address that concern through the right channels while still honoring your agreement?",
      ],
    },
    scenarios: [
      { title: "Cousin Stays for 'Just a Week'", story: "Roderick's cousin comes to stay for one week after losing his apartment. The week becomes two months. He's not on the lease. Management notices additional cars and foot traffic. Roderick receives an unauthorized occupant notice. his second violation, and is now at risk of non-renewal.", question: "How could Roderick have handled this within lease rules?", options: ["It's fine. the cousin is family and only temporary", "He should have requested written approval from management for an extended guest stay or explored adding the cousin to the lease", "As long as the cousin is quiet, management has no right to interfere", "He should have had the cousin park far away"], correct: 1, explanation: "Most leases define a guest as 7–14 consecutive days maximum. Longer stays require written approval. Unauthorized occupants are among the top reasons tenancies are terminated." },
      { title: "Latasha's Airbnb Experiment", story: "Latasha lists her apartment on Airbnb while visiting family for a month, earning $1,200. Management receives complaints and finds the listing. Her lease has a strict no-subletting clause. She faces immediate lease termination and must vacate in 30 days.", question: "What should Latasha have done first?", options: ["It's her apartment. she can do what she wants while away", "Read her lease for subletting clauses and gotten written permission before listing", "Removed the listing as soon as management contacted her", "Used a different platform management wouldn't find"], correct: 1, explanation: "Almost all leases prohibit subletting without written consent. Short-term rentals like Airbnb are explicitly banned in most leases. The income is never worth losing your housing." },
    ],
  },
  {
    id: 5, emoji: "🏠", color: "#CC5500", accent: "#FFF0E6",
    videoUrl: "https://www.youtube.com/embed/enm5VEmuiqA",
    title: "Unit Care, Housekeeping & Property Damage",
    subtitle: "Proper unit care protects housing, deposits, and rental history",
    slides: [
      { heading: "Why This Module Matters", points: ["Unit care directly affects your deposit and rental record", "Damage you cause is your financial responsibility", "Housekeeping affects inspections and lease renewals"] },
      { heading: "Your Responsibility As A Renter", points: ["Keep the unit clean and sanitary at all times", "Prevent damage beyond normal use", "Report maintenance problems before they get worse", "You are responsible for guest-caused damage too"] },
      { heading: "What Is Normal Wear And Tear", points: ["Minor scuffs on walls from normal living", "Light carpet wear from regular foot traffic", "Fading paint from sunlight over time", "These are NOT chargeable at move-out"] },
      { heading: "What Is Considered Damage", points: ["Holes in walls from shelves or anchors", "Broken fixtures, appliances, or doors", "Unauthorized alterations or painting", "Damage caused by pets or guests", "Burns, stains, or odors beyond normal use"] },
      { heading: "Housekeeping Standards", points: ["Regular trash removal and disposal", "Clean food preparation and cooking areas", "Preventing pest conditions through cleanliness", "Avoiding clutter that creates safety hazards"] },
      { heading: "Financial Consequences", points: ["Loss of partial or full security deposit", "Charges for repairs billed to you", "Negative rental history that follows you", "Potential difficulty securing future housing"] },
    ],
    workbook: {
      purpose: "This module explains your responsibility to care for your housing unit. Proper unit care protects housing, deposits, and rental history.",
      keyPoints: ["What unit care and housekeeping mean in practice", "The difference between normal wear and damage", "Why renters are responsible for guest-caused damage", "How proper care protects housing stability and your record"],
      reflection: [
        "What does a home you feel proud of look like, and what is one routine you can build into your week to maintain it?",
        "What kind of renter do you want to be known as, and how does caring for your unit connect to your bigger housing goals?",
        "If you were moving into a new place tomorrow, what would you document from day one to protect yourself and start strong?",
      ],
    },
    scenarios: [
      { title: "Latrice's $2,800 Bill", story: "Latrice moves out expecting her full $1,200 deposit back. Instead she receives a $2,800 bill: holes from art ($100), pet stains from an unreported pet ($900), broken blinds ($200), grease-caked stove ($150), cracked mirror ($150). She has no move-in inspection report to dispute pre-existing damage.", question: "What could Latrice have done to protect herself?", options: ["Nothing. landlords always keep deposits", "Completed a move-in inspection with photos, maintained the unit, reported her pet, and avoided unauthorized alterations", "Moved out without notice so management couldn't charge her", "Taken photos only at move-out"], correct: 1, explanation: "A thorough move-in inspection with timestamped photos is your legal protection. Document every scratch before you unpack. This is the only way to dispute pre-existing damage charges." },
      { title: "James and the Mold", story: "James notices water staining under his sink in October. He assumes it's minor. By January, mold has spread up the wall and into the closet. He receives a lease violation for failure to report a maintenance issue and is assessed $1,800 in partial remediation costs.", question: "What should James have done in October?", options: ["Fixed the leak himself to avoid bothering management", "Reported the issue in writing to management immediately and followed up until addressed", "Waited until mold was visible before reporting", "Moved furniture to cover the staining"], correct: 1, explanation: "Tenants must report maintenance issues promptly. A small leak ignored becomes a mold problem worth thousands. Failure to report is a lease violation, and you can be held liable for the damage that resulted." },
    ],
  },
  {
    id: 6, emoji: "🔧", color: "#00A3A3", accent: "#E0F7F7",
    videoUrl: "https://www.youtube.com/embed/oE5bQ8btOrc",
    title: "Maintenance, Inspections & Recertification",
    subtitle: "Understanding these processes prevents violations and loss of housing",
    slides: [
      { heading: "Why This Module Matters", points: ["Missed maintenance reports become your liability", "Denying inspections is a lease violation", "Missing recertification ends your assistance immediately"] },
      { heading: "Maintenance Requests", points: ["Report issues as soon as they occur", "Use the approved work order process. Always in writing", "Do not attempt unauthorized repairs", "Keep a copy of every request you submit"] },
      { heading: "Emergency vs Non-Emergency Maintenance", points: ["Emergency: no heat, no water, gas leak, flooding, broken entry lock", "Non-emergency: cosmetic issues, squeaky doors, minor fixtures", "Know your property's after-hours emergency contact", "Never wait on emergencies. call immediately"] },
      { heading: "Housing Inspections", points: ["Inspections may be scheduled or routine", "Units must be accessible, clean, and safe", "Inspections protect the health and safety of all residents", "Denying access after proper notice has been given is a lease violation"] },
      { heading: "Preparing For An Inspection", points: ["Keep the unit clean and accessible at all times", "Secure pets properly before inspectors arrive", "Address housekeeping issues well in advance", "Replacing smoke detector batteries is your responsibility"] },
      { heading: "Annual Recertification", points: ["Required annual review of income and household information", "Required for all subsidized housing programs", "Failure to complete results in termination of assistance", "Gather documents 30 to 60 days in advance"] },
    ],
    workbook: {
      purpose: "This module explains how maintenance, inspections, and recertification work. Understanding these processes helps prevent violations and loss of housing.",
      keyPoints: ["How maintenance requests work and why to document them", "Why inspections are required and what your rights are", "What recertification means and what documents are needed", "How cooperation with all three processes protects housing stability"],
      reflection: [
        "What is one thing you can do right now to make sure maintenance issues in your home get reported quickly and handled properly?",
        "How can you organize your important housing documents so you never miss a critical deadline or recertification date?",
        "How can you reframe an inspection as a positive opportunity to show your landlord you are taking care of your home?",
      ],
    },
    scenarios: [
      { title: "Trina Denied the Inspector", story: "Management scheduled a routine inspection with 48-hour notice. Trina denied access because 'the place is messy.' This was documented as a lease violation. She denied a second inspection two weeks later citing privacy. She received a notice of potential lease termination.", question: "What are Trina's rights and responsibilities?", options: ["She can deny any inspection she's not comfortable with", "She must allow access with proper notice, but can request a reschedule once through the proper process", "She can require 2-week notice instead of 48 hours", "Inspections only apply to subsidized housing"], correct: 1, explanation: "Landlords have the legal right to inspect with proper advance notice, typically 24–48 hours. You can request one reschedule if there's a genuine conflict, but repeated denial is a lease violation." },
      { title: "Marcus Lost His Voucher Over Paperwork", story: "Marcus receives his recertification packet in September and sets it aside to complete 'soon.' By October 15th, the deadline has passed. He receives a termination-of-assistance notice. He loses his voucher rather than for any violation, but because he missed a paperwork deadline.", question: "How should Marcus have handled the recertification packet?", options: ["It is okay to be a little late because they always give extensions", "He should have gathered required documents and submitted well before the deadline, ideally within 1–2 weeks of receipt", "Called to ask for an extension without submitting anything", "Recertification only matters every other year"], correct: 1, explanation: "Annual recertification is mandatory. Missing the deadline can result in immediate termination of your voucher with no grace period. When the packet arrives, treat it as your most urgent housing task." },
    ],
  },
  {
    id: 7, emoji: "💬", color: "#CC5500", accent: "#FFF0E6",
    videoUrl: "https://www.youtube.com/embed/n56o2EObVF8",
    title: "Communication, Conflict Resolution & Notices",
    subtitle: "Poor communication often leads to notices, violations, and eviction",
    slides: [
      { heading: "Why This Module Matters", points: ["Poor communication often leads to notices and eviction", "Most conflicts can be resolved early if handled properly", "Ignoring notices is one of the fastest paths to eviction"] },
      { heading: "Why Communication Matters", points: ["Housing is a business relationship. treat it that way", "Miscommunication leads to assumptions and problems", "Clear communication builds trust with management", "Written communication creates a documented record that protects you"] },
      { heading: "Appropriate Communication", points: ["Communicate respectfully at all times", "Use approved channels. email, phone, office visits", "Avoid emotional or aggressive language in writing or in person", "Follow up verbal conversations with written summaries"] },
      { heading: "Handling Conflict", points: ["Address issues early, before they escalate", "Stay solution-focused, not blame-focused", "Know when to involve management instead of handling it yourself", "Document incidents with dates, times, and descriptions"] },
      { heading: "What Are Housing Notices", points: ["Written communication from management about a problem or requirement", "Notices explain problems, deadlines, and required actions", "Ignoring notices increases your risk. Every notice carries a deadline.", "You are legally responsible for all notices whether or not you read them"] },
      { heading: "Common Types Of Notices", points: ["Late rent notices. with specific cure deadlines", "Lease violation notices. requiring correction within stated time", "Inspection or entry notices. requiring access within 24–48 hours", "Termination notices. the most serious, requiring legal response"] },
    ],
    workbook: {
      purpose: "This module explains how communication and conflict resolution affect housing stability. Poor communication often leads to notices, violations, and eviction.",
      keyPoints: ["Why communication matters in housing as a business relationship", "How to handle conflict appropriately and safely", "What housing notices mean and why deadlines are critical", "How early communication protects housing"],
      reflection: [
        "What communication style do you want to bring to your relationship with your landlord and neighbors, and how can that style protect your housing?",
        "Why is it important to respond to housing notices quickly, and what system can you put in place to make sure you never delay?",
        "What is one specific communication habit you are committing to as a renter that will help you maintain a positive and stable tenancy?",
      ],
    },
    scenarios: [
      { title: "Priscilla's Notice She Never Read", story: "Priscilla receives a 3-day notice to cure a lease violation. Frustrated, she doesn't read it fully and tells herself she'll 'deal with it later.' On day 4, management files for eviction. She now has an eviction filing on her record even though the underlying issue was minor.", question: "What should Priscilla have done the day she received the notice?", options: ["Ignored it. waited for a second notice to confirm it was serious", "Read it fully, identified the violation and deadline, and contacted management that same day", "Taken it down so neighbors wouldn't see it", "Waited until the weekend when she had more time"], correct: 1, explanation: "Every notice requires a same-day or next-day response at minimum. Even a 3-day notice means the clock is already running. Read it fully, note the deadline, and call the office immediately." },
      { title: "Devon's 11pm Confrontation", story: "Devon has an ongoing noise issue with his upstairs neighbor. Instead of reporting it, he goes to the neighbor's door at 11pm and bangs on it yelling. Three residents witness it and file complaints. Devon receives a written warning for threatening behavior rather than the noisy neighbor. One more incident means lease termination.", question: "What should Devon have done when the noise issue started?", options: ["Confronted the neighbor directly and loudly. fastest solution", "Documented the noise with dates and times and reported it to management in writing", "Called the police each time it happened", "Moved to a different unit to avoid conflict"], correct: 1, explanation: "Confrontational behavior. even as the victim. can itself become a lease violation. Document issues and report them to management in writing. Management handles the neighbor through proper process." },
    ],
  },
  {
    id: 8, emoji: "⚖️", color: "#007A7A", accent: "#E0F7F7",
    videoUrl: "https://www.youtube.com/embed/03wY64A1SI0",
    title: "Evictions, Legal Consequences & Housing Stability",
    subtitle: "Understanding eviction helps you take action early",
    slides: [
      { heading: "Why This Module Matters", points: ["Understanding eviction helps you take action early", "An eviction record follows you for 7+ years", "Most evictions are preventable with early action"] },
      { heading: "What Is An Eviction", points: ["A legal court process used to end a tenancy", "Creates a public housing record visible to future landlords", "Even dismissed cases can appear on background checks", "Prevention is always the better path"] },
      { heading: "Common Eviction Notices", points: ["Nonpayment of rent notice. pay or leave by deadline", "Lease violation notice. cure the violation or vacate", "Termination notice. no opportunity to cure", "Clear and present danger notice. immediate action required"] },
      { heading: "What Happens In Court", points: ["A judge reviews the case and hears both parties", "You have the right to appear and speak", "Bring all documentation. notices, payments, communications", "A legal aid attorney can represent you for free or low cost"] },
      { heading: "Possible Court Outcomes", points: ["Case dismissal. tenancy continues", "Payment or compliance agreement. you stay with conditions", "Judgment for possession. you must vacate by a date", "Money judgment. you owe landlord money beyond rent"] },
      { heading: "Protecting Housing Stability", points: ["Communicate with management before missing payments", "Apply for emergency rental assistance early", "Contact legal aid before the court date rather than after", "Know your local resources: 211, legal aid, mediation services"] },
    ],
    workbook: {
      purpose: "This module explains what eviction is and how it affects housing stability. Understanding the eviction process helps you take action early.",
      keyPoints: ["What eviction means legally and practically", "Common eviction notices and what each requires", "What happens in court and your rights", "How eviction affects your housing record", "Steps to protect housing stability"],
      reflection: [
        "What does stable, long-term housing mean for you and the people who depend on you, and what are you willing to do to protect it?",
        "What local resources — rental assistance, legal aid, or mediation — do you want to learn more about so you are prepared before you ever need them?",
        "Who do you want to be as a renter when housing becomes challenging, and what steps can you take today to prepare for that moment?",
      ],
    },
    scenarios: [
      { title: "Devon's Near Miss", story: "Devon falls two months behind on rent after losing his job. He avoids calls and ignores three notices over 6 weeks. Management files for eviction. A legal aid attorney negotiates a repayment plan two days before court. Devon keeps his housing, but now has a court filing on his record, affecting his rental options for years.", question: "What should Devon have done when he first lost his job?", options: ["Started looking for a new apartment immediately", "Contacted management right away, communicated his hardship, and applied for emergency rental assistance before missing any payments", "Stopped paying and hoped management would wait", "Waited to see if he got a new job before telling anyone"], correct: 1, explanation: "Early communication is the single most powerful tool in preventing eviction. Most landlords prefer a payment plan over the expense of an eviction. Rental assistance and legal aid work best BEFORE an eviction is filed." },
      { title: "Angela's 5-Year Barrier", story: "Five years ago, Angela was evicted for nonpayment during a difficult period. She has since stabilized and pays on time. She applies to 12 apartments over 8 months. All 12 reject her based on her eviction record. She finally gets housing through a nonprofit. at higher cost with fewer options.", question: "What does Angela's story teach us about the long-term impact of eviction?", options: ["Eviction records are cleared after 2 years", "An eviction creates a lasting barrier. even years later. affecting options, cost, and quality of available housing", "Nonprofits can always find housing so evictions aren't a big deal", "Landlords don't check eviction records for low-income housing"], correct: 1, explanation: "Eviction records stay for 7+ years and can appear indefinitely. Even one eviction dramatically reduces housing options, forces you into less desirable housing at higher cost, and can affect employment. Prevention is everything." },
    ],
  },
];

// ─── USERS ────────────────────────────────────────────────────────────────────
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().split("T")[0];
const AGENCIES = [
  { id: "ACH001", name: "ACH Management & Services LLC" },
  { id: "HOPE02", name: "Hope Housing Alliance" },
  { id: "RISE03", name: "Rise Community Partners" },
  { id: "YSS001", name: "Youth Shelter Services (YSS)" },
];
const INIT_USERS = {
  superadmin: { id: "superadmin", role: "superadmin", name: "Chantell Howard", password: "HE101admin!", agency: null, email: "admin@housingetiquette101.org" },
  admin2: { id: "admin2", role: "superadmin", name: "Antwan Howard", password: "HE101admin2!", agency: null, email: "admin@housingetiquette101.org" },
  ach_manager: { id: "ach_manager", role: "agency", name: "ACH Case Manager", password: "ACH2024!", agency: "ACH001", email: "admin@housingetiquette101.org" },
  yss_manager: { id: "yss_manager", role: "agency", name: "YSS Case Manager", password: "YSS2026!", agency: "YSS001", email: "admin@housingetiquette101.org" },
  chantell_test: { id:"chantell_test", role:"renter", name:"Chantell Howard (Test)", password:"Test2026!", agency:"ACH001", email:"admin@housingetiquette101.org", enrollDate:new Date().toISOString().split('T')[0], requiresMoveInClearance:false, deadlineExtended:false, caseNote:"Owner test account", modules:{}, outcomes:{stillHoused:true,violations:0,payment:"unknown",checkin:null}, certIssued:false, certDate:null, certId:null },
  renter_a: { id: "renter_a", role: "renter", name: "Jordan Davis", password: "Renter123!", agency: "ACH001", email: "jordan@email.com", enrollDate: daysAgo(21), requiresMoveInClearance: true, deadlineExtended: false, caseNote: "", modules: {}, outcomes:{stillHoused:true,violations:0,payment:"unknown",checkin:null}, certIssued:false, certDate:null, certId:null },
  renter_b: { id: "renter_b", role: "renter", name: "Priscilla Monroe", password: "Renter123!", agency: "ACH001", email: "priscilla@email.com", enrollDate: daysAgo(14), requiresMoveInClearance: true, deadlineExtended: false, caseNote: "", modules: { 1:{status:"complete",score:7,total:10,date:daysAgo(13),time:40}, 2:{status:"complete",score:8,total:10,date:daysAgo(11),time:35}, 3:{status:"complete",score:6,total:10,date:daysAgo(9),time:38}, 4:{status:"complete",score:5,total:10,date:daysAgo(7),time:52}, 5:{status:"in_progress",score:null,total:10,date:null,time:15} }, outcomes:{stillHoused:true,violations:1,payment:"late_once",checkin:daysAgo(7)}, certIssued:false, certDate:null, certId:null },
  renter_c: { id: "renter_c", role: "renter", name: "Devon Carter", password: "Renter123!", agency: "HOPE02", email: "devon@email.com", enrollDate: daysAgo(7), requiresMoveInClearance: false, deadlineExtended: false, caseNote: "", modules: {}, outcomes:{stillHoused:true,violations:0,payment:"unknown",checkin:null}, certIssued:false, certDate:null, certId:null },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// ─── DEADLINE & PRE-MOVE-IN HELPERS ──────────────────────────────────────────
const PROGRAM_DAYS = 30; // Days to complete all 8 modules

const getDeadline = (u) => {
  if (!u.enrollDate) return null;
  const d = new Date(u.enrollDate);
  d.setDate(d.getDate() + PROGRAM_DAYS);
  return d.toISOString().split("T")[0];
};

const getDaysRemaining = (u) => {
  const deadline = getDeadline(u);
  if (!deadline) return null;
  const today = new Date();
  const end = new Date(deadline);
  const diff = Math.ceil((end - today) / 86400000);
  return diff;
};

const getDeadlineStatus = (u) => {
  const days = getDaysRemaining(u);
  const pct = getPct(u);
  if (pct === 100) return { label: "✅ Completed", color: B.green, urgent: false };
  if (days === null) return { label: "No deadline set", color: B.gray, urgent: false };
  if (days < 0) return { label: `⚠️ ${Math.abs(days)} days overdue`, color: "#CC5500", urgent: true };
  if (days <= 5) return { label: `🔴 ${days} days left`, color: "#CC5500", urgent: true };
  if (days <= 10) return { label: `🟠 ${days} days left`, color: B.orange, urgent: true };
  if (days <= 20) return { label: `🟡 ${days} days left`, color: "#E6A800", urgent: false };
  return { label: `🟢 ${days} days left`, color: B.green, urgent: false };
};

const isClearedForMoveIn = (u) => getPct(u) === 100 && u.certIssued;

const getMoveInStatus = (u) => {
  if (!u || !u.requiresMoveInClearance) return null;
  if (isClearedForMoveIn(u)) return { label: "✅ Cleared for Move-In", color: B.green };
  const done = Object.values(u.modules||{}).filter(m=>m&&m.status==="complete").length;
  return { label: `🔒 ${done}/8 Modules. Not Yet Cleared`, color: "#CC5500" };
};

const getPct = (u) => { const done = Object.values(u.modules||{}).filter(m=>m.status==="complete").length; return Math.round((done/8)*100); };
const getScore = (u) => { const mods = Object.values(u.modules||{}).filter(m=>m.status==="complete"); return { earned: mods.reduce((a,m)=>a+(m.score||0),0), possible: mods.reduce((a,m)=>a+(m.total||0),0) }; };
const getTime = (u) => Object.values(u.modules||{}).reduce((a,m)=>a+(m.time||0),0);
const sColor = (p) => p===100?B.green:p>0?B.orange:B.gray;
const sLabel = (p) => p===100?"✅ Complete":p>0?"🔄 In Progress":"⭕ Not Started";

const exportCSV = (users, agencyId) => {
  const rows = [["Name","Email","Agency","Enrolled","Completion%","Modules","Score","Time(min)","Certificate","CertDate","Housed","Violations","Payment"]];
  Object.values(users).filter(u=>u.role==="renter"&&(!agencyId||u.agency===agencyId)).forEach(u=>{
    const p=getPct(u); const done=Object.values(u.modules||{}).filter(m=>m.status==="complete").length;
    const {earned,possible}=getScore(u); const ag=AGENCIES.find(a=>a.id===u.agency)?.name||u.agency;
    rows.push([u.name,u.email,ag,u.enrollDate||"",`${p}%`,`${done}/8`,possible>0?`${earned}/${possible}`:"N/A",getTime(u),u.certIssued?"Yes":"No",u.certDate||"",u.outcomes?.stillHoused?"Yes":"Unknown",u.outcomes?.violations??"N/A",u.outcomes?.payment||"Unknown"]);
  });
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="HE101_Report.csv"; a.click();
};

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Bar = ({pct,color=B.teal,h=8})=><div style={{background:"#E0E0E0",borderRadius:99,height:h,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:99,transition:"width 0.5s"}}/></div>;
const Pill = ({label,color=B.teal})=><span style={{background:color+"18",color,border:`1px solid ${color}33`,borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
const Card = ({children,style={}})=><div style={{background:B.white,borderRadius:12,padding:20,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",marginBottom:14,...style}}>{children}</div>;
const Btn = ({children,onClick,color=B.teal,outline,small,disabled,full,style={}})=><button onClick={onClick} disabled={disabled} style={{background:outline?"transparent":color,color:outline?color:B.white,border:`2px solid ${color}`,borderRadius:8,padding:small?"6px 14px":"11px 20px",fontSize:small?12:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,fontFamily:"Montserrat,sans-serif",width:full?"100%":"auto",...style}}>{children}</button>;

// ─── CERTIFICATE ──────────────────────────────────────────────────────────────
const Certificate = ({user,onClose})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
    <div style={{background:B.white,borderRadius:8,maxWidth:700,width:"100%",border:`8px solid ${B.orange}`,padding:"28px 36px",textAlign:"center",position:"relative"}}>
      <button onClick={onClose} style={{position:"absolute",top:10,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#999"}}>✕</button>
      <div style={{border:`3px solid ${B.teal}`,padding:20,borderRadius:4}}>
        {LOGO_B64 && <img src={LOGO_B64} alt="HE101 Logo" style={{width:110,height:"auto",margin:"0 auto 8px",display:"block"}} />}
        <div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:B.navy,fontFamily:"Montserrat,sans-serif",marginBottom:4}}>HOUSING ETIQUETTE 101 (HE101) · ACH MANAGEMENT & SERVICES LLC</div>
        <div style={{background:`linear-gradient(135deg,${B.orange},#E07000)`,color:B.white,padding:"8px 28px",fontSize:20,fontWeight:900,letterSpacing:2,fontFamily:"Playfair Display,Georgia,serif",display:"inline-block",margin:"8px 0 14px",borderRadius:4}}>CERTIFICATE OF COMPLETION</div>
        <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:14,color:"#555",marginBottom:6}}>— This certifies that —</div>
        <div style={{fontSize:26,fontWeight:700,fontFamily:"Playfair Display,Georgia,serif",color:B.navy,borderBottom:`2px solid ${B.navy}`,paddingBottom:8,marginBottom:8}}>{user.name}</div>
        <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:13,color:"#555",marginBottom:4}}>has successfully completed the</div>
        <div style={{fontSize:16,fontWeight:700,color:B.teal,fontFamily:"Playfair Display,Georgia,serif",marginBottom:12}}><em>Housing Etiquette 101</em> (HE101) Certification Program</div>
        <div style={{fontSize:11,color:"#666",fontFamily:"Playfair Display,Georgia,serif",maxWidth:480,margin:"0 auto 16px",lineHeight:1.7}}>and has demonstrated competency in housing responsibility, respectful tenancy, and community-centered living standards, fulfilling all educational requirements established by the HE101 curriculum.</div>
        <div style={{textAlign:"left",display:"inline-block",marginBottom:16}}>
          <div style={{fontWeight:700,color:B.teal,fontSize:12,fontFamily:"Playfair Display,Georgia,serif",marginBottom:6}}>Curriculum Areas Completed:</div>
          {["Successful Renter Mindset & Accountability","Housing Types & Shared Living","Rent, Subsidies & Income Rules","Lease Agreements & Compliance","Unit Care & Property Damage","Maintenance, Inspections & Recertification","Communication & Conflict Resolution","Evictions, Legal Consequences & Housing Stability"].map(item=>(
            <div key={item} style={{fontSize:11,fontFamily:"Montserrat,sans-serif",color:"#333",marginBottom:2,display:"flex",alignItems:"center",gap:6}}><span style={{color:B.green,fontWeight:700}}>☑</span>{item}</div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid #E0E0E0",paddingTop:12,marginTop:8,flexWrap:"wrap",gap:8}}>
          <div style={{background:B.gold,padding:"5px 16px",borderRadius:4,fontSize:11,fontWeight:700,fontFamily:"Montserrat,sans-serif",color:B.navy}}>Cert ID: {user.certId}</div>
          <div style={{fontFamily:"Montserrat,sans-serif",fontSize:11,color:"#555"}}>Date Issued: <strong>{user.certDate}</strong></div>
        </div>
        <div style={{display:"flex",justifyContent:"space-around",marginTop:14,paddingTop:12,borderTop:"1px solid #E0E0E0"}}>
          {[
            { sig: "Antwan Howard", role: "Authorized HE101 Representative\nACH Management & Services LLC" },
            { sig: AGENCIES.find(a=>a.id===user.agency)?.name || "Partner Agency", role: "Licensing Partner / Agency" },
            { sig: "Chantell Howard", role: "Program Facilitator" },
          ].map(item=>(
            <div key={item.role} style={{textAlign:"center",fontSize:10,color:"#888",fontFamily:"Montserrat,sans-serif",maxWidth:160}}>
              <div style={{fontSize:13,fontWeight:700,color:B.navy,fontFamily:"Playfair Display,Georgia,serif",marginBottom:4}}>{item.sig}</div>
              <div style={{borderTop:"1px solid #999",width:140,margin:"0 auto 4px"}}/>
              {item.role.split("\n").map((line,i)=><div key={i}>{line}</div>)}
            </div>
          ))}
        </div>
        <div style={{fontSize:9,color:"#aaa",fontFamily:"Montserrat,sans-serif",marginTop:10}}>© 2026 ACH Management & Services LLC · housingetiquette101.org · Building Stability Through Education & Accountability</div>
      </div>
      <div style={{marginTop:16,display:"flex",gap:10,justifyContent:"center"}}>
        <Btn onClick={()=>window.print()} color={B.teal} small>🖨️ Print</Btn>
        <Btn onClick={()=>generateCertPDF(user, AGENCIES.find(a=>a.id===user.agency)?.name)} color={B.orange} small>📥 Download PDF</Btn>
        <Btn onClick={onClose} outline color={B.gray} small>Close</Btn>
      </div>
    </div>
  </div>
);

// ─── MODULE DETAIL ────────────────────────────────────────────────────────────
const ModuleDetail = ({mod,userMod,onComplete,onClose})=>{
  const [tab,setTab]=useState("video");
  const [scenIdx,setScenIdx]=useState(0);
  const [scenAns,setScenAns]=useState(null);
  const [scenSubmit,setScenSubmit]=useState(false);
  const [quizAnswers,setQuizAnswers]=useState({});
  const [quizSubmitted,setQuizSubmitted]=useState(false);
  const [quizScore,setQuizScore]=useState(null);
  const [scenCompleted,setScenCompleted]=useState({});
  const [wbAnswers,setWbAnswers]=useState({});
  const [userState,setUserState]=useState("IA");
  const [videoWatched,setVideoWatched]=useState(false);
  const [videoStarted,setVideoStarted]=useState(false);
  const [sectionsDone,setSectionsDone]=useState({video:false,learn:false,scenarios:false,quiz:false,workbook:false});
  const [gateWarning,setGateWarning]=useState("");
  const tabs=["video","learn","scenarios","quiz","workbook","resources"];

  const tabOrder = ["video","learn","scenarios","quiz","workbook","resources"];

  const markSectionDone = (section) => {
    setSectionsDone(prev => ({...prev,[section]:true}));
  };

  const canAccessTab = (targetTab) => {
    const targetIdx = tabOrder.indexOf(targetTab);
    if(targetIdx === 0) return true; // video always accessible
    // Each tab requires all previous tabs to be done
    for(let i = 0; i < targetIdx; i++){
      if(tabOrder[i] !== "resources" && !sectionsDone[tabOrder[i]]){
        return false;
      }
    }
    return true;
  };

  const handleTabClick = (t) => {
    if(t === "resources"){ setTab(t); return; } // resources always accessible
    if(!canAccessTab(t)){
      const prevTab = tabOrder[tabOrder.indexOf(t)-1];
      const tabNames = {video:"Video",learn:"Learn",scenarios:"Scenarios",quiz:"Quiz",workbook:"Workbook"};
      setGateWarning(`⚠️ Please complete the ${tabNames[prevTab] || prevTab} section first before moving on.`);
      setTimeout(()=>setGateWarning(""),3000);
      return;
    }
    setGateWarning("");
    setTab(t);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,overflowY:"auto"}}>
      <div style={{background:B.light,minHeight:"100vh",maxWidth:700,margin:"0 auto"}}>
        {/* Header */}
        <div style={{background:mod.color,padding:"16px 20px 20px",color:B.white}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:B.white,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,marginBottom:10,fontFamily:"Montserrat,sans-serif"}}>← Back</button>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><div style={{width:56,height:56,borderRadius:12,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>{mod.emoji}</div></div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,opacity:0.8,fontFamily:"Montserrat,sans-serif"}}>MODULE {mod.id}</div>
          <div style={{fontSize:20,fontWeight:700,fontFamily:"Playfair Display,Georgia,serif",lineHeight:1.2,marginTop:4}}>{mod.title}</div>
          <div style={{fontSize:13,opacity:0.85,fontFamily:"Montserrat,sans-serif",marginTop:2}}>{mod.subtitle}</div>
        </div>

        {/* Gate Warning */}
        {gateWarning&&(
          <div style={{background:"#FFF3E0",border:"1.5px solid #F57C00",padding:"10px 16px",textAlign:"center",fontSize:13,color:"#E65100",fontWeight:700,margin:"0"}}>
            {gateWarning}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",background:B.white,borderBottom:"2px solid #E0E0E0"}}>
          {tabs.map(t=>(
            <button key={t} onClick={()=>handleTabClick(t)} style={{flex:1,padding:"11px 4px",border:"none",borderBottom:tab===t?`3px solid ${mod.color}`:"3px solid transparent",background:"transparent",color:tab===t?mod.color:"#90A4AE",fontWeight:tab===t?700:400,fontSize:11,cursor:"pointer",fontFamily:"Montserrat,sans-serif",textTransform:"capitalize"}}>
              {t==="video"?"📺 Video":t==="learn"?"📖 Learn":t==="scenarios"?"🎭 Scenarios":t==="quiz"?"📝 Quiz":t==="workbook"?"✏️ Workbook":"📦 Resources"}
            </button>
          ))}
        </div>

        <div style={{padding:"20px 16px"}}>

          {/* LEARN */}
          {tab==="video"&&(
          <div style={{padding:"0 0 20px"}}>
            <div style={{background:"#1B2A4A",padding:"12px 16px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"white",marginBottom:4}}>📺 Module Video</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>Watch the full video before moving to the next section.</div>
            </div>
            <div style={{position:"relative",paddingBottom:"56.25%",height:0,overflow:"hidden",background:"#000"}}>
              <iframe
                key={mod.id}
                src={(mod.videoUrl||"")+"?rel=0&modestbranding=1"}
                style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
                allowFullScreen
                title={mod.title}
              />
            </div>
            <div style={{padding:"16px 20px"}}>
              {!sectionsDone.video?(
                <div>
                  <div style={{fontSize:12,color:"#666",marginBottom:12,lineHeight:1.6,background:"#FFF8E1",padding:"10px 14px",borderRadius:8,border:"1px solid #F9A825"}}>
                    ⚠️ Watch the complete video above then click the button below to confirm you have finished watching before moving on to the Learn section.
                  </div>
                  <button onClick={()=>{markSectionDone("video");setVideoWatched(true);setTab("learn");}}
                    style={{background:mod.color,color:"white",border:"none",borderRadius:8,padding:"12px 24px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
                    ✅ I Have Watched the Full Video — Continue to Learn
                  </button>
                </div>
              ):(
                <div style={{background:"#EAF7EA",border:"1px solid #4CAF50",borderRadius:8,padding:"12px 16px",textAlign:"center"}}>
                  <span style={{fontSize:13,color:"#2E7D32",fontWeight:700}}>✅ Video completed — you may continue to the next sections</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab==="learn"&&(
            <div>
              {mod.slides.map((slide,i)=>(
                <Card key={i} style={{borderLeft:`4px solid ${mod.color}`}}>
                  <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:10,fontFamily:"Playfair Display,Georgia,serif"}}>{slide.heading}</div>
                  {slide.points.map((pt,j)=>(
                    <div key={j} style={{display:"flex",gap:10,marginBottom:7,alignItems:"flex-start"}}>
                      <span style={{color:mod.color,fontWeight:700,minWidth:16,fontFamily:"Montserrat,sans-serif"}}>•</span>
                      <span style={{fontSize:14,color:B.navy,lineHeight:1.5,fontFamily:"Montserrat,sans-serif"}}>{pt}</span>
                    </div>
                  ))}
                </Card>
              ))}

            </div>
          )}

          {/* SCENARIOS */}
  
                {tab==="learn"&&(
          <div style={{padding:"0 20px 20px"}}>
            {!sectionsDone.learn ? (
              <button onClick={()=>{markSectionDone("learn");setTab("scenarios");}}
                style={{background:"#00A3A3",color:"white",border:"none",borderRadius:8,padding:"12px 24px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
                ✅ I Have Read All the Slides — Continue to Scenarios
              </button>
            ) : (
              <div style={{background:"#EAF7EA",border:"1px solid #4CAF50",borderRadius:8,padding:"12px 16px",textAlign:"center"}}>
                <span style={{fontSize:13,color:"#2E7D32",fontWeight:700}}>✅ Learn section completed</span>
              </div>
            )}
          </div>
        )}

        {tab==="scenarios"&&(
            <div>
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                {mod.scenarios.map((_,i)=>(
                  <button key={i} onClick={()=>{setScenIdx(i);setScenAns(null);setScenSubmit(false);}} style={{flex:1,padding:"8px",border:`2px solid ${scenIdx===i?mod.color:"#E0E0E0"}`,borderRadius:8,background:scenIdx===i?mod.color+"18":B.white,color:scenIdx===i?mod.color:B.gray,fontWeight:700,cursor:"pointer",fontFamily:"Montserrat,sans-serif",fontSize:12}}>
                    Scenario {i+1}
                  </button>
                ))}
              </div>
              {mod.scenarios.map((sc,i)=>scenIdx===i&&(
                <div key={i}>
                  <div style={{background:B.navy,borderRadius:12,padding:18,marginBottom:16,color:B.white}}>
                    <div style={{fontSize:10,fontWeight:700,color:B.orange,letterSpacing:2,marginBottom:6,fontFamily:"Montserrat,sans-serif"}}>🎭 REAL-LIFE SCENARIO {i+1}</div>
                    <div style={{fontSize:17,fontWeight:700,fontFamily:"Playfair Display,Georgia,serif",marginBottom:10}}>{sc.title}</div>
                    <p style={{margin:0,fontSize:14,lineHeight:1.7,color:"#B0C4DE",fontFamily:"Montserrat,sans-serif"}}>{sc.story}</p>
                  </div>
                  <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:12,fontFamily:"Montserrat,sans-serif"}}>{sc.question}</div>
                  {sc.options.map((opt,oi)=>(
                    <div key={oi} onClick={()=>!scenSubmit&&setScenAns(oi)} style={{background:scenSubmit&&oi===sc.correct?"#E8F5E9":scenSubmit&&scenAns===oi&&oi!==sc.correct?"#FFEBEE":scenAns===oi?mod.accent:B.white,border:`2px solid ${scenSubmit&&oi===sc.correct?"#4CAF50":scenSubmit&&scenAns===oi&&oi!==sc.correct?"#CC5500":scenAns===oi?mod.color:"#E0E0E0"}`,borderRadius:10,padding:"12px 16px",marginBottom:10,cursor:scenSubmit?"default":"pointer",fontSize:14,color:B.navy,lineHeight:1.4,fontFamily:"Montserrat,sans-serif",transition:"all 0.15s"}}>
                      <span style={{fontWeight:700,marginRight:8,color:scenSubmit&&oi===sc.correct?"#4CAF50":scenSubmit&&scenAns===oi?"#CC5500":mod.color}}>{String.fromCharCode(65+oi)}.</span>{opt}{scenSubmit&&oi===sc.correct?" ✓":""}
                    </div>
                  ))}
                  {!scenSubmit&&scenAns!==null&&<Btn onClick={()=>setScenSubmit(true)} color={mod.color} full style={{marginTop:4}}>Submit Answer</Btn>}
                  {scenSubmit&&(
                    <div>
                      <div style={{background:scenAns===sc.correct?"#E8F5E9":"#FFF3E0",borderRadius:10,padding:16,borderLeft:`4px solid ${scenAns===sc.correct?"#4CAF50":B.orange}`,marginTop:8}}>
                        <div style={{fontWeight:700,marginBottom:6,fontSize:14,fontFamily:"Montserrat,sans-serif"}}>{scenAns===sc.correct?"✅ Correct!":"💡 Here's what you should know:"}</div>
                        <p style={{margin:0,fontSize:14,lineHeight:1.6,color:B.navy,fontFamily:"Montserrat,sans-serif"}}>{sc.explanation}</p>
                      </div>
                      {i<mod.scenarios.length-1?<Btn onClick={()=>{setScenIdx(i+1);setScenAns(null);setScenSubmit(false);}} color={mod.color} full style={{marginTop:12}}>Next Scenario →</Btn>:<Btn onClick={()=>setTab("quiz")} color={B.navy} full style={{marginTop:12}}>Next: Take the Quiz →</Btn>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* QUIZ - Google Form embed */}
  
                {tab==="scenarios"&&Object.keys(scenCompleted).length>=mod.scenarios.length&&!sectionsDone.scenarios&&(
          <div style={{padding:"0 20px 20px"}}>
            <button onClick={()=>{markSectionDone("scenarios");setTab("quiz");}}
              style={{background:"#CC5500",color:"white",border:"none",borderRadius:8,padding:"12px 24px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
              ✅ Scenarios Complete — Continue to Quiz
            </button>
          </div>
        )}

        {tab==="quiz"&&(
            <div>
              {(()=>{
                const questions = QUIZ_QUESTIONS[mod.id] || [];
                const allQAnswered = questions.every((_,qi)=>quizAnswers[qi]!==undefined);
                if(!quizSubmitted){
                  return(
                    <div>
                      <Card style={{borderTop:`4px solid ${mod.color}`,textAlign:"center",padding:20,marginBottom:0}}>
                        <div style={{fontSize:28,marginBottom:6}}>📝</div>
                        <div style={{fontWeight:700,color:B.navy,fontSize:17,fontFamily:"Playfair Display,Georgia,serif"}}>Module {mod.id} Quiz</div>
                        <div style={{color:B.gray,fontSize:13,marginTop:4,fontFamily:"Montserrat,sans-serif"}}>{questions.length} questions · Select one answer per question · Score saves automatically</div>
                      </Card>
                      {questions.map((q,qi)=>(
                        <div key={qi} style={{background:B.white,borderRadius:12,padding:20,marginBottom:12,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",borderLeft:`4px solid ${quizAnswers[qi]!==undefined?mod.color:"#E0E0E0"}`}}>
                          <div style={{fontWeight:700,color:B.navy,fontSize:14,marginBottom:14,fontFamily:"Montserrat,sans-serif",lineHeight:1.4}}>
                            <span style={{color:mod.color,marginRight:6}}>{qi+1}.</span>{q.q}
                          </div>
                          {q.options.map((opt,oi)=>(
                            <div key={oi} onClick={()=>setQuizAnswers(p=>({...p,[qi]:oi}))}
                              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:8,borderRadius:8,border:`2px solid ${quizAnswers[qi]===oi?mod.color:"#E0E0E0"}`,background:quizAnswers[qi]===oi?mod.color+"18":"#FAFAFA",cursor:"pointer",transition:"all 0.15s"}}>
                              <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${quizAnswers[qi]===oi?mod.color:"#BDBDBD"}`,background:quizAnswers[qi]===oi?mod.color:"white",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                {quizAnswers[qi]===oi&&<div style={{width:8,height:8,borderRadius:"50%",background:"white"}}/>}
                              </div>
                              <span style={{fontSize:13,color:B.navy,fontFamily:"Montserrat,sans-serif",lineHeight:1.4}}>{opt}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                      <div style={{padding:"0 0 20px"}}>
                        {!allQAnswered?(
                          <div>
                            <div style={{background:"#FFF3E0",border:"1.5px solid #F57C00",borderRadius:8,padding:"10px 14px",marginBottom:8,textAlign:"center",fontSize:12,color:"#E65100",fontWeight:700}}>
                              ⚠️ Answer all {questions.length} questions before submitting. ({questions.length - Object.keys(quizAnswers).length} remaining)
                            </div>
                            <button disabled style={{background:"#BDBDBD",color:"white",border:"none",borderRadius:8,padding:"14px",fontSize:14,fontWeight:700,width:"100%",cursor:"not-allowed",opacity:0.7}}>Submit Quiz</button>
                          </div>
                        ):(
                          <button onClick={()=>{
                            const correct = questions.filter((q,qi)=>quizAnswers[qi]===q.correct).length;
                            setQuizScore(correct);
                            setQuizSubmitted(true);
                            markSectionDone("quiz");
                            onComplete(mod.id,{status:"in_progress",score:correct,total:questions.length,date:new Date().toISOString().split("T")[0],time:15,quizDone:true});
                          }}
                            style={{background:mod.color,color:"white",border:"none",borderRadius:8,padding:"14px 24px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
                            ✅ Submit Quiz
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                // Results screen
                const pct = Math.round((quizScore/questions.length)*100);
                const passed = pct >= 70;
                return(
                  <div>
                    <Card style={{borderTop:`4px solid ${passed?B.green:B.orange}`,textAlign:"center",padding:24}}>
                      <div style={{fontSize:48,marginBottom:8}}>{passed?"🏆":"📊"}</div>
                      <div style={{fontWeight:700,color:B.navy,fontSize:22,fontFamily:"Playfair Display,Georgia,serif",marginBottom:4}}>
                        {quizScore}/{questions.length} Correct
                      </div>
                      <div style={{fontSize:32,fontWeight:900,color:passed?B.green:B.orange,marginBottom:8}}>{pct}%</div>
                      <div style={{fontSize:14,color:passed?"#2E7D32":B.orange,fontWeight:700,marginBottom:16}}>{passed?"✅ Passed — Great work!":"📖 Review the material and try again"}</div>
                      <div style={{background:passed?"#EAF7EA":"#FFF3E0",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:B.gray}}>Score saved to your record · Case manager notified</div>
                    </Card>
                    {questions.map((q,qi)=>(
                      <div key={qi} style={{background:B.white,borderRadius:12,padding:16,marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${quizAnswers[qi]===q.correct?B.green:B.red}`}}>
                        <div style={{fontWeight:700,color:B.navy,fontSize:13,marginBottom:8}}><span style={{color:mod.color}}>{qi+1}.</span> {q.q}</div>
                        {q.options.map((opt,oi)=>(
                          <div key={oi} style={{padding:"6px 10px",marginBottom:4,borderRadius:6,fontSize:12,
                            background:oi===q.correct?"#EAF7EA":oi===quizAnswers[qi]&&oi!==q.correct?"#FFEBEE":"#FAFAFA",
                            color:oi===q.correct?B.green:oi===quizAnswers[qi]&&oi!==q.correct?"#C62828":B.gray,
                            fontWeight:oi===q.correct||oi===quizAnswers[qi]?700:400,
                            border:`1px solid ${oi===q.correct?"#4CAF50":oi===quizAnswers[qi]&&oi!==q.correct?"#EF9A9A":"#E0E0E0"}`}}>
                            {oi===q.correct?"✅ ":oi===quizAnswers[qi]&&oi!==q.correct?"✗ ":""}{opt}
                          </div>
                        ))}
                      </div>
                    ))}
                    <div style={{padding:"0 0 20px"}}>
                      <button onClick={()=>setTab("workbook")} style={{background:B.teal,color:"white",border:"none",borderRadius:8,padding:"14px 24px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
                        Continue to Workbook →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* WORKBOOK */}
          {tab==="workbook"&&(
            <div>
              <Card style={{background:mod.accent,border:`1px solid ${mod.color}33`}}>
                <div style={{fontWeight:700,color:mod.color,fontSize:13,letterSpacing:1,marginBottom:6,fontFamily:"Montserrat,sans-serif"}}>✏️ MODULE {mod.id} WORKBOOK</div>
                <p style={{margin:0,fontSize:13,color:B.navy,lineHeight:1.6,fontFamily:"Montserrat,sans-serif"}}>{mod.workbook.purpose}</p>
              </Card>

              <Card>
                <div style={{fontWeight:700,color:B.navy,marginBottom:10,fontFamily:"Montserrat,sans-serif",fontSize:14}}>🔑 Key Points from This Module</div>
                {mod.workbook.keyPoints.map((pt,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                    <span style={{color:mod.color,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>✓</span>
                    <span style={{fontSize:13,color:B.navy,lineHeight:1.5,fontFamily:"Montserrat,sans-serif"}}>{pt}</span>
                  </div>
                ))}
              </Card>

              <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:12,fontFamily:"Playfair Display,Georgia,serif"}}>💭 Reflection Questions</div>
              <div style={{fontSize:12,color:B.gray,marginBottom:16,background:"#FFF8E1",padding:"10px 14px",borderRadius:8,border:"1px solid #F9A825"}}>
                ⚠️ You must answer all {mod.workbook.reflection.length} reflection questions to complete this module. Each answer must be written in your own words.
              </div>
              {mod.workbook.reflection.map((q,i)=>(
                <div key={i} style={{background:B.white,borderRadius:12,padding:20,marginBottom:16,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",borderLeft:`4px solid ${(wbAnswers[i]||"").trim()?B.green:mod.color}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:mod.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{color:"white",fontWeight:900,fontSize:14}}>{i+1}</span>
                    </div>
                    <div style={{fontWeight:700,color:B.navy,fontSize:14,lineHeight:1.5,fontFamily:"Montserrat,sans-serif",paddingTop:4}}>{q}</div>
                  </div>
                  <textarea value={wbAnswers[i]||""} onChange={e=>setWbAnswers(p=>({...p,[i]:e.target.value}))} placeholder="Write your honest reflection here..." rows={4}
                    style={{width:"100%",border:`2px solid ${(wbAnswers[i]||"").trim()?B.green:"#E0E0E0"}`,borderRadius:8,padding:"12px",fontSize:14,fontFamily:"Montserrat,sans-serif",outline:"none",resize:"vertical",boxSizing:"border-box",color:B.navy,lineHeight:1.5,transition:"border-color 0.2s"}}/>
                  {(wbAnswers[i]||"").trim() && (
                    <div style={{fontSize:11,color:B.green,fontWeight:700,marginTop:6}}>✅ Answered</div>
                  )}
                </div>
              ))}

              {(()=>{
                const allAnswered = mod.workbook.reflection.every((_,i)=>(wbAnswers[i]||"").trim().length>0);
                return allAnswered ? (
                  <Btn onClick={()=>{
                    onComplete(mod.id,{status:"complete",score:null,total:QUIZ_QUESTIONS[mod.id]?.length||5,date:new Date().toISOString().split("T")[0],time:45,reflections:wbAnswers});
                    onClose();
                  }} color={`linear-gradient(135deg,${B.orange},${B.teal})`} full style={{fontSize:16,padding:16,backgroundImage:`linear-gradient(135deg,${B.orange},${B.teal})`,border:"none"}}>
                    ✅ Mark Module {mod.id} Complete
                  </Btn>
                ) : (
                  <div>
                    <div style={{background:"#FFF3E0",border:"1.5px solid #F57C00",borderRadius:8,padding:"12px 16px",marginBottom:8,textAlign:"center"}}>
                      <div style={{fontSize:13,color:"#E65100",fontWeight:700}}>⚠️ Please answer all reflection questions before completing this module.</div>
                      <div style={{fontSize:11,color:"#BF360C",marginTop:4}}>
                        {mod.workbook.reflection.filter((_,i)=>!(wbAnswers[i]||"").trim()).length} question{mod.workbook.reflection.filter((_,i)=>!(wbAnswers[i]||"").trim()).length!==1?"s":""} remaining
                      </div>
                    </div>
                    <button disabled style={{background:"#BDBDBD",color:"white",border:"none",borderRadius:8,padding:"16px",fontSize:16,fontWeight:700,width:"100%",cursor:"not-allowed",opacity:0.6}}>
                      ✅ Mark Module {mod.id} Complete
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* RESOURCES TAB */}
          {tab==="resources"&&(
            <div>
              {/* Module-specific downloads */}
              <Card style={{borderTop:`4px solid ${mod.color}`}}>
                <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:14,fontFamily:"Playfair Display,Georgia,serif"}}>📥 Module {mod.id} Resources</div>
                {[
                  mod.id===1&&{icon:"📋",title:"Renter Accountability Self-Assessment",desc:"Rate yourself on the S.H.I.T. framework. Serious, Honest, Informative, Trustworthy. Identify your strongest and weakest areas."},
                  mod.id===2&&{icon:"🏘️",title:"Community Living Expectations Checklist",desc:"A checklist of shared living standards. noise, guests, parking, pets, common areas. to review with your household."},
                  mod.id===3&&{icon:"💰",title:"Income Reporting Tracker",desc:"Track all income sources and changes with dates. Use this to stay ahead of recertification requirements."},
                  mod.id===4&&{icon:"📋",title:"Lease Review Checklist",desc:"Key sections to locate and understand in any lease. rent terms, guest policy, pet rules, maintenance, termination clauses."},
                  mod.id===5&&{icon:"🏠",title:"Move-In Inspection Checklist",desc:"Document every room, wall, floor, appliance, and fixture at move-in with condition notes. Your best protection at move-out."},
                  mod.id===6&&{icon:"🔧",title:"Maintenance Request Log",desc:"Track every maintenance request. date submitted, issue description, response received. Protects you if issues are ignored."},
                  mod.id===7&&{icon:"💬",title:"Sample Communication Templates",desc:"Ready-to-use email and letter templates for contacting management about maintenance, notices, disputes, and payment hardship."},
                  mod.id===8&&{icon:"⚖️",title:"Eviction Prevention Action Plan",desc:"A step-by-step action plan for what to do the moment you receive any eviction notice. contacts, deadlines, and resources."},
                ].filter(Boolean).map(r=>(
                  <div key={r.title} style={{background:mod.accent,borderRadius:10,padding:14,marginBottom:10,border:`1px solid ${mod.color}33`}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <span style={{fontSize:24}}>{r.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:B.navy,fontSize:13,marginBottom:4,fontFamily:"Montserrat,sans-serif"}}>{r.title}</div>
                        <div style={{fontSize:12,color:B.gray,lineHeight:1.5,fontFamily:"Montserrat,sans-serif"}}>{r.desc}</div>
                        <div style={{marginTop:8,fontSize:11,color:mod.color,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>📄 Available from your case manager or at housingetiquette101.org</div>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>

              {/* What To Do If - Quick Reference */}
              <Card>
                <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:14,fontFamily:"Playfair Display,Georgia,serif"}}>🚨 What To Do If...</div>
                {[
                  {situation:"You can't pay rent this month",steps:["Contact management BEFORE the due date rather than after","Explain your situation honestly and ask about a payment plan","Apply for emergency rental assistance immediately (call 211)","Document all communications in writing","Do NOT just not pay and hope for the best"]},
                  {situation:"You receive any notice on your door",steps:["Read it completely. every word, every deadline","Note the response deadline. it starts TODAY","Call the management office the same day you receive it","Respond in writing even if you disagree","Keep a copy of the notice and your response"]},
                  {situation:"Your heat, water, or electricity stops working",steps:["This is an emergency. contact management immediately","Call the emergency maintenance line if after hours","Document the date and time you reported it","If not resolved in 24 hours, contact your local housing authority","Know your rights. Habitability standards are required by law."]},
                  {situation:"You have a conflict with a neighbor",steps:["Do NOT confront them aggressively. this can become YOUR violation","Document incidents with dates, times, and descriptions","Report to management in writing","Request management mediate if the issue continues","Never retaliate. it escalates and harms your record"]},
                  {situation:"You receive an eviction notice",steps:["Do NOT ignore it or move out immediately","Read it to identify exactly what type of notice it is","Contact Iowa Legal Aid immediately: 1-800-532-1275","Apply for emergency rental assistance through 211 Iowa","Respond to management in writing within the stated deadline","Show up to any court date. missing it guarantees a judgment against you"]},
                ].map((item,i)=>(
                  <div key={i} style={{marginBottom:14,borderLeft:`4px solid ${mod.color}`,paddingLeft:14}}>
                    <div style={{fontWeight:700,color:B.navy,fontSize:13,marginBottom:8,fontFamily:"Montserrat,sans-serif"}}>❓ {item.situation}</div>
                    {item.steps.map((step,j)=>(
                      <div key={j} style={{display:"flex",gap:8,marginBottom:5,alignItems:"flex-start"}}>
                        <span style={{color:mod.color,fontWeight:700,fontSize:12,minWidth:16,fontFamily:"Montserrat,sans-serif"}}>{j+1}.</span>
                        <span style={{fontSize:12,color:"#444",lineHeight:1.5,fontFamily:"Montserrat,sans-serif"}}>{step}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </Card>

              {/* Dynamic State Resources */}
              {(()=>{
                const stateCode = userState || "IA";
                const sr = STATE_RESOURCES[stateCode] || STATE_RESOURCES.OTHER;
                const allOrgs = [
                  {name:sr.legalAid.name, desc:"Free or low-cost legal help for renters facing eviction, housing disputes, or discrimination.", phone:sr.legalAid.phone, web:sr.legalAid.web, color:B.teal},
                  {name:sr.helpline.name, desc:"24/7 helpline connecting residents to emergency rental assistance, utility help, food, and housing resources.", phone:sr.helpline.phone, web:sr.helpline.web, color:B.orange},
                  {name:sr.housingAuthority.name, desc:"Public housing, voucher programs, and housing assistance for your area.", phone:sr.housingAuthority.phone, web:sr.housingAuthority.web, color:B.teal},
                  {name:sr.emergencyRent.name, desc:"State-funded emergency rental assistance to prevent eviction for eligible renters.", phone:sr.emergencyRent.phone, web:sr.emergencyRent.web, color:B.orange},
                  ...sr.localOrgs.map(o=>({...o, desc:"Local housing support organization in your area.", color:B.teal})),
                  {name:"ACH Management & Services LLC", desc:"Housing Etiquette 101 program administrator. Contact for program questions and agency partnerships.", phone:"Contact via housingetiquette101.org", web:"housingetiquette101.org", color:B.navy},
                ];
                return(
                  <Card style={{borderTop:`4px solid ${B.teal}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                      <div style={{fontWeight:700,color:B.navy,fontSize:15,fontFamily:"Playfair Display,Georgia,serif"}}>🏛️ {sr.name} Housing Resources</div>
                      <select value={userState||"IA"} onChange={e=>setUserState(e.target.value)}
                        style={{border:`1px solid ${B.teal}`,borderRadius:6,padding:"4px 10px",fontSize:12,color:B.navy,fontFamily:"Montserrat,sans-serif",cursor:"pointer"}}>
                        {US_STATES.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}
                      </select>
                    </div>
                    {sr.evictionLaw&&<div style={{background:"#FFF8E1",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,color:B.navy,fontFamily:"Montserrat,sans-serif",lineHeight:1.5,borderLeft:`3px solid ${B.gold}`}}>⚖️ <strong>State Law Note:</strong> {sr.evictionLaw}</div>}
                    {allOrgs.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:"1px solid #F0F0F0",alignItems:"flex-start"}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:r.color,marginTop:6,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,color:B.navy,fontSize:13,fontFamily:"Montserrat,sans-serif"}}>{r.name}</div>
                          <div style={{fontSize:11,color:B.gray,lineHeight:1.5,margin:"3px 0",fontFamily:"Montserrat,sans-serif"}}>{r.desc}</div>
                          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:r.color,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>📞 {r.phone}</span>
                            <span style={{fontSize:11,color:B.teal,fontFamily:"Montserrat,sans-serif"}}>🌐 {r.web}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })()}

              {/* Housing Glossary */}
              <Card>
                <div style={{fontWeight:700,color:B.navy,fontSize:15,marginBottom:14,fontFamily:"Playfair Display,Georgia,serif"}}>📖 Housing Terms Glossary</div>
                <div style={{fontSize:11,color:B.gray,marginBottom:12,fontFamily:"Montserrat,sans-serif"}}>Key terms every renter needs to know</div>
                {[
                  {term:"Contract Rent",def:"The full monthly rent amount stated in your lease. exists whether or not you receive assistance."},
                  {term:"Rent Subsidy",def:"Financial assistance that covers part of your rent. You are still responsible for your portion."},
                  {term:"HCV / Section 8",def:"Housing Choice Voucher. a federal rental assistance program administered by local housing authorities."},
                  {term:"PBV",def:"Project-Based Voucher. rental assistance tied to a specific unit, not portable like Section 8."},
                  {term:"RRH",def:"Rapid Rehousing. a program that provides short-term rental assistance to help people quickly exit homelessness."},
                  {term:"EIV",def:"Enterprise Income Verification. a federal database housing authorities use to verify tenant income and employment."},
                  {term:"Recertification",def:"Annual process of verifying income, household composition, and program eligibility for subsidized housing."},
                  {term:"Lease Addendum",def:"A supplemental document added to your lease that carries the same legal weight as the lease itself."},
                  {term:"Cure or Quit",def:"A notice requiring you to fix a lease violation within a set number of days or vacate the unit."},
                  {term:"Pay or Quit",def:"A notice requiring you to pay all past-due rent within a set number of days or vacate."},
                  {term:"Unconditional Quit",def:"A notice requiring you to vacate with no option to fix the problem, typically for serious violations."},
                  {term:"Writ of Possession",def:"A court order authorizing the landlord to take back the property after a successful eviction judgment."},
                  {term:"Normal Wear & Tear",def:"Expected deterioration from normal use rather than chargeable at move-out. Damage beyond this is your responsibility."},
                  {term:"Security Deposit",def:"Money paid upfront to cover unpaid rent or damage beyond normal wear and tear at move-out."},
                  {term:"Habitability",def:"The legal requirement that a rental unit be safe, sanitary, and fit for human occupation."},
                  {term:"CoC",def:"Continuum of Care. a regional planning body that coordinates housing and services for homeless individuals."},
                  {term:"CDBG",def:"Community Development Block Grant. federal funding used for housing, community development, and anti-poverty programs."},
                  {term:"Fair Housing",def:"Federal law prohibiting discrimination in housing based on race, color, religion, sex, national origin, disability, or family status."},
                ].map((g,i)=>(
                  <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #F5F5F5"}}>
                    <div style={{minWidth:140,fontWeight:700,color:mod.color,fontSize:12,fontFamily:"Montserrat,sans-serif"}}>{g.term}</div>
                    <div style={{fontSize:12,color:"#444",lineHeight:1.5,fontFamily:"Montserrat,sans-serif"}}>{g.def}</div>
                  </div>
                ))}
              </Card>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function HE101App() {
  const [cu,setCu]=useState(null); // current user
  const [loginId,setLoginId]=useState("");
  const [loginPw,setLoginPw]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [loginLoading,setLoginLoading]=useState(false);
  const [showDemo,setShowDemo]=useState(false);
  const [screen,setScreen]=useState("login");
  const [activeTab,setActiveTab]=useState("overview");
  const [openMod,setOpenMod]=useState(null);
  const [certUser,setCertUser]=useState(null);
  const [selUser,setSelUser]=useState(null);
  const [toast,setToast]=useState("");
  const [agFilt,setAgFilt]=useState("all");
  const [dbUsers,setDbUsers]=useState({});
  const [dbLoaded,setDbLoaded]=useState(false);

  const showToast=(m)=>{setToast(m);setTimeout(()=>setToast(""),3000);};

  // Load all users from Supabase on mount
  useEffect(()=>{
    loadAllData();
  },[]);

  const loadAllData = async () => {
    try {
      const [usersData, progressData, outcomesData, agenciesData] = await Promise.all([
        supabase.query('users', {select:'*'}),
        supabase.query('module_progress', {select:'*'}),
        supabase.query('outcomes', {select:'*'}),
        supabase.query('agencies', {select:'*'}).catch(()=>[]),
      ]);
      // Merge Supabase agencies with hardcoded defaults
      if(Array.isArray(agenciesData) && agenciesData.length > 0){
        const supabaseAgencies = agenciesData.map(a=>({id:a.id, name:a.name}));
        const merged = [...AGENCIES];
        supabaseAgencies.forEach(sa=>{
          if(!merged.find(a=>a.id===sa.id)) merged.push(sa);
        });
        setLiveAgencies(merged);
      }

      // Build users object with modules and outcomes
      const usersMap = {};
      if (Array.isArray(usersData)) {
        usersData.forEach(u => {
          usersMap[u.id] = {
            ...u,
            agency: u.agency_id,
            enrollDate: u.enroll_date,
            certIssued: u.cert_issued,
            certDate: u.cert_date,
            certId: u.cert_id,
            modules: {},
            outcomes: {}
          };
        });
      }

      // Attach module progress
      if (Array.isArray(progressData)) {
        progressData.forEach(p => {
          if (usersMap[p.user_id]) {
            usersMap[p.user_id].modules[p.module_id] = {
              status: p.status,
              score: p.score,
              total: p.total || 10,
              date: p.completed_date,
              time: p.time_spent || 0
            };
          }
        });
      }

      // Attach outcomes
      if (Array.isArray(outcomesData)) {
        outcomesData.forEach(o => {
          if (usersMap[o.user_id]) {
            usersMap[o.user_id].outcomes = {
              stillHoused: o.still_housed,
              violations: o.lease_violations,
              payment: o.payment_consistency,
              checkin: o.last_checkin
            };
          }
        });
      }

      setDbUsers(usersMap);
      setDbLoaded(true);
    } catch(err) {
      console.error('Failed to load from Supabase, using local data:', err);
      setDbUsers(INIT_USERS);
      setDbLoaded(true);
    }
  };

  // Use DB users if loaded, otherwise fall back to local
  const users = dbLoaded ? {...INIT_USERS, ...dbUsers} : INIT_USERS;

  const login = async () => {
    const uid = loginId.trim().toLowerCase();
    if (!uid || !loginPw) { setLoginErr("Please enter your username and password."); return; }
    setLoginLoading(true);
    try {
      // Try Supabase first
      const result = await supabase.query('users', { select: '*', filter: { id: uid } });
      if (Array.isArray(result) && result.length > 0) {
        const u = result[0];
        if (u.password_hash === loginPw) {
          const fullUser = users[uid] || { ...u, agency: u.agency_id, modules: {}, outcomes: {} };
          setCu(fullUser);
          setScreen(u.role === 'renter' ? 'renter' : 'dashboard');
          setLoginErr("");
        } else {
          setLoginErr("Invalid username or password.");
        }
      } else {
        // Fall back to local users
        const u = INIT_USERS[uid];
        if (u && u.password === loginPw) {
          setCu(u); setScreen(u.role==="renter"?"renter":"dashboard"); setLoginErr("");
        } else {
          setLoginErr("Invalid username or password.");
        }
      }
    } catch(err) {
      // Fall back to local on network error
      const u = INIT_USERS[uid];
      if (u && u.password === loginPw) {
        setCu(u); setScreen(u.role==="renter"?"renter":"dashboard"); setLoginErr("");
      } else {
        setLoginErr("Invalid username or password.");
      }
    }
    setLoginLoading(false);
  };

  const logout=()=>{setCu(null);setScreen("login");setLoginId("");setLoginPw("");};

  const completeModule = async (userId, modId, data) => {
    // Update local state immediately
    setDbUsers(prev=>{
      const existing = prev[userId] || users[userId] || {};
      return {...prev,[userId]:{...existing,modules:{...(existing.modules||{}),[modId]:data}}};
    });
    showToast(`✅ Module ${modId} marked complete!`);
    // Save to Supabase module_progress table
    supabase.upsert('module_progress', {
      user_id: userId,
      module_id: modId,
      status: data.status || 'complete',
      score: data.score || 0,
      total: data.total || 10,
      completed_date: new Date().toISOString().split('T')[0],
      time_spent: data.time || 0
    }).catch(err => console.log('Progress save error:', err));
    // Send notification to case manager
    const participant = users[userId];
    if (participant) {
      sendNotification('module_complete', participant, modId, null);
      // Auto-issue certificate if all 8 complete
      const updatedModules = {...(participant.modules||{}), [modId]: data};
      const allDone = [1,2,3,4,5,6,7,8].every(m => updatedModules[m]?.status === 'complete');
      if (allDone && !participant.certIssued) {
        const certId = `HE101-2026-${participant.name.split(' ').map(n=>n[0]).join('')}-${Date.now().toString().slice(-4)}`;
        const certDate = new Date().toISOString().split('T')[0];
        setDbUsers(prev=>({...prev,[userId]:{...prev[userId],certIssued:true,certDate,certId}}));
        sendNotification('program_complete', participant, null, null);
        showToast('🏆 All 8 modules complete! Certificate earned!');
        // Save cert to Supabase
        supabase.update('users', {cert_issued:true, cert_date:certDate, cert_id:certId}, {id:userId}).catch(()=>{});
      }
    }
    // Save to Supabase
    try {
      await supabase.upsert('module_progress', {
        user_id: userId,
        module_id: modId,
        status: data.status,
        score: data.score,
        total: data.total || 5,
        completed_date: data.date,
        time_spent: data.time || 45
      }, 'user_id,module_id');
      // Save reflection answers if present
      if(data.reflections && Object.keys(data.reflections).length > 0){
        await supabase.upsert('reflections', {
          user_id: userId,
          module_id: modId,
          answers: JSON.stringify(data.reflections),
          submitted_at: new Date().toISOString()
        }, 'user_id,module_id').catch(()=>{});
      }
    } catch(err) {
      console.error('Failed to save progress:', err);
    }
  };



  // ─── AGENCY MANAGEMENT STATE ────────────────────────────────────────────────
  const [showAddAgency, setShowAddAgency] = useState(false);
  const [liveAgencies, setLiveAgencies] = useState([...AGENCIES]);
  const [newAgency, setNewAgency] = useState({ name: "", contactName: "", email: "", phone: "", state: "IA", type: "nonprofit" });
  const [agencyRequests, setAgencyRequests] = useState([]);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [intakeForm, setIntakeForm] = useState({ name: "", email: "", phone: "", dob: "", agency: "", housingGoal: "", currentSituation: "", referredBy: "" });
  const [reminders, setReminders] = useState([]);
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", org: "", message: "" });
  const [showTOS, setShowTOS] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const addAgency = async () => {
    if (!newAgency.name || !newAgency.email) { showToast("Agency name and email are required."); return; }
    const agencyId = newAgency.name.replace(/[^A-Z0-9]/gi,'').substring(0,6).toUpperCase() + Math.floor(Math.random()*100);
    try {
      await supabase.insert('agencies', {
        id: agencyId,
        name: newAgency.name,
        contact_email: newAgency.email,
        state: newAgency.state,
        active: true,
        created_at: new Date().toISOString()
      });
      // Add to live agencies state immediately
      setLiveAgencies(prev=>[...prev, {id:agencyId, name:newAgency.name}]);
      showToast("✅ Agency " + newAgency.name + " added! Check the Agencies tab.");
      setNewAgency({ name: "", contactName: "", email: "", phone: "", state: "IA", type: "nonprofit" });
      setShowAddAgency(false);
      setTimeout(async () => { await loadAllData(); }, 1000);
    } catch(err) {
      showToast("Error adding agency. Please try again.");
    }
  };

  const submitIntake = async () => {
    if (!intakeForm.name || !intakeForm.email) { showToast("Name and email are required."); return; }
    try {
      await supabase.insert('notifications', {
        type: 'intake_form',
        participant_name: intakeForm.name,
        participant_id: null,
        agency_id: intakeForm.agency || null,
        message: JSON.stringify(intakeForm),
        created_at: new Date().toISOString(),
        read: false
      });
      showToast("✅ Intake form submitted. You will be contacted within 2 business days.");
      setIntakeForm({ name: "", email: "", phone: "", dob: "", agency: "", housingGoal: "", currentSituation: "", referredBy: "" });
      setShowIntakeForm(false);
    } catch(err) {
      showToast("Form submitted. We will be in touch soon.");
      setShowIntakeForm(false);
    }
  };

  const submitContact = async () => {
    if (!contactForm.name || !contactForm.email || !contactForm.message) { showToast("Please fill in all required fields."); return; }
    try {
      await supabase.insert('notifications', {
        type: 'contact_form',
        participant_name: contactForm.name,
        participant_id: null,
        agency_id: null,
        message: JSON.stringify(contactForm),
        created_at: new Date().toISOString(),
        read: false
      });
      showToast("✅ Message sent! We will respond within 1 business day.");
      setContactForm({ name: "", email: "", phone: "", org: "", message: "" });
      setShowContact(false);
    } catch(err) {
      showToast("Message received. We will be in touch soon.");
    }
  };


  // ─── SPONSORSHIP SUBMIT HANDLER ─────────────────────────────────────────────
  const handleSponsorSubmit = () => {
    if(!sponsorForm.name || !sponsorForm.email || !sponsorForm.agency || !sponsorForm.reason){
      showToast("Please fill in all required fields including your agency referral code.");
      return;
    }
    const validCodes = ["ACH001","HOPE02","RISE03","YSS001"];
    const codeEntered = (sponsorForm.agency||"").toUpperCase().trim();
    if(!validCodes.includes(codeEntered)){
      setSponsorCodeError("Invalid agency referral code. Please check the code with your case manager and try again.");
      return;
    }
    setSponsorCodeError("");
    const newRequest = {
      id: Date.now(),
      name: sponsorForm.name,
      email: sponsorForm.email,
      phone: sponsorForm.phone || "",
      agency: codeEntered,
      referredBy: sponsorForm.referredBy || "",
      reason: sponsorForm.reason,
      status: "pending",
      date: new Date().toISOString().split('T')[0]
    };
    setSponsorRequests(prev => [...prev, newRequest]);
    supabase.insert('notifications', {
      type: 'sponsorship_application',
      participant_name: sponsorForm.name,
      participant_id: null,
      agency_id: codeEntered,
      message: JSON.stringify(newRequest),
      created_at: new Date().toISOString(),
      read: false
    }).catch(() => {});
    setSponsorForm({name:"",email:"",phone:"",agency:"",reason:"",referredBy:""});
    setSponsorCodeError("");
    setShowSponsorForm(false);
    showToast("✅ Application submitted! You will be contacted within 2 business days.");
  };

  // ─── SPONSORSHIP STATE ──────────────────────────────────────────────────────
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [sponsorRequests, setSponsorRequests] = useState([
    { id: 1, name: "Sample Applicant", email: "sample@email.com", agency: "ACH001", reason: "Referred by case manager for eviction prevention", status: "pending", date: "2026-04-24" }
  ]);
  const [sponsorForm, setSponsorForm] = useState({ name: "", email: "", phone: "", agency: "", reason: "", referredBy: "" });
  const [sponsorCodeError, setSponsorCodeError] = useState("");

  // ─── ADD PARTICIPANT STATE ───────────────────────────────────────────────────
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({ name: "", email: "", username: "", password: "", agency: "ACH001" });

  // ─── PASSWORD RESET STATE ────────────────────────────────────────────────────
  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");

  const handleForgotPassword = async () => {
    if (!forgotEmail) { setForgotMsg("Please enter your email address."); return; }
    try {
      // Check if user exists in Supabase
      const result = await supabase.query('users', { select: '*', filter: { email: forgotEmail.trim().toLowerCase() } });
      if (Array.isArray(result) && result.length > 0) {
        // Log reset request to notifications table
        await supabase.insert('notifications', {
          type: 'password_reset',
          participant_name: result[0].name,
          participant_id: result[0].id,
          message: `Password reset requested for ${forgotEmail}. Please contact admin at housingetiquette101.org or call your case manager.`,
          created_at: new Date().toISOString(),
          read: false
        }).catch(()=>{});
        setForgotMsg("✅ Request received. You will receive instructions at " + forgotEmail + " within 24 hours. You may also contact your case manager or email housingetiquette101.org directly.");
      } else {
        setForgotMsg("No account found with that email. Please contact your case manager or housingetiquette101.org.");
      }
    } catch(err) {
      setForgotMsg("✅ Request received. Please contact housingetiquette101.org or your case manager for assistance with your password reset.");
    }
  };

  const approveSponsor = (id) => {
    setSponsorRequests(prev => prev.map(r => r.id === id ? {...r, status: "approved"} : r));
    showToast("✅ Sponsorship approved. Participant will be contacted.");
  };

  const denySponsor = (id) => {
    setSponsorRequests(prev => prev.map(r => r.id === id ? {...r, status: "denied"} : r));
    showToast("Sponsorship request denied.");
  };

  const addParticipant = async () => {
    if (!newParticipant.name || !newParticipant.email || !newParticipant.username || !newParticipant.password) {
      showToast("Please fill in all required fields."); return;
    }
    const cleanUsername = newParticipant.username.toLowerCase().replace(/[^a-z0-9_]/g,"_");
    const newUser = {
      id: cleanUsername,
      role: "renter",
      name: newParticipant.name,
      email: newParticipant.email.toLowerCase().trim(),
      password_hash: newParticipant.password,
      agency_id: newParticipant.agency,
      enroll_date: new Date().toISOString().split('T')[0],
      cert_issued: false,
      active: true
    };
    try {
      await supabase.insert('users', newUser);
      // Add to local state immediately
      const localUser = {
        ...newUser,
        id: cleanUsername,
        agency: newParticipant.agency,
        enrollDate: newUser.enroll_date,
        certIssued: false,
        modules: {},
        outcomes: {}
      };
      setUsers(prev => ({...prev, [cleanUsername]: localUser}));
      showToast("✅ " + newParticipant.name + " added successfully!");
      setNewParticipant({ name: "", email: "", username: "", password: "", agency: "ACH001" });
      setShowAddParticipant(false);
      setTimeout(async () => { await loadAllData(); }, 1500);
    } catch(err) {
      showToast("Error adding participant. Please try again.");
    }
  };


  // ─── DELETE PARTICIPANT ──────────────────────────────────────────────────────
  const deleteParticipant = async (userId) => {
    if(!window.confirm("Are you sure you want to delete this participant? This cannot be undone.")) return;
    try {
      // Remove from Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      // Remove from local state
      setUsers(prev => {
        const next = {...prev};
        delete next[userId];
        return next;
      });
      showToast("✅ Participant deleted successfully.");
    } catch(err) {
      // Remove from local state only if Supabase fails
      setUsers(prev => {
        const next = {...prev};
        delete next[userId];
        return next;
      });
      showToast("✅ Participant removed.");
    }
  };

  const renters=(agId)=>Object.values(users).filter(u=>u.role==="renter"&&(!agId||u.agency===agId));
  const visible=renters(cu?.role==="agency"?cu.agency:agFilt!=="all"?agFilt:null);
  const totalDone=visible.filter(u=>getPct(u)===100).length;
  const avgPct=visible.length>0?Math.round(visible.reduce((a,u)=>a+getPct(u),0)/visible.length):0;


  // ── LOGIN ──────────────────────────────────────────────────────────────────
  // Safety: if dbLoaded is false, show a brief loading state
  if(!dbLoaded) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1B2A4A,#00A3A3)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');`}</style>
      <div style={{fontSize:28,fontWeight:900,color:"white",fontFamily:"Montserrat,sans-serif"}}>Housing Etiquette 101</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",fontFamily:"Montserrat,sans-serif"}}>Loading...</div>
      <div style={{width:40,height:40,border:"4px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(screen==="login") return(
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${B.navy} 0%,#1B3A5A 50%,${B.teal} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"Montserrat,sans-serif"}}>
      <style>{FONT_STYLE}</style>
      <style>{RESPONSIVE_STYLE}</style>
      <div style={{display:"flex",width:"100%",maxWidth:960,borderRadius:20,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        {/* Left panel - desktop only */}
        <div style={{flex:1,background:`linear-gradient(135deg,${B.navy},${B.teal})`,padding:"60px 48px",display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0}}>
          <div style={{fontSize:28,fontWeight:900,color:B.white,fontFamily:"Playfair Display,Georgia,serif",lineHeight:1.2,marginBottom:16}}>Housing Etiquette 101</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.7,marginBottom:32,fontFamily:"Montserrat,sans-serif"}}>Building stable communities through education, accountability, and prevention. Empowering renters and agencies across Iowa and beyond.</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {[{icon:"📖",text:"8 comprehensive modules with video lessons"},{icon:"🎭",text:"Real-life scenarios and interactive tools"},{icon:"📊",text:"Funder-ready reporting and outcome tracking"},{icon:"🏆",text:"Certificates of completion for participants"},{icon:"💬",text:"AI-powered housing counselor available 24/7"}].map(f=>(
              <div key={f.text} style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{f.icon}</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.85)",fontFamily:"Montserrat,sans-serif"}}>{f.text}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:40,paddingTop:24,borderTop:"1px solid rgba(255,255,255,0.2)"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"Montserrat,sans-serif"}}>© 2026 ACH Management & Services LLC</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"Montserrat,sans-serif",marginTop:2}}>Educate · Protect · Sustain</div>
          </div>
        </div>
        {/* Right panel - login form */}
        <div style={{width:420,flexShrink:0,background:B.white,padding:40,display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          {LOGO_B64 && <img src={LOGO_B64} alt="Housing Etiquette 101" style={{width:180,height:"auto",margin:"0 auto 12px",display:"block",borderRadius:8}} />}
          <div style={{background:B.orange,color:B.white,display:"inline-block",borderRadius:4,padding:"3px 14px",fontSize:10,fontWeight:700,letterSpacing:2,marginBottom:8}}>COMPLIANCE IS KEY</div>
          <div style={{fontSize:13,color:B.teal,fontWeight:800,marginBottom:4,fontFamily:"Montserrat,sans-serif",lineHeight:1.4}}>Building Stability Through Education & Accountability</div>
        </div>

        {[{label:"USERNAME",val:loginId,set:setLoginId,type:"text",ph:"Enter your username"},{label:"PASSWORD",val:loginPw,set:setLoginPw,type:"password",ph:"Enter your password"}].map(f=>(
          <div key={f.label} style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:B.navy,display:"block",marginBottom:6}}>{f.label}</label>
            <input value={f.val} onChange={e=>f.set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} type={f.type} placeholder={f.ph}
              style={{width:"100%",border:`2px solid ${loginErr?"#CC5500":"#E0E0E0"}`,borderRadius:8,padding:"12px 14px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        {loginErr&&<div style={{color:B.red,fontSize:13,marginBottom:10,fontWeight:600,background:"#FFEBEE",padding:"8px 12px",borderRadius:6}}>⚠️ {loginErr}</div>}
        <Btn onClick={login} color={B.orange} full style={{fontSize:16,padding:14,marginTop:4}} disabled={loginLoading}>
          {loginLoading ? "Signing in..." : "Sign In →"}
        </Btn>
        {!showForgotPw && (
          <div style={{textAlign:"center",marginTop:8}}>
            <button onClick={()=>setShowForgotPw(true)} style={{background:"none",border:"none",fontSize:11,color:B.gray,cursor:"pointer",textDecoration:"underline"}}>
              Forgot your password?
            </button>
          </div>
        )}
        {showForgotPw && (
          <div style={{marginTop:12,background:B.light,borderRadius:8,padding:14}}>
            <div style={{fontSize:13,fontWeight:700,color:B.navy,marginBottom:8}}>Reset Your Password</div>
            <div style={{fontSize:12,color:B.gray,marginBottom:8,lineHeight:1.5}}>Enter the email address on your account. We will send you reset instructions within 24 hours.</div>
            <input value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} type="email" placeholder="Enter your email address"
              style={{width:"100%",border:`1.5px solid ${B.teal}`,borderRadius:6,padding:"9px 12px",fontSize:13,marginBottom:8,boxSizing:"border-box"}}/>
            <Btn onClick={handleForgotPassword} color={B.teal} full>Send Reset Request</Btn>
            {forgotMsg && (
              <div style={{fontSize:12,color:forgotMsg.includes("✅")?B.teal:B.orange,marginTop:8,lineHeight:1.5,padding:10,background:forgotMsg.includes("✅")?"#E8F7F7":"#FFF5F0",borderRadius:6,border:`1px solid ${forgotMsg.includes("✅")?B.teal:B.orange}`}}>
                {forgotMsg}
              </div>
            )}
            <button onClick={()=>{setShowForgotPw(false);setForgotMsg("");setForgotEmail("");}} style={{background:"none",border:"none",fontSize:11,color:B.gray,cursor:"pointer",textDecoration:"underline",marginTop:8,display:"block",width:"100%",textAlign:"center"}}>
              Back to Sign In
            </button>
          </div>
        )}

        {showDemo&&(
          <div style={{marginTop:16,background:B.light,borderRadius:10,padding:14}}>
            <div style={{fontSize:12,fontWeight:700,color:B.navy,marginBottom:6}}>🔑 Demo Access — Click any row to sign in</div>
            <div style={{fontSize:11,color:B.gray,marginBottom:10}}>For authorized previews and funder demonstrations only.</div>
            {[
              {label:"Super Admin (Chantell)",user:"superadmin",pw:"HE101admin!",color:B.red},
              {label:"Admin 2 (Antwan)",user:"admin2",pw:"HE101admin2!",color:B.red},
              {label:"ACH Case Manager",user:"ach_manager",pw:"ACH2024!",color:B.teal},
              {label:"YSS Case Manager",user:"yss_manager",pw:"YSS2026!",color:B.teal},
              {label:"Test Participant (Chantell)",user:"chantell_test",pw:"Test2026!",color:B.orange},
              {label:"User A — Complete ✅",user:"renter_a",pw:"Renter123!",color:B.green},
              {label:"User B — In Progress 🔄",user:"renter_b",pw:"Renter123!",color:B.orange},
              {label:"User C — Not Started ⭕",user:"renter_c",pw:"Renter123!",color:B.gray},
            ].map(c=>(
              <div key={c.user} onClick={()=>{setLoginId(c.user);setLoginPw(c.pw);setLoginErr("");setShowDemo(false);}}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #E8E8E8",cursor:"pointer"}}>
                <span style={{fontSize:13,color:c.color,fontWeight:700}}>{c.label}</span>
                <code style={{fontSize:11,color:B.gray,background:"#F0F0F0",padding:"2px 8px",borderRadius:4}}>{c.user}</code>
              </div>
            ))}
          </div>
        )}
        <div style={{marginTop:16,background:B.light,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:B.navy,marginBottom:8,textAlign:"center",letterSpacing:"0.06em"}}>ENROLLMENT OPTIONS</div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <div style={{flex:1,background:B.white,border:`1.5px solid ${B.orange}`,borderRadius:8,padding:"8px 6px",textAlign:"center",cursor:"pointer"}}
              onClick={()=>{showToast("Individual enrollment — $75. Contact housingetiquette101.org to enroll.");}}>
              <div style={{fontSize:10,color:B.gray,marginBottom:1}}>Individual</div>
              <div style={{fontSize:18,fontWeight:900,color:B.orange}}>$75</div>
              <div style={{fontSize:9,color:B.gray}}>per person</div>
              <div style={{fontSize:9,color:B.navy,marginTop:3,fontWeight:600}}>Self-enrollment</div>
            </div>
            <div style={{flex:1,background:B.white,border:`1.5px solid ${B.teal}`,borderRadius:8,padding:"8px 6px",textAlign:"center",cursor:"pointer"}}
              onClick={()=>{showToast("Agency enrollment — $100 per participant. Contact housingetiquette101.org to get started.");}}>
              <div style={{fontSize:10,color:B.gray,marginBottom:1}}>Agency</div>
              <div style={{fontSize:18,fontWeight:900,color:B.teal}}>$100</div>
              <div style={{fontSize:9,color:B.gray}}>per participant</div>
              <div style={{fontSize:9,color:B.navy,marginTop:3,fontWeight:600}}>Billed to agency</div>
            </div>
            <div style={{flex:1,background:B.white,border:`1.5px solid #B8960C`,borderRadius:8,padding:"8px 6px",textAlign:"center",cursor:"pointer"}}
              onClick={()=>setShowSponsorForm(true)}>
              <div style={{fontSize:10,color:B.gray,marginBottom:1}}>Sponsorship</div>
              <div style={{fontSize:18,fontWeight:900,color:"#B8960C"}}>{20 - sponsorRequests.filter(r=>r.status==="approved").length}</div>
              <div style={{fontSize:9,color:B.gray}}>spots available</div>
              <div style={{fontSize:9,color:B.navy,marginTop:3,fontWeight:600}}>Agency referred</div>
            </div>
          </div>
          <div style={{fontSize:9,color:B.gray,textAlign:"center"}}>Questions? housingetiquette101.org</div>
        </div>

        {/* SPONSORSHIP APPLICATION POPUP */}
        {showSponsorForm&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"white",borderRadius:16,maxWidth:480,width:"100%",maxHeight:"85vh",overflow:"auto",padding:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:16,fontWeight:700,color:B.navy}}>🎯 Sponsored Enrollment Application</div>
                <button onClick={()=>setShowSponsorForm(false)} style={{background:"#F0F0F0",border:"none",borderRadius:99,width:30,height:30,cursor:"pointer",fontSize:14}}>✕</button>
              </div>
              <div style={{fontSize:11,color:B.gray,marginBottom:14,lineHeight:1.6,background:"#FFF5F0",padding:"8px 12px",borderRadius:6,borderLeft:`3px solid ${B.orange}`}}>
                <strong>Agency referral required.</strong> You must have been referred by a registered HE101 partner agency and have a referral code from your case manager. Applications without a valid agency referral code cannot be processed.
              </div>
              {/* Full Name */}
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Full Name *</div>
                <input value={sponsorForm.name||""} onChange={e=>setSponsorForm(p=>({...p,name:e.target.value}))}
                  placeholder="Your full legal name"
                  style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Email Address *</div>
                <input value={sponsorForm.email||""} onChange={e=>setSponsorForm(p=>({...p,email:e.target.value}))}
                  type="email" placeholder="Your email address"
                  style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Phone Number</div>
                <input value={sponsorForm.phone||""} onChange={e=>setSponsorForm(p=>({...p,phone:e.target.value}))}
                  placeholder="Best number to reach you"
                  style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Agency Referral Code *</div>
                <input value={sponsorForm.agency||""} 
                  onChange={e=>{setSponsorForm(p=>({...p,agency:e.target.value}));setSponsorCodeError("");}}
                  placeholder="Given to you by your case manager e.g. ACH001"
                  style={{width:"100%",border:`1.5px solid ${sponsorCodeError?"#CC0000":"#E0E0E0"}`,borderRadius:6,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
                {sponsorCodeError&&(
                  <div style={{fontSize:11,color:"#CC0000",marginTop:4,padding:"8px 10px",background:"#FFF0F0",borderRadius:4,border:"1px solid #CC0000",fontWeight:600}}>
                    ❌ {sponsorCodeError}
                  </div>
                )}
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Referring Case Manager Name</div>
                <input value={sponsorForm.referredBy||""} onChange={e=>setSponsorForm(p=>({...p,referredBy:e.target.value}))}
                  placeholder="Name of your case manager"
                  style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:600,color:B.gray,marginBottom:3}}>Brief reason for applying *</div>
                <textarea value={sponsorForm.reason||""} onChange={e=>setSponsorForm(p=>({...p,reason:e.target.value}))}
                  placeholder="Briefly describe your housing situation and why you are applying..." rows={3}
                  style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"8px 10px",fontSize:12,resize:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{fontSize:10,color:B.gray,marginBottom:12,lineHeight:1.5}}>
                By submitting this application you confirm you have been referred by a registered HE101 agency partner. All applications are reviewed by HE101 administration. You will be contacted within 2 business days.
              </div>
              <button onClick={handleSponsorSubmit} style={{background:B.orange,color:"white",border:"none",borderRadius:6,padding:"11px 24px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
                Submit Application
              </button>
            </div>
          </div>
        )}
        <div style={{textAlign:"center",marginTop:10}}>
          <button onClick={()=>setShowDemo(p=>!p)} style={{background:"none",border:"none",fontSize:11,color:B.gray,cursor:"pointer",textDecoration:"underline"}}>
            {showDemo?"Hide demo access":"Request demo access"}
          </button>
        </div>
              </div>
      </div>
    </div>
  );

  // ── RENTER PORTAL ──────────────────────────────────────────────────────────
  if(screen==="renter"&&cu?.role==="renter"){
    const u=users[cu.id]; const pct=getPct(u); const {earned,possible}=getScore(u);

    const Modal = ({title, onClose, children}) => (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:"white",borderRadius:16,maxWidth:600,width:"100%",maxHeight:"85vh",overflow:"auto",padding:28}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:700,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>{title}</div>
            <button onClick={onClose} style={{background:"#F0F0F0",border:"none",borderRadius:99,width:32,height:32,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
          {children}
        </div>
      </div>
    );

    return(
      <div style={{minHeight:"100vh",background:B.light,fontFamily:"Montserrat,sans-serif"}}>
        {certUser&&<Certificate user={certUser} onClose={()=>setCertUser(null)}/>}
        {openMod!==null&&<ModuleDetail mod={MODULES[openMod]} userMod={u.modules?.[openMod+1]} onComplete={(modId,data)=>completeModule(u.id,modId,data)} onClose={()=>setOpenMod(null)}/>}
        {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:B.green,color:B.white,padding:"10px 24px",borderRadius:99,fontWeight:700,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>{toast}</div>}

        {/* TERMS OF SERVICE MODAL */}
        {showTOS&&(
          <Modal title="Terms of Service" onClose={()=>setShowTOS(false)}>
            <div style={{fontSize:12,color:B.gray,marginBottom:8}}>Effective Date: January 1, 2026 · ACH Management & Services LLC</div>
            {[
              ["1. Acceptance of Terms","By accessing or using Housing Etiquette 101 (HE101) you agree to be bound by these Terms of Service. If you do not agree to these terms you may not use the platform."],
              ["2. Program Purpose","Housing Etiquette 101 is a structured, prevention-based digital housing education platform that prepares renters for successful tenancy by addressing the behavioral root causes of lease violations and housing instability. Through 8 interactive modules covering lease compliance, income reporting, communication, and eviction prevention, HE101 equips participants with the knowledge and accountability skills needed to obtain and maintain stable housing — while providing agencies, case managers, and housing authorities with real-time progress tracking, completion certificates, and funder-ready outcome reporting. HE101 is an educational tool and does not constitute legal, financial, or housing counseling advice."],
              ["3. User Responsibilities","You agree to provide accurate information during enrollment, complete modules honestly, and use the platform only for its intended educational purpose. Sharing login credentials is prohibited."],
              ["4. Agency Responsibilities","Agencies using HE101 agree to enroll only appropriate participants, maintain accurate participant records, pay invoices within 30 days of issue, and comply with all applicable housing laws and participant privacy requirements."],
              ["5. Privacy and Data","We collect participant progress data, quiz scores, and completion records to support program delivery and outcome reporting. See our Privacy Policy for complete details."],
              ["6. Certificates","Certificates of completion are issued upon successful completion of all 8 modules. HE101 certificates are educational credentials and do not guarantee housing placement or waive any lease obligations."],
              ["7. HUD Alignment","HE101 curriculum is designed to align with HUD housing counseling standards and covers topics consistent with HUD-approved housing education. HE101 is not yet a HUD-approved housing counseling agency and does not provide HUD-funded counseling services unless delivered under a HUD-approved partner agency."],
              ["8. Limitation of Liability","ACH Management & Services LLC is not liable for housing outcomes, lease decisions, or actions taken by landlords or housing authorities based on program participation."],
              ["9. Contact","For questions about these terms contact us at housingetiquette101.org"],
            ].map(([title, text])=>(
              <div key={title} style={{marginBottom:14}}>
                <div style={{fontWeight:700,color:B.navy,fontSize:13,marginBottom:4}}>{title}</div>
                <div style={{fontSize:12,color:"#444",lineHeight:1.7}}>{text}</div>
              </div>
            ))}
          </Modal>
        )}

        {/* PRIVACY POLICY MODAL */}
        {showPrivacy&&(
          <Modal title="Privacy Policy" onClose={()=>setShowPrivacy(false)}>
            <div style={{fontSize:12,color:B.gray,marginBottom:8}}>Effective Date: January 1, 2026 · ACH Management & Services LLC</div>
            {[
              ["Information We Collect","We collect name, email address, phone number, agency affiliation, module progress, quiz scores, completion dates, and housing outcome data provided by participants and agencies."],
              ["How We Use Your Information","Your information is used to track program progress, generate certificates of completion, produce agency and funder reports, and improve program delivery. We do not sell your personal information."],
              ["Who Sees Your Data","Your assigned agency can view your progress and completion status. HE101 administrators can view all participant data across the platform. Aggregate de-identified data may be shared with funders for reporting purposes."],
              ["Data Security","We use Supabase encrypted database storage with row-level security. All data is stored securely and access is restricted to authorized users only."],
              ["HUD Compliance","Data collection and usage is consistent with HUD housing counseling data standards. Participant data may be used to support HUD outcome reporting when delivered through a HUD-approved partner agency."],
              ["Data Retention","Participant records are retained for 7 years following program completion to support housing outcome tracking and funder reporting requirements."],
              ["Your Rights","You may request access to your data, correction of inaccurate information, or deletion of your account by contacting housingetiquette101.org."],
              ["Contact","For privacy questions contact us at housingetiquette101.org"],
            ].map(([title, text])=>(
              <div key={title} style={{marginBottom:14}}>
                <div style={{fontWeight:700,color:B.navy,fontSize:13,marginBottom:4}}>{title}</div>
                <div style={{fontSize:12,color:"#444",lineHeight:1.7}}>{text}</div>
              </div>
            ))}
          </Modal>
        )}

        {/* CONTACT MODAL */}
        {showContact&&(
          <Modal title="Contact Housing Etiquette 101" onClose={()=>setShowContact(false)}>
            <div style={{fontSize:13,color:B.gray,marginBottom:16,lineHeight:1.6}}>Have a question? Need help with the platform? Interested in a partnership? We respond within 1 business day.</div>
            {[
              {label:"Your Name *",field:"name",ph:"Full name"},
              {label:"Email Address *",field:"email",ph:"your@email.com"},
              {label:"Phone Number",field:"phone",ph:"Optional"},
              {label:"Organization",field:"org",ph:"Agency or company name if applicable"},
            ].map(f=>(
              <div key={f.field} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                <input value={contactForm[f.field]} onChange={e=>setContactForm(p=>({...p,[f.field]:e.target.value}))}
                  placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>Message *</div>
              <textarea value={contactForm.message} onChange={e=>setContactForm(p=>({...p,message:e.target.value}))}
                placeholder="How can we help you?" rows={4} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,resize:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={submitContact} style={{background:B.teal,color:"white",border:"none",borderRadius:6,padding:"11px 24px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
              Send Message
            </button>
            <div style={{textAlign:"center",marginTop:12,fontSize:12,color:B.gray}}>
              Or email us directly at <strong>housingetiquette101.org</strong>
            </div>
          </Modal>
        )}

        <div style={{background:B.navy,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {LOGO_B64 && <img src={LOGO_B64} alt="HE101" style={{width:44,height:"auto",borderRadius:4}} />}
            <div><div style={{color:B.white,fontWeight:700,fontSize:15,fontFamily:"Playfair Display,Georgia,serif"}}>Housing Etiquette 101</div><div style={{color:"#78909C",fontSize:11}}>{AGENCIES.find(a=>a.id===u.agency)?.name}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{color:B.white,fontSize:13,textAlign:"right"}}><div style={{fontWeight:700}}>{u.name}</div><div style={{color:"#78909C",fontSize:11}}>Participant</div></div>
            <Btn onClick={logout} outline color="#78909C" small>Logout</Btn>
          </div>
        </div>

        <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
          <div style={{background:`linear-gradient(135deg,${B.navy},${B.teal})`,borderRadius:16,padding:24,color:B.white,marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><div style={{fontSize:12,opacity:0.7,marginBottom:2}}>Welcome back,</div><div style={{fontSize:22,fontWeight:700,fontFamily:"Playfair Display,Georgia,serif"}}>{u.name}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:36,fontWeight:900,color:B.gold}}>{pct}%</div><div style={{fontSize:11,opacity:0.7}}>Complete</div></div>
            </div>
            <Bar pct={pct} color={B.gold} h={10}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:12,opacity:0.8}}>
              <span>{Object.values(u.modules||{}).filter(m=>m.status==="complete").length}/8 modules done</span>
              <span>{possible>0?`Score: ${earned}/${possible}`:"No quizzes yet"}</span>
              <span>{getTime(u)} min total</span>
            </div>
          </div>

          {pct===100&&u.certIssued&&(
            <Card style={{background:"linear-gradient(135deg,#FFF8E1,#FFFDE7)",border:`2px solid ${B.gold}`,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:6}}>🏆</div>
              <div style={{fontWeight:700,color:B.navy,fontSize:17,marginBottom:4}}>You're Certified!</div>
              <div style={{color:B.gray,fontSize:12,marginBottom:12}}>Cert ID: {u.certId} · Issued: {u.certDate}</div>
              <Btn onClick={()=>setCertUser(u)} color={B.gold} style={{color:B.navy}}>🏆 View & Print Certificate</Btn>
            </Card>
          )}


          {/* DEADLINE & MOVE-IN STATUS BANNER */}
          {(()=>{
            try {
            const ds = getDeadlineStatus(u) || {label:"In Progress",color:B.gray,urgent:false};
            const ms = getMoveInStatus(u);
            const dsColor = ds?.color || B.gray;
            const dsLabel = ds?.label || "In Progress";
            const dsUrgent = ds?.urgent || false;
            return(
              <div style={{marginBottom:16}}>
                {/* 30-day deadline tracker */}
                <div style={{background:dsUrgent?"#FFF3E0":B.white,borderRadius:12,padding:16,border:`2px solid ${dsColor}33`,marginBottom:ms?10:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:14,color:B.navy,fontFamily:"Montserrat,sans-serif"}}>⏱️ Program Deadline</div>
                    <span style={{background:dsColor+"18",color:dsColor,border:`1px solid ${dsColor}33`,borderRadius:99,padding:"3px 12px",fontSize:12,fontWeight:700}}>{dsLabel}</span>
                  </div>
                  <div style={{fontSize:12,color:B.gray,fontFamily:"Montserrat,sans-serif",marginBottom:8}}>
                    Enrolled: {u.enrollDate} · Due: {getDeadline(u)} · {PROGRAM_DAYS}-day program
                  </div>
                  {getPct(u)<100&&(
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:B.gray,marginBottom:4}}>
                        <span>Progress toward deadline</span>
                        <span style={{fontWeight:700,color:dsColor}}>{getPct(u)}% complete</span>
                      </div>
                      <div style={{background:"#E0E0E0",borderRadius:99,height:8}}>
                        <div style={{width:`${getPct(u)}%`,height:"100%",background:dsColor,borderRadius:99,transition:"width 0.5s"}}/>
                      </div>
                      {dsUrgent&&<div style={{fontSize:11,color:dsColor,fontWeight:700,marginTop:6,fontFamily:"Montserrat,sans-serif"}}>
                        ⚡ Action required. contact your case manager if you need help completing the program.
                      </div>}
                    </div>
                  )}
                </div>
                {/* Move-in clearance status */}
                {ms&&(
                  <div style={{background:isClearedForMoveIn(u)?"#E8F5E9":"#FFF3E0",borderRadius:12,padding:16,border:`2px solid ${ms.color}33`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:B.navy,fontFamily:"Montserrat,sans-serif"}}>🏠 Move-In Clearance</div>
                        <div style={{fontSize:12,color:B.gray,marginTop:2,fontFamily:"Montserrat,sans-serif"}}>
                          {isClearedForMoveIn(u)
                            ?"You have completed all requirements and are cleared for housing placement."
                            :"Complete all 8 modules to receive your Move-In Clearance Certificate."}
                        </div>
                      </div>
                      <span style={{background:ms.color+"18",color:ms.color,border:`1px solid ${ms.color}33`,borderRadius:99,padding:"3px 12px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",marginLeft:10}}>{ms.label}</span>
                    </div>
                    {isClearedForMoveIn(u)&&(
                      <div style={{marginTop:10,background:B.white,borderRadius:8,padding:"10px 14px",border:`1px solid ${B.green}33`}}>
                        <div style={{fontSize:12,color:B.green,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>🎉 CLEARED FOR HOUSING PLACEMENT</div>
                        <div style={{fontSize:11,color:B.gray,marginTop:2}}>Cert ID: {u.certId} · Date: {u.certDate}</div>
                        <div style={{fontSize:11,color:B.gray}}>Present this certificate to your case manager or housing provider.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            } catch(e) {
              return <div style={{background:B.light,borderRadius:12,padding:16,marginBottom:16,fontSize:13,color:B.gray}}>⏱️ Loading your progress...</div>;
            }
          })()}
          <div style={{fontWeight:700,color:B.navy,marginBottom:12,fontSize:16,fontFamily:"Playfair Display,Georgia,serif"}}>Your 8 Modules</div>
          {MODULES.map((mod,i)=>{
            const m=u.modules?.[mod.id]; const s=m?.status||"not_started";
            return(
              <div key={i} onClick={()=>setOpenMod(i)} style={{background:B.white,borderRadius:12,padding:16,marginBottom:10,borderLeft:`4px solid ${s==="complete"?B.green:s==="in_progress"?B.orange:"#E0E0E0"}`,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:48,height:48,borderRadius:10,background:mod.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>{mod.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:B.navy}}>Module {mod.id}: {mod.title}</div>
                  {s==="complete"&&<div style={{fontSize:11,color:B.green,marginTop:2}}>✅ Quiz Score: {m.score!==null?`${m.score}/10`:"Completed via Google Form"} · {m.time} min · {m.date}</div>}
                  {s==="in_progress"&&<div style={{fontSize:11,color:B.orange,marginTop:2}}>🔄 In Progress · {m.time} min spent</div>}
                  {s==="not_started"&&<div style={{fontSize:11,color:B.gray,marginTop:2}}>⭕ Not started. tap to begin</div>}
                </div>
                <Pill label={s==="complete"?"✅ Done":s==="in_progress"?"🔄 Continue":"Start →"} color={s==="complete"?B.green:s==="in_progress"?B.orange:B.teal}/>
              </div>
            );
          })}
        </div>

        {/* INTAKE FORM MODAL */}
        {showIntakeForm&&(
          <Modal title="📋 Participant Intake Form" onClose={()=>setShowIntakeForm(false)}>
            <div style={{fontSize:13,color:B.gray,marginBottom:16,lineHeight:1.6}}>Please complete this form before starting the program. This helps us personalize your experience and connect you with the right resources.</div>
            {[
              {label:"Full Legal Name *",field:"name",ph:"As it appears on your ID"},
              {label:"Email Address *",field:"email",ph:"Your best email address"},
              {label:"Phone Number",field:"phone",ph:"Best number to reach you"},
              {label:"Date of Birth",field:"dob",ph:"MM/DD/YYYY"},
              {label:"Referring Agency",field:"agency",ph:"Name of agency that referred you"},
              {label:"Who referred you?",field:"referredBy",ph:"Case manager or staff name"},
            ].map(f=>(
              <div key={f.field} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                <input value={intakeForm[f.field]} onChange={e=>setIntakeForm(p=>({...p,[f.field]:e.target.value}))}
                  placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>Current Housing Situation</div>
              <select value={intakeForm.currentSituation} onChange={e=>setIntakeForm(p=>({...p,currentSituation:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13}}>
                <option value="">Select your current situation...</option>
                <option value="housed_stable">Currently housed and stable</option>
                <option value="housed_at_risk">Currently housed but at risk of eviction</option>
                <option value="transitional">In transitional or temporary housing</option>
                <option value="shelter">In emergency shelter</option>
                <option value="recently_housed">Recently housed through a program</option>
                <option value="seeking_housing">Currently seeking housing</option>
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>What is your main housing goal?</div>
              <textarea value={intakeForm.housingGoal} onChange={e=>setIntakeForm(p=>({...p,housingGoal:e.target.value}))}
                placeholder="Briefly describe what you hope to achieve through this program..." rows={3}
                style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,resize:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={submitIntake} style={{background:B.teal,color:"white",border:"none",borderRadius:6,padding:"11px 24px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
              Submit Intake Form
            </button>
          </Modal>
        )}
        <div style={{background:B.navy,padding:"16px 20px",marginTop:20,textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",gap:20,marginBottom:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowIntakeForm(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:12,cursor:"pointer"}}>📋 Participant Intake Form</button>
            <button onClick={()=>setShowContact(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:12,cursor:"pointer"}}>📬 Contact Us</button>
            <button onClick={()=>setShowTOS(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:12,cursor:"pointer"}}>📄 Terms of Service</button>
            <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:12,cursor:"pointer"}}>🔒 Privacy Policy</button>
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>© 2026 ACH Management & Services LLC · housingetiquette101.org · Educate · Protect · Sustain</div>
        </div>
      </div>
    );
  }

  // ── ADMIN / AGENCY DASHBOARD ───────────────────────────────────────────────
  const isSuper=cu?.role==="superadmin";
  const tabs=isSuper?["overview","participants","agencies","add-agency","reports","sponsorship","credentials"]:["overview","participants","reports"];

  return(
    <div style={{minHeight:"100vh",background:B.light,fontFamily:"Montserrat,sans-serif",display:"flex"}}>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:B.green,color:B.white,padding:"10px 24px",borderRadius:99,fontWeight:700,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>{toast}</div>}
      {certUser&&<Certificate user={certUser} onClose={()=>setCertUser(null)}/>}

      {/* Sidebar */}
      <div style={{width:210,background:B.navy,color:B.white,padding:"20px 0",display:"flex",flexDirection:"column",flexShrink:0,minHeight:"100vh"}}>
        <div style={{padding:"0 18px 18px",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:16,fontWeight:700,fontFamily:"Playfair Display,Georgia,serif"}}>HE101 Platform</div>
          <div style={{fontSize:10,color:"#78909C",marginTop:2}}>Notifications sync automatically</div>
          <div style={{fontSize:10,color:"#78909C",marginTop:2}}>{isSuper?"Super Admin · HE101":"Agency Manager · HE101"}</div>
        </div>
        <div style={{flex:1,padding:"14px 0"}}>
          {tabs.map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)} style={{display:"block",width:"100%",textAlign:"left",padding:"10px 18px",background:activeTab===t?"rgba(244,120,32,0.2)":"transparent",borderLeft:activeTab===t?`3px solid ${B.orange}`:"3px solid transparent",color:activeTab===t?B.orange:"#90A4AE",border:"none",cursor:"pointer",fontSize:12,fontWeight:activeTab===t?700:400,fontFamily:"Montserrat,sans-serif"}}>
              {t==="overview"?"📊 Overview":t==="participants"?"👥 Participants":t==="agencies"?"🏢 Agencies":t==="add-agency"?"➕ Add Agency":t==="reports"?"📥 Reports":t==="sponsorship"?"🎯 Sponsorship":"🔑 Credentials"}
            </button>
          ))}
        </div>
        <div style={{padding:"14px 18px",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:12,color:B.white,fontWeight:700}}>{cu?.name}</div>
          <div style={{fontSize:10,color:"#78909C",marginBottom:8}}>{isSuper?"Super Admin":AGENCIES.find(a=>a.id===cu?.agency)?.name}</div>
          <Btn onClick={logout} outline color="#78909C" small style={{width:"100%"}}>Logout</Btn>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{padding:"24px 28px"}} className="he101-admin-content">

          {/* OVERVIEW */}
          {activeTab==="overview"&&(
            <div>
              <h1 style={{margin:"0 0 4px",fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>Dashboard Overview</h1>
              <div style={{color:B.gray,fontSize:13,marginBottom:20}}>{isSuper?"All agencies":"Your participants"} · Housing Etiquette 101</div>


              {/* ALERTS. Urgent participants */}
              {(()=>{
                const urgent = visible.filter(u=>{
                  const ds=getDeadlineStatus(u);
                  return ds.urgent && getPct(u)<100;
                });
                if(urgent.length===0) return null;
                return(
                  <div style={{background:"#FFF3E0",borderRadius:12,padding:18,marginBottom:20,border:"2px solid #CC550033"}}>
                    <div style={{fontWeight:700,color:"#CC5500",fontSize:15,marginBottom:12,fontFamily:"Playfair Display,Georgia,serif"}}>
                      ⚡ Action Required. {urgent.length} Participant{urgent.length>1?"s":""} Behind Schedule
                    </div>
                    {urgent.map(u=>{
                      const ds=getDeadlineStatus(u);
                      const ms=getMoveInStatus(u);
                      return(
                        <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #FFE0B2"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,color:B.navy}}>{u.name}</div>
                            <div style={{fontSize:11,color:B.gray}}>{AGENCIES.find(a=>a.id===u.agency)?.name} · {getPct(u)}% complete</div>
                            {ms&&<div style={{fontSize:11,color:"#CC5500",fontWeight:700}}>{ms.label}</div>}
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <span style={{background:"#CC550018",color:"#CC5500",border:"1px solid #CC550033",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700}}>{ds.label}</span>
                            <Btn onClick={()=>setSelUser(u.id)} color={"#CC5500"} small>View</Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {isSuper&&(
                <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
                  {["all",...AGENCIES.map(a=>a.id)].map(id=>(
                    <button key={id} onClick={()=>setAgFilt(id)} style={{background:agFilt===id?B.teal:B.white,color:agFilt===id?B.white:B.navy,border:`2px solid ${agFilt===id?B.teal:"#E0E0E0"}`,borderRadius:99,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      {id==="all"?"All Agencies":AGENCIES.find(a=>a.id===id)?.name.split(" ")[0]}
                    </button>
                  ))}
                  <button onClick={()=>setShowAddParticipant(p=>!p)} style={{background:B.orange,color:"white",border:"none",borderRadius:99,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
                    + Add Participant
                  </button>
                </div>
              )}
              {!isSuper&&(
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
                  <button onClick={()=>setShowAddParticipant(p=>!p)} style={{background:B.teal,color:"white",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    + Add My Client
                  </button>
                </div>
              )}
              {showAddParticipant&&(
                <Card style={{marginBottom:20,border:`2px solid ${B.teal}`}}>
                  <div style={{fontWeight:700,color:B.teal,fontSize:15,marginBottom:14}}>Add New Participant</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                    {[
                      {label:"Full Name *",field:"name",ph:"Participant full name"},
                      {label:"Email Address *",field:"email",ph:"participant@email.com"},
                      {label:"Username *",field:"username",ph:"e.g. firstname_lastname"},
                      {label:"Temporary Password *",field:"password",ph:"Create a temporary password"},
                    ].map(f=>(
                      <div key={f.field}>
                        <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                        <input value={newParticipant[f.field]} onChange={e=>setNewParticipant(p=>({...p,[f.field]:e.target.value}))}
                          placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
                      </div>
                    ))}
                  </div>
                  {isSuper&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>Assign to Agency *</div>
                      <select value={newParticipant.agency} onChange={e=>setNewParticipant(p=>({...p,agency:e.target.value}))}
                        style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13}}>
                        {AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{
                      if(!isSuper) setNewParticipant(p=>({...p,agency:cu.agency}));
                      addParticipant();
                    }} style={{background:B.teal,color:B.white,border:"none",borderRadius:6,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Save Participant</button>
                    <button onClick={()=>setShowAddParticipant(false)} style={{background:"#F0F0F0",color:B.gray,border:"none",borderRadius:6,padding:"10px 20px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </Card>
              )}

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:24}}>
                {[{label:"Total Participants",val:visible.length,color:B.teal,icon:"👥"},{label:"Completed All 8",val:totalDone,color:B.green,icon:"✅"},{label:"In Progress",val:visible.filter(u=>{const p=getPct(u);return p>0&&p<100;}).length,color:B.orange,icon:"🔄"},{label:"Not Started",val:visible.filter(u=>getPct(u)===0).length,color:B.gray,icon:"⭕"},{label:"Avg Completion",val:`${avgPct}%`,color:B.navy,icon:"📊"}].map(k=>(
                  <Card key={k.label} style={{textAlign:"center",borderTop:`4px solid ${k.color}`,padding:16}}>
                    <div style={{fontSize:24,marginBottom:4}}>{k.icon}</div>
                    <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
                    <div style={{fontSize:10,color:B.gray,marginTop:2}}>{k.label}</div>
                  </Card>
                ))}
              </div>

              <Card>
                <div style={{fontWeight:700,color:B.navy,marginBottom:14,fontSize:14}}>📈 Module Completion Rates</div>
                {MODULES.map((mod,i)=>{
                  const done=visible.filter(u=>u.modules?.[mod.id]?.status==="complete").length;
                  const pct=visible.length>0?Math.round((done/visible.length)*100):0;
                  return(
                    <div key={i} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                        <span style={{color:B.navy}}>{mod.emoji} M{mod.id}: {mod.title.split(",")[0].split("&")[0].trim()}</span>
                        <span style={{color:B.teal,fontWeight:700}}>{done}/{visible.length} ({pct}%)</span>
                      </div>
                      <Bar pct={pct} color={pct===100?B.green:pct>50?B.teal:B.orange}/>
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {/* PARTICIPANTS */}
          {activeTab==="participants"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <h1 style={{margin:0,fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>Participants</h1>
                <Btn onClick={()=>exportCSV(users,cu?.role==="agency"?cu.agency:agFilt!=="all"?agFilt:null)} color={B.teal}>📥 Export CSV</Btn>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                {[{name:"Jordan Davis",label:"User A. Complete",pct:100,color:B.green},{name:"Priscilla Monroe",label:"User B. In Progress",pct:50,color:B.orange},{name:"Devon Carter",label:"User C. Not Started",pct:0,color:B.gray}].map(u=>(
                  <Card key={u.name} style={{borderTop:`4px solid ${u.color}`,textAlign:"center",padding:14}}>
                    <div style={{fontWeight:700,color:B.navy,fontSize:13}}>{u.name}</div>
                    <div style={{fontSize:22,fontWeight:900,color:u.color,margin:"4px 0"}}>{u.pct}%</div>
                    <div style={{fontSize:10,color:B.gray}}>{u.label}</div>
                  </Card>
                ))}
              </div>

              <Card style={{padding:0,overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
                    <thead><tr style={{background:B.navy}}>{["Participant","Agency","Deadline","Completion","Score","Move-In Status","Certificate","Actions"].map(h=><th key={h} style={{padding:"10px 12px",color:B.white,fontSize:11,fontWeight:700,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {visible.map((u,i)=>{
                        const pct=getPct(u); const {earned,possible}=getScore(u); const ag=AGENCIES.find(a=>a.id===u.agency);
                        return(
                          <tr key={u.id} style={{background:i%2===0?B.white:"#F8F9FA",borderBottom:"1px solid #F0F0F0"}}>
                            <td style={{padding:"12px 12px"}}><div style={{fontWeight:700,fontSize:13,color:B.navy}}>{u.name}</div><div style={{fontSize:11,color:B.gray}}>{u.email}</div></td>
                            <td style={{padding:"12px 12px",fontSize:12,color:B.gray}}>{ag?.name.split(" ")[0]}</td>
                            <td style={{padding:"12px 12px"}}>
                              {(()=>{const ds=getDeadlineStatus(u);return(
                                <div>
                                  <div style={{fontSize:11,fontWeight:700,color:ds.color}}>{ds.label}</div>
                                  <div style={{fontSize:10,color:B.gray}}>Due: {getDeadline(u)||"—"}</div>
                                </div>
                              );})()}
                            </td>
                            <td style={{padding:"12px 12px",minWidth:110}}>
                              <div style={{fontSize:13,fontWeight:700,color:sColor(pct)}}>{pct}%</div>
                              <Bar pct={pct} color={sColor(pct)} h={5}/>
                            </td>
                            <td style={{padding:"12px 12px",fontSize:13,color:B.navy}}>{possible>0?`${earned}/${possible}`:"—"}</td>
                            <td style={{padding:"12px 12px"}}>
                              {u.requiresMoveInClearance?(
                                <span style={{background:isClearedForMoveIn(u)?B.green+"18":"#FFF3E0",color:isClearedForMoveIn(u)?B.green:"#CC5500",border:`1px solid ${isClearedForMoveIn(u)?B.green:"#CC5500"}33`,borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
                                  {isClearedForMoveIn(u)?"✅ Cleared":"🔒 Pending"}
                                </span>
                              ):<span style={{fontSize:11,color:B.gray}}>—</span>}
                            </td>
                            <td style={{padding:"12px 12px"}}>
                              {u.certIssued?<button onClick={()=>setCertUser(u)} style={{background:B.gold+"20",color:B.navy,border:`1px solid ${B.gold}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🏆 View</button>:<span style={{fontSize:11,color:B.gray}}>—</span>}
                            </td>
                            <td style={{padding:"12px 12px"}}>
                              <Btn onClick={()=>setSelUser(u.id)} color={B.teal} small>View</Btn>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {selUser&&(()=>{
                const u=users[selUser];
                return(
                  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,overflowY:"auto",padding:16}}>
                    <div style={{background:B.light,borderRadius:16,maxWidth:560,margin:"0 auto",padding:24}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
                        <div><div style={{fontSize:20,fontWeight:700,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>{u.name}</div><div style={{fontSize:12,color:B.gray}}>{u.email}</div></div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {isSuper&&<button onClick={()=>{setSelUser(null);deleteParticipant(u.id);}} style={{background:"#FFF0F0",color:"#CC0000",border:"1px solid #CC0000",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>🗑 Delete</button>}
                          <button onClick={()=>setSelUser(null)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:B.gray}}>✕</button>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
                        {[{label:"Completion",val:`${getPct(u)}%`,color:sColor(getPct(u))},{label:"Modules",val:`${Object.values(u.modules||{}).filter(m=>m.status==="complete").length}/8`},{label:"Score",val:getScore(u).possible>0?`${getScore(u).earned}/${getScore(u).possible}`:"N/A"},{label:"Time",val:`${getTime(u)}m`}].map(s=>(
                          <div key={s.label} style={{background:B.white,borderRadius:8,padding:"10px 6px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                            <div style={{fontSize:18,fontWeight:700,color:s.color||B.teal}}>{s.val}</div>
                            <div style={{fontSize:10,color:B.gray,marginTop:2}}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <Card>
                        <div style={{fontWeight:700,color:B.navy,marginBottom:10,fontSize:13}}>Module Progress</div>
                        {MODULES.map((mod,i)=>{
                          const m=u.modules?.[mod.id]; const s=m?.status||"not_started";
                          return<div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <span style={{fontSize:12}}>{s==="complete"?"✅":s==="in_progress"?"🔄":"⭕"}</span>
                            <div style={{flex:1,fontSize:12,color:B.navy}}>M{mod.id}: {mod.title.split(" ").slice(0,4).join(" ")}…</div>
                            {(s==="complete"||s==="in_progress")&&m?.score!=null&&<Pill label={`${m.score}/${m.total||5}`} color={s==="complete"?B.green:B.orange}/>}
                          </div>;
                        })}
                      </Card>
                      <Card>
                        <div style={{fontWeight:700,color:B.navy,marginBottom:10,fontSize:13}}>🏠 Move-In Clearance & Deadline</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:B.navy}}>Pre-Move-In Required</div>
                            <div style={{fontSize:11,color:B.gray}}>Must complete all 8 modules before housing placement</div>
                          </div>
                          <div style={{background:u.requiresMoveInClearance?B.teal:"#E0E0E0",borderRadius:99,padding:"4px 14px",fontSize:12,fontWeight:700,color:u.requiresMoveInClearance?B.white:B.gray,cursor:"pointer"}}
                            onClick={()=>setUsers(prev=>({...prev,[u.id]:{...prev[u.id],requiresMoveInClearance:!prev[u.id].requiresMoveInClearance}}))}>
                            {u.requiresMoveInClearance?"ON":"OFF"}
                          </div>
                        </div>
                        <div style={{background:isClearedForMoveIn(u)?"#E8F5E9":"#FFF3E0",borderRadius:8,padding:"10px 14px",marginBottom:10}}>
                          <div style={{fontSize:12,fontWeight:700,color:isClearedForMoveIn(u)?B.green:"#CC5500"}}>
                            {isClearedForMoveIn(u)?"✅ CLEARED FOR HOUSING PLACEMENT":"🔒 NOT YET CLEARED. Training incomplete"}
                          </div>
                          {(()=>{const ds=getDeadlineStatus(u);return<div style={{fontSize:11,color:ds.color,marginTop:4,fontWeight:700}}>{ds.label} · Due: {getDeadline(u)}</div>})()}
                        </div>
                      </Card>
                      <Card>
                        <div style={{fontWeight:700,color:B.navy,marginBottom:10,fontSize:13}}>🏠 Outcome Tracking</div>
                        <div style={{fontSize:13,color:B.navy}}>{u.outcomes?.stillHoused?"🏠 Still Housed":"❓ Status Unknown"}</div>
                        <div style={{fontSize:13,color:u.outcomes?.violations>0?B.red:B.green,marginTop:4}}>{u.outcomes?.violations>0?`⚠️ ${u.outcomes.violations} Violation(s)`:"✅ No Violations"}</div>
                        <div style={{fontSize:13,color:B.gray,marginTop:4}}>Payment: {u.outcomes?.payment||"Unknown"}</div>
                      </Card>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                        {u.certIssued&&<Btn onClick={()=>{setCertUser(u);setSelUser(null);}} color={B.gold} small style={{color:B.navy}}>🏆 Certificate</Btn>}
                        <Btn onClick={()=>exportCSV({[u.id]:u},null)} outline color={B.teal} small>📥 Export</Btn>
                        <Btn onClick={()=>setSelUser(null)} outline color={B.gray} small>Close</Btn>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* AGENCIES */}
          {activeTab==="agencies"&&isSuper&&(
            <div>
              <h1 style={{margin:"0 0 20px",fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>Agency Management</h1>
              {liveAgencies.map(ag=>{
                const r=renters(ag.id); const done=r.filter(u=>getPct(u)===100).length; const avg=r.length>0?Math.round(r.reduce((a,u)=>a+getPct(u),0)/r.length):0;
                return(
                  <Card key={ag.id} style={{borderLeft:`6px solid ${B.teal}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                      <div><div style={{fontSize:17,fontWeight:700,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>{ag.name}</div><div style={{fontSize:11,color:B.gray,marginTop:2}}>ID: {ag.id}</div></div>
                      <Pill label={`${r.length} participants`} color={B.teal}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
                      {[{l:"Total",v:r.length,c:B.teal},{l:"Complete",v:done,c:B.green},{l:"In Progress",v:r.filter(u=>{const p=getPct(u);return p>0&&p<100;}).length,c:B.orange},{l:"Avg %",v:`${avg}%`,c:B.navy}].map(s=>(
                        <div key={s.l} style={{background:B.light,borderRadius:8,padding:10,textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:B.gray}}>{s.l}</div></div>
                      ))}
                    </div>
                    <Btn onClick={()=>{setAgFilt(ag.id);setActiveTab("participants");}} color={B.teal} small>View Participants →</Btn>
                  </Card>
                );
              })}
            </div>
          )}

          {/* REPORTS */}
          {activeTab==="reports"&&(
            <div>
              <h1 style={{margin:"0 0 4px",fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>Reports & Data Export</h1>
              <div style={{color:B.gray,fontSize:13,marginBottom:20}}>Funder-ready reporting · Export anytime</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:24}}>
                {[{icon:"📊",title:"Full Participant Report",desc:"All users, completion %, quiz scores, time, outcomes",color:B.teal},{icon:"🏆",title:"Certificates Issued",desc:"Who earned certificates, dates, and certification IDs",color:B.gold},{icon:"🏠",title:"Outcome Tracking",desc:"Housing stability, violations, payment consistency",color:B.green}].map(r=>(
                  <Card key={r.title} style={{borderTop:`4px solid ${r.color}`}}>
                    <div style={{fontSize:28,marginBottom:6}}>{r.icon}</div>
                    <div style={{fontWeight:700,color:B.navy,fontSize:14,marginBottom:4}}>{r.title}</div>
                    <div style={{fontSize:12,color:B.gray,marginBottom:14,lineHeight:1.5}}>{r.desc}</div>
                    <Btn onClick={()=>exportCSV(users,cu?.role==="agency"?cu.agency:null)} color={r.color} small style={r.color===B.gold?{color:B.navy}:{}}>📥 Download CSV</Btn>
                  </Card>
                ))}
              </div>
              <Card>
                <div style={{fontWeight:700,color:B.navy,fontSize:14,marginBottom:14}}>📋 Funder Summary</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                  {[
                    {l:"Program",v:"Housing Etiquette 101 (HE101)"},
                    {l:"Organization",v:"ACH Management & Services LLC"},
                    {l:"Report Date",v:new Date().toLocaleDateString()},
                    {l:"Total Enrolled",v:Object.values(users).filter(u=>u.role==="renter").length},
                    {l:"Completed Program",v:Object.values(users).filter(u=>u.role==="renter"&&getPct(u)===100).length},
                    {l:"Average Completion",v:`${Math.round(Object.values(users).filter(u=>u.role==="renter").reduce((a,u)=>a+getPct(u),0)/Math.max(1,Object.values(users).filter(u=>u.role==="renter").length))}%`},
                    {l:"Certificates Issued",v:Object.values(users).filter(u=>u.certIssued).length},
                    {l:"Quiz Links Active",v:"8 / 8 Google Forms"},
                  ].map(s=>(
                    <div key={s.l} style={{background:B.light,borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:B.gray}}>{s.l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:B.navy}}>{s.v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ADD AGENCY TAB */}
          {activeTab==="add-agency"&&isSuper&&(
            <div>
              <h1 style={{margin:"0 0 6px",fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>➕ Add New Agency</h1>
              <p style={{color:B.gray,fontSize:13,marginBottom:20,lineHeight:1.6}}>All agencies must be approved and set up by HE101 administration before receiving access. Once added the agency can log in, add their own participants, and receive completion notifications. Billing is handled separately via invoice.</p>

              <Card style={{border:`2px solid ${B.teal}`}}>
                <div style={{fontWeight:700,color:B.teal,fontSize:15,marginBottom:16}}>New Agency Registration</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  {[
                    {label:"Organization Name *",field:"name",ph:"Full legal organization name"},
                    {label:"Primary Contact Name *",field:"contactName",ph:"Director or program manager"},
                    {label:"Email Address *",field:"email",ph:"Primary contact email"},
                    {label:"Phone Number",field:"phone",ph:"Main office phone"},
                  ].map(f=>(
                    <div key={f.field}>
                      <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                      <input value={newAgency[f.field]} onChange={e=>setNewAgency(p=>({...p,[f.field]:e.target.value}))}
                        placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>State</div>
                    <select value={newAgency.state} onChange={e=>setNewAgency(p=>({...p,state:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13}}>
                      {["IA","IL","MN","MO","NE","WI","KS","SD","ND","Other"].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>Organization Type</div>
                    <select value={newAgency.type} onChange={e=>setNewAgency(p=>({...p,type:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13}}>
                      {["nonprofit","housing_authority","transitional_housing","property_manager","coc","shelter","court","other"].map(t=>(
                        <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{background:"#E8F7F7",borderRadius:8,padding:12,marginBottom:16,fontSize:12,color:B.navy,lineHeight:1.6}}>
                  <strong>📋 After adding this agency:</strong> Create their case manager login in the Credentials tab, assign an agency ID, and send them their login credentials along with the Agency Onboarding Guide. Invoice will be generated separately at $100 per participant enrolled.
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={addAgency} style={{background:B.teal,color:"white",border:"none",borderRadius:6,padding:"11px 24px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Add Agency to System</button>
                  <button onClick={()=>setNewAgency({name:"",contactName:"",email:"",phone:"",state:"IA",type:"nonprofit"})} style={{background:"#F0F0F0",color:B.gray,border:"none",borderRadius:6,padding:"11px 20px",fontSize:13,cursor:"pointer"}}>Clear Form</button>
                </div>
              </Card>

              {/* AGENCY BILLING INFO */}
              <Card style={{marginTop:20,border:`1.5px solid ${B.orange}`}}>
                <div style={{fontWeight:700,color:B.orange,fontSize:14,marginBottom:10}}>💳 Billing & Invoice Information</div>
                <div style={{fontSize:13,color:B.navy,lineHeight:1.7}}>
                  <strong>Rate:</strong> $100 per participant enrolled through agency<br/>
                  <strong>Invoicing:</strong> Agencies are invoiced monthly based on participant count<br/>
                  <strong>Payment methods:</strong> Credit card, debit card, ACH bank transfer, or check<br/>
                  <strong>Payment terms:</strong> Net 30 — invoice due within 30 days of issue<br/>
                  <strong>Late payment:</strong> Reminder sent at 15 days, access review at 30 days past due<br/>
                  <strong>Contact for billing:</strong> housingetiquette101.org
                </div>
              </Card>
            </div>
          )}

          {/* SPONSORSHIP TAB */}
          {activeTab==="sponsorship"&&isSuper&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <h1 style={{margin:0,fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>🎯 Sponsorship Program</h1>
                <button onClick={()=>setShowAddParticipant(p=>!p)} style={{background:B.teal,color:B.white,border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  + Add Participant Manually
                </button>
              </div>

              {/* ADD PARTICIPANT MANUALLY */}
              {showAddParticipant&&(
                <Card style={{marginBottom:20,border:`2px solid ${B.teal}`}}>
                  <div style={{fontWeight:700,color:B.teal,fontSize:15,marginBottom:14}}>Add New Participant</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                    {[
                      {label:"Full Name *",field:"name",ph:"Participant full name"},
                      {label:"Email Address *",field:"email",ph:"participant@email.com"},
                      {label:"Username *",field:"username",ph:"e.g. firstname_lastname"},
                      {label:"Temporary Password *",field:"password",ph:"Create a temporary password"},
                    ].map(f=>(
                      <div key={f.field}>
                        <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                        <input value={newParticipant[f.field]} onChange={e=>setNewParticipant(p=>({...p,[f.field]:e.target.value}))}
                          placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
                      </div>
                    ))}
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>Assign to Agency *</div>
                    <select value={newParticipant.agency} onChange={e=>setNewParticipant(p=>({...p,agency:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13}}>
                      {AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={addParticipant} style={{background:B.teal,color:B.white,border:"none",borderRadius:6,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Save Participant</button>
                    <button onClick={()=>setShowAddParticipant(false)} style={{background:"#F0F0F0",color:B.gray,border:"none",borderRadius:6,padding:"10px 20px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </Card>
              )}

              {/* SPONSORSHIP OVERVIEW */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
                {[
                  {label:"Total Spots",val:"20",color:B.navy},
                  {label:"Spots Used",val:sponsorRequests.filter(r=>r.status==="approved").length,color:B.teal},
                  {label:"Pending Approval",val:sponsorRequests.filter(r=>r.status==="pending").length,color:B.orange},
                  {label:"Spots Available",val:20-sponsorRequests.filter(r=>r.status==="approved").length,color:"#2E7D32"},
                ].map(s=>(
                  <Card key={s.label} style={{textAlign:"center",padding:14}}>
                    <div style={{fontSize:28,fontWeight:900,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:11,color:B.gray,marginTop:2}}>{s.label}</div>
                  </Card>
                ))}
              </div>

              {/* SPONSORSHIP INFO */}
              <Card style={{marginBottom:20,background:"#E8F7F7",border:`1.5px solid ${B.teal}`}}>
                <div style={{fontWeight:700,color:B.teal,fontSize:14,marginBottom:8}}>About the Sponsorship Program</div>
                <div style={{fontSize:13,color:B.navy,lineHeight:1.6}}>
                  HE101 offers 20 sponsored enrollment spots for individuals referred by partner agencies. Sponsored participants complete the full 8-module program at no cost to them. All sponsored participants must be referred by a registered agency and approved by HE101 administration before receiving access. Agencies are responsible for ensuring referred individuals are appropriate candidates for the program.
                </div>
              </Card>

              {/* PENDING REQUESTS */}
              <h2 style={{fontSize:16,color:B.navy,marginBottom:12}}>Sponsorship Requests</h2>
              {sponsorRequests.length === 0 ? (
                <Card><div style={{textAlign:"center",color:B.gray,padding:20}}>No sponsorship requests yet.</div></Card>
              ) : (
                sponsorRequests.map(r=>(
                  <Card key={r.id} style={{marginBottom:12,border:`1.5px solid ${r.status==="approved"?"#2E7D32":r.status==="denied"?"#CC5500":"#E0E0E0"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:B.navy,fontSize:14,marginBottom:4}}>{r.name}</div>
                        <div style={{fontSize:12,color:B.gray,marginBottom:4}}>{r.email}</div>
                        <div style={{fontSize:12,color:B.gray,marginBottom:6}}>Agency: {AGENCIES.find(a=>a.id===r.agency)?.name || r.agency} · Submitted: {r.date}</div>
                        <div style={{fontSize:12,color:B.navy,background:"#F7F5F0",padding:"8px 12px",borderRadius:6,lineHeight:1.5}}>{r.reason}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                        {r.status==="pending"?(
                          <>
                            <button onClick={()=>approveSponsor(r.id)} style={{background:"#2E7D32",color:"white",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✅ Approve</button>
                            <button onClick={()=>denySponsor(r.id)} style={{background:B.orange,color:"white",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✗ Deny</button>
                          </>
                        ):(
                          <div style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:700,background:r.status==="approved"?"#EAF3DE":"#FCEBEB",color:r.status==="approved"?"#2E7D32":"#A32D2D"}}>
                            {r.status==="approved"?"✅ Approved":"✗ Denied"}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}

              {/* SPONSORSHIP APPLICATION FORM - for public use */}
              <h2 style={{fontSize:16,color:B.navy,margin:"24px 0 12px"}}>Sponsorship Application Form</h2>
              <Card style={{border:`1.5px solid ${B.orange}`}}>
                <div style={{fontSize:13,color:B.gray,marginBottom:14,lineHeight:1.6}}>
                  This form is for individuals referred by a registered HE101 agency partner. All applications require agency verification and administrator approval before access is granted. Self-referrals are not accepted.
                </div>
                {[
                  {label:"Full Name *",field:"name",ph:"Your full legal name"},
                  {label:"Email Address *",field:"email",ph:"Your email address"},
                  {label:"Phone Number",field:"phone",ph:"Your phone number"},
                  {label:"Referring Agency *",field:"agency",ph:"Name of the agency referring you"},
                  {label:"Reason for Application *",field:"reason",ph:"Briefly explain your housing situation and why you are applying for a sponsored spot"},
                ].map(f=>(
                  <div key={f.field} style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:B.gray,marginBottom:4}}>{f.label}</div>
                    {f.field==="reason"?(
                      <textarea value={sponsorForm[f.field]} onChange={e=>setSponsorForm(p=>({...p,[f.field]:e.target.value}))}
                        placeholder={f.ph} rows={3} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,resize:"none",boxSizing:"border-box"}}/>
                    ):(
                      <input value={sponsorForm[f.field]} onChange={e=>setSponsorForm(p=>({...p,[f.field]:e.target.value}))}
                        placeholder={f.ph} style={{width:"100%",border:"1.5px solid #E0E0E0",borderRadius:6,padding:"9px 12px",fontSize:13,boxSizing:"border-box"}}/>
                    )}
                  </div>
                ))}
                <button onClick={handleSponsorSubmit} style={{background:B.orange,color:"white",border:"none",borderRadius:6,padding:"11px 24px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
                  Submit Sponsorship Application
                </button>
              </Card>
            </div>
          )}

          {/* CREDENTIALS */}
          {activeTab==="credentials"&&isSuper&&(
            <div>
              <h1 style={{margin:"0 0 20px",fontSize:22,color:B.navy,fontFamily:"Playfair Display,Georgia,serif"}}>All Login Credentials</h1>
              <Card style={{padding:0,overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                    <thead><tr style={{background:B.navy}}>{["Name","Username","Password","Role","Agency"].map(h=><th key={h} style={{padding:"10px 14px",color:B.white,fontSize:11,fontWeight:700,textAlign:"left"}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {Object.values(users).map((u,i)=>(
                        <tr key={u.id} style={{background:i%2===0?B.white:"#F8F9FA",borderBottom:"1px solid #F0F0F0"}}>
                          <td style={{padding:"10px 14px",fontWeight:700,fontSize:13,color:B.navy}}>{u.name}</td>
                          <td style={{padding:"10px 14px"}}><code style={{background:"#F0F0F0",padding:"2px 8px",borderRadius:4,fontSize:12}}>{u.id}</code></td>
                          <td style={{padding:"10px 14px"}}><code style={{background:"#FFF3E0",padding:"2px 8px",borderRadius:4,fontSize:12}}>{u.password}</code></td>
                          <td style={{padding:"10px 14px"}}><Pill label={u.role} color={u.role==="superadmin"?B.red:u.role==="agency"?B.teal:B.green}/></td>
                          <td style={{padding:"10px 14px",fontSize:12,color:B.gray}}>{AGENCIES.find(a=>a.id===u.agency)?.name||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card style={{marginTop:4}}>
                <div style={{fontWeight:700,color:B.navy,fontSize:14,marginBottom:10}}>🔗 Google Form Quiz Links</div>
                {MODULES.map((mod,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F0F0F0",flexWrap:"wrap",gap:8}}>
                    <span style={{fontSize:13,color:B.navy,fontWeight:600}}>{mod.emoji} Module {mod.id}: {mod.title.split(" ").slice(0,4).join(" ")}…</span>
                    <a href={QUIZ_LINKS[i]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:B.teal,textDecoration:"none",fontWeight:700}}>Open Form ↗</a>
                  </div>
                ))}
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
