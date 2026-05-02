// ─── Shared MMUST Utilities ────────────────────────────────────────────────────
// Single source of truth for registration number logic used across components.

// Standard format: SIT/B/01-00001/2023
// [3-letter program]/[level B|D|C|M|P]/[2-digit campus]-[5-digit serial]/[4-digit year]
export const REG_REGEX = /^[A-Z]{3}\/[BDCMP]\/\d{2}-\d{5}\/\d{4}$/;
export const isValidReg = (r) => REG_REGEX.test(r.trim().toUpperCase());

/**
 * Auto-formats a raw user input string into the MMUST reg number format.
 * e.g. "SITb01000012023" → "SIT/B/01-00001/2023"
 */
export const formatReg = (raw) => {
  const c = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const prog   = c.slice(0, 3);
  const level  = c.slice(3, 4);
  const campus = c.slice(4, 6);
  const serial = c.slice(6, 11);
  const year   = c.slice(11, 15);

  let out = prog;
  if (level)  out += "/" + level;
  if (campus) out += "/" + campus;
  if (serial) out += "-" + serial;
  if (year)   out += "/" + year;
  return out;
};

/** Maps the 3-letter course code prefix to the official MMUST school abbreviation. */
export const SCHOOL_MAP = {
  BIT: "SCI", COM: "SCI", ETS: "SCI", ITE: "SCI", SCF: "SCI", SIK: "SCI", SIT: "SCI",
  NCN: "SONMAPS", NCG: "SONMAPS", BSN: "SONMAPS", BPN: "SONMAPS", BPM: "SONMAPS", DPN: "SONMAPS",
  MBB: "SOM", MED: "SOM",
  BCE: "SEBE", BEE: "SEBE", BME: "SEBE", BTE: "SEBE", BCT: "SEBE", BCI: "SEBE",
  DIE: "SEBE", DCE: "SEBE", DME: "SEBE",
  BAG: "SAVET", BVM: "SAVET", BFS: "SAVET", DAG: "SAVET", DFS: "SAVET",
  BCH: "SONAS", BPS: "SONAS", BBT: "SONAS", BCS: "SONAS", BMT: "SONAS", DCH: "SONAS",
  BBA: "SOBE", BAC: "SOBE", ECO: "SOBE", BCO: "SOBE", DBA: "SOBE", DBM: "SOBE", BCM: "SOBE",
  BED: "SEDU", EDS: "SEDU", EDA: "SEDU", SED: "SEDU", DED: "SEDU", BES: "SEDU",
  BAS: "SASS", SOC: "SASS", LIN: "SASS", HIS: "SASS", BAA: "SASS", BSW: "SASS",
  BPY: "SASS", DSS: "SASS", PRC: "SASS",
  BDM: "SDMHA", DDM: "SDMHA", HDM: "SDMHA",
  BPH: "SPHBST", BBM: "SPHBST", BHN: "SPHBST", DPH: "SPHBST",
};

/** Derives the school abbreviation from the registration number prefix. */
export const deriveSchoolId = (reg) => {
  const prefix = reg.split("/")[0].toUpperCase().trim();
  return SCHOOL_MAP[prefix] || "";
};

/**
 * Derives the MMUST student email from a registration number.
 * e.g. SIT/B/01-00001/2023 → sitb01-000012023@student.mmust.ac.ke
 */
export const deriveEmail = (reg) => {
  const raw = reg.trim().toUpperCase();
  const parts = raw.split("/");
  if (parts.length === 4) {
    const [program, level] = parts;
    const [campus, serial] = parts[2].split("-");
    const year = parts[3];
    return `${program}${level}${campus}-${serial}${year}@student.mmust.ac.ke`.toLowerCase();
  }
  return "";
};
