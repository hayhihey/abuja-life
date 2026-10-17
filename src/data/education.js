// ============================================================================
// ABUJA LIFE: EDUCATION & HIGHER INSTITUTIONS DIRECTORY
// Authentic Federal Capital Territory Universities, Colleges & Academies
// ============================================================================

export const EDUCATION_LEVELS = {
  ssce: { id: 'ssce', label: 'WAEC / NECO Senior Secondary Certificate', prestige: 1, baseDurationDays: 3 },
  diploma: { id: 'diploma', label: 'National Diploma / Professional Cert', prestige: 2, baseDurationDays: 4 },
  bsc: { id: 'bsc', label: 'Bachelor of Science / Arts (B.Sc / B.A / B.Eng)', prestige: 3, baseDurationDays: 7 },
  law_bl: { id: 'law_bl', label: 'Barrister-at-Law (B.L) - Bar License', prestige: 4, baseDurationDays: 6 },
  msc_mba: { id: 'msc_mba', label: 'Master of Business Admin / M.Sc', prestige: 4, baseDurationDays: 8 },
  phd: { id: 'phd', label: 'Doctor of Philosophy (Ph.D / Doctorate)', prestige: 5, baseDurationDays: 12 }
};

export const ABUJA_INSTITUTIONS = [
  {
    id: 'uniabuja',
    name: 'University of Abuja (UniAbuja)',
    campus: 'Main Campus, Airport Road, Gwagwalada',
    type: 'Federal University',
    icon: '🎓',
    bannerColor: '#15803d',
    desc: 'The prestigious federal university of the capital territory, renowned for Public Administration, Political Science, Economics, and Medicine.',
    courses: [
      {
        id: 'uniabuja_pubadmin',
        title: 'B.Sc. Public Administration & Governance',
        level: 'bsc',
        tuition: 85000,
        durationDays: 5,
        careerBoost: 'civil',
        promotionReqLevel: 3,
        bonusSalaryPercent: 35,
        steezeBonus: 10,
        cloutBonus: 15,
        desc: 'Direct requirement for Directorate-level Civil Service appointments (Grade Level 12+).'
      },
      {
        id: 'uniabuja_econ',
        title: 'B.Sc. Economics & National Development',
        level: 'bsc',
        tuition: 95000,
        durationDays: 5,
        careerBoost: 'contractor',
        promotionReqLevel: 3,
        bonusSalaryPercent: 30,
        steezeBonus: 12,
        cloutBonus: 12,
        desc: 'Understand macro-economic procurement metrics, bidding math, and federal fiscal models.'
      },
      {
        id: 'uniabuja_masters_pubadmin',
        title: 'Master of Public Policy & Administration (MPA)',
        level: 'msc_mba',
        tuition: 220000,
        durationDays: 7,
        careerBoost: 'civil',
        promotionReqLevel: 5,
        bonusSalaryPercent: 50,
        steezeBonus: 20,
        cloutBonus: 30,
        desc: 'Unlocks Permanent Secretary & Director-General cabinet consideration.'
      }
    ]
  },
  {
    id: 'baze_university',
    name: 'Baze University Abuja',
    campus: 'Plot 686 Jabi Airport Road Bypass, Cadastral Zone',
    type: 'Premier Private University',
    icon: '🏛️',
    bannerColor: '#1d4ed8',
    desc: 'Elite ultra-modern private university founded by Senator Datti Baba-Ahmed, featuring British-standard British-Nigerian dual curriculums and high-tech faculties.',
    courses: [
      {
        id: 'baze_law',
        title: 'LL.B. Commercial & Constitutional Law',
        level: 'bsc',
        tuition: 1850000,
        durationDays: 6,
        careerBoost: 'civil',
        promotionReqLevel: 4,
        bonusSalaryPercent: 45,
        steezeBonus: 25,
        cloutBonus: 25,
        desc: 'Master legal contracts, ministerial agreements, and international arbitration.'
      },
      {
        id: 'baze_cs_cyber',
        title: 'B.Sc. Software Engineering & Cybersecurity',
        level: 'bsc',
        tuition: 1650000,
        durationDays: 5,
        careerBoost: 'tech',
        promotionReqLevel: 3,
        bonusSalaryPercent: 50,
        steezeBonus: 22,
        cloutBonus: 18,
        desc: 'Deep dive into full-stack architecture, cryptographic fintech protocols, and cloud infra.'
      },
      {
        id: 'baze_executive_mba',
        title: 'Executive Master of Business Administration (EMBA)',
        level: 'msc_mba',
        tuition: 3200000,
        durationDays: 8,
        careerBoost: 'contractor',
        promotionReqLevel: 5,
        bonusSalaryPercent: 65,
        steezeBonus: 35,
        cloutBonus: 45,
        desc: 'Network with federal senators, oil executives, and multi-million-dollar concessionaires.'
      }
    ]
  },
  {
    id: 'nile_university',
    name: 'Nile University of Nigeria',
    campus: 'Plot 681 Cadastral Zone C-OO, Research & Institution Area, Jabi',
    type: 'Honoris United Universities Network',
    icon: '🏢',
    bannerColor: '#b91c1c',
    desc: 'International standard research campus renowned for Medical Sciences, Civil Engineering, Robotics, and International Relations.',
    courses: [
      {
        id: 'nile_civil_eng',
        title: 'B.Eng. Civil & Structural Engineering',
        level: 'bsc',
        tuition: 1750000,
        durationDays: 6,
        careerBoost: 'contractor',
        promotionReqLevel: 4,
        bonusSalaryPercent: 55,
        steezeBonus: 20,
        cloutBonus: 20,
        desc: 'Certified COREN syllabus prerequisite to sign off on Federal Highway and flyover projects.'
      },
      {
        id: 'nile_fintech_ai',
        title: 'M.Sc. Artificial Intelligence & Quantitative Finance',
        level: 'msc_mba',
        tuition: 2600000,
        durationDays: 7,
        careerBoost: 'tech',
        promotionReqLevel: 5,
        bonusSalaryPercent: 75,
        steezeBonus: 30,
        cloutBonus: 35,
        desc: 'Build high-frequency forex algorithmic models and automated CBN transaction pipelines.'
      }
    ]
  },
  {
    id: 'law_school_bwari',
    name: 'Nigerian Law School (Bwari Headquarters)',
    campus: 'Bwari Central, FCT Abuja',
    type: 'Federal Professional Institution',
    icon: '⚖️',
    bannerColor: '#4338ca',
    desc: 'The supreme headquarters of legal training in Nigeria. All aspiring legal luminaries must graduate here to be Called to the Nigerian Bar.',
    courses: [
      {
        id: 'law_school_bl',
        title: 'Barrister-at-Law (B.L) Qualifying Examination',
        level: 'law_bl',
        tuition: 450000,
        durationDays: 6,
        careerBoost: 'civil',
        promotionReqLevel: 4,
        bonusSalaryPercent: 60,
        steezeBonus: 30,
        cloutBonus: 40,
        desc: 'Called to the Nigerian Bar at the Supreme Court of Nigeria! Enables Senior Advocate pathway.'
      }
    ]
  },
  {
    id: 'wuse_tech_hub',
    name: 'Wuse 2 AI & Cloud Innovation Institute',
    campus: 'Adetokunbo Ademola Crescent, Wuse II',
    type: 'Silicon Wuse Technical Academy',
    icon: '💻',
    bannerColor: '#0ea5e9',
    desc: 'Fast-paced Silicon Wuse tech accelerator offering production-ready software engineering, cloud architecture, and product leadership programs.',
    courses: [
      {
        id: 'wuse_fullstack_cert',
        title: 'Production Full-Stack & Systems Architecture',
        level: 'diploma',
        tuition: 280000,
        durationDays: 4,
        careerBoost: 'tech',
        promotionReqLevel: 2,
        bonusSalaryPercent: 35,
        steezeBonus: 15,
        cloutBonus: 15,
        desc: 'Hands-on WebGL, Microservices, and Postgres database scaling.'
      },
      {
        id: 'wuse_startup_incubator',
        title: 'Venture Capital & Tech Founder Fellowship',
        level: 'diploma',
        tuition: 500000,
        durationDays: 5,
        careerBoost: 'tech',
        promotionReqLevel: 4,
        bonusSalaryPercent: 60,
        steezeBonus: 25,
        cloutBonus: 30,
        desc: 'Pitch to Pan-African VC funds and launch scalable Nigerian B2B software solutions.'
      }
    ]
  }
];

export const COURSE_BY_ID = {};
for (const inst of ABUJA_INSTITUTIONS) {
  for (const c of inst.courses) {
    COURSE_BY_ID[c.id] = { ...c, institutionName: inst.name, institutionId: inst.id, bannerColor: inst.bannerColor };
  }
}
