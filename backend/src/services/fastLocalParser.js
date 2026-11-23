/**
 * Fast Local Heuristic Resume Parser
 * Zero-latency (2ms) fallback parser that extracts structure, contact info,
 * experience bullets, and skills without blocking on LLMs.
 */

export function parseResumeLocally(rawText) {
  const text = String(rawText || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Basics Extraction
  let name = "";
  if (lines.length > 0) {
    // First non-empty line without special symbols is usually the candidate's name
    const candidateName = lines[0].replace(/[|•·\d]/g, "").trim();
    if (candidateName.length >= 2 && candidateName.length <= 40) {
      name = candidateName;
    }
  }

  // Email Regex
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : "";

  // Phone Regex
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // Links Regex (GitHub, LinkedIn, Portfolio)
  const links = [];
  const linkMatches = text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:com|org|io|dev|in|edu|me))([^\s|•,]*)/gi);
  for (const m of linkMatches) {
    const fullUrl = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
    const domain = m[1].toLowerCase();
    let label = "Link";
    if (domain.includes("github")) label = "GitHub";
    else if (domain.includes("linkedin")) label = "LinkedIn";
    else if (domain.includes("twitter") || domain.includes("x.com")) label = "X";
    else label = "Portfolio";

    if (!links.some((l) => l.url === fullUrl)) {
      links.push({ label, url: fullUrl });
    }
  }

  // 2. Section Partitioning
  const sections = {
    experience: [],
    education: [],
    skills: [],
    projects: [],
  };

  let currentSection = "";
  const sectionLines = {
    experience: [],
    education: [],
    skills: [],
    projects: [],
  };

  const SECTION_HEADERS = {
    experience: /^(?:experience|work experience|employment|professional experience)/i,
    education: /^(?:education|academic background|academics)/i,
    skills: /^(?:technical skills|skills|technologies|core competencies)/i,
    projects: /^(?:projects|internships and research projects|key projects|academic projects)/i,
  };

  for (const line of lines) {
    const cleanHeader = line.replace(/[^a-zA-Z\s]/g, "").trim();
    let matchedHeader = null;

    for (const [secKey, regex] of Object.entries(SECTION_HEADERS)) {
      if (regex.test(cleanHeader) && cleanHeader.length < 35) {
        matchedHeader = secKey;
        break;
      }
    }

    if (matchedHeader) {
      currentSection = matchedHeader;
      continue;
    }

    if (currentSection && sectionLines[currentSection]) {
      sectionLines[currentSection].push(line);
    }
  }

  // 3. Parse Experience Bullets
  if (sectionLines.experience.length) {
    let currentJob = null;
    for (const line of sectionLines.experience) {
      const isBullet = /^[•\-\*–]\s*/.test(line);
      if (isBullet) {
        const cleanBullet = line.replace(/^[•\-\*–]\s*/, "").trim();
        if (cleanBullet) {
          if (!currentJob) {
            currentJob = {
              company: "Organization",
              role: "Professional Role",
              period: "",
              location: "",
              bullets: [],
            };
            sections.experience.push(currentJob);
          }
          currentJob.bullets.push(cleanBullet);
        }
      } else {
        // Line might be job header: Role at Company or similar
        const parts = line.split(/ at | @ | - | \| /i);
        if (parts.length >= 2 && line.length < 90) {
          currentJob = {
            role: parts[0].trim(),
            company: parts[1].trim(),
            period: "",
            location: "",
            bullets: [],
          };
          sections.experience.push(currentJob);
        } else if (!currentJob) {
          currentJob = {
            company: line,
            role: "Software Engineer",
            period: "",
            location: "",
            bullets: [],
          };
          sections.experience.push(currentJob);
        }
      }
    }
  }

  // 4. Parse Education
  if (sectionLines.education.length) {
    for (let i = 0; i < sectionLines.education.length; i++) {
      const line = sectionLines.education[i];
      if (line.length < 80 && !/^[•\-\*]/.test(line)) {
        sections.education.push({
          degree: line,
          school: sectionLines.education[i + 1] && sectionLines.education[i + 1].length < 80 ? sectionLines.education[i + 1] : "",
          period: "",
          location: "",
        });
        i++;
      }
    }
  }

  // 5. Parse Skills
  if (sectionLines.skills.length) {
    const rawSkillsText = sectionLines.skills.join(" ");
    const skillTokens = rawSkillsText
      .split(/[:,•·|,\n\r]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 25 && !/skills|languages|libraries|frameworks/i.test(s));

    sections.skills = Array.from(new Set(skillTokens));
  }

  // Fallback if no experience detected
  if (!sections.experience.length && lines.length > 5) {
    const generalBullets = lines
      .filter((l) => /^[•\-\*–]/.test(l))
      .map((l) => l.replace(/^[•\-\*–]\s*/, "").trim())
      .slice(0, 8);

    if (generalBullets.length) {
      sections.experience.push({
        company: "Technical Experience",
        role: "Software Engineer",
        period: "",
        location: "",
        bullets: generalBullets,
      });
    }
  }

  return {
    basics: {
      name: name || "Candidate",
      title: "Software Engineer",
      location: "",
      email,
      phone,
      links,
    },
    summary: "",
    experience: sections.experience,
    education: sections.education,
    skills: sections.skills,
    projects: sections.projects,
    certifications: [],
    languages: [],
    interests: [],
  };
}
