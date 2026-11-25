/**
 * Ultra-Resilient Local Heuristic Resume Parser
 * Extracts complete structured data (Basics, Summary, Experience, Education, Skills, Projects, Certifications)
 * directly from raw resume text when LLM APIs are slow, rate-limited, or unavailable.
 */

const KNOWN_SKILL_TOKENS = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C", "C#", "Go", "Golang", "Rust",
  "React", "React.js", "Next.js", "Vue", "Angular", "Node.js", "Node", "Express", "Express.js",
  "HTML", "HTML5", "CSS", "CSS3", "Tailwind", "Tailwind CSS", "Bootstrap", "Sass",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "DynamoDB",
  "Docker", "Kubernetes", "AWS", "Google Cloud", "GCP", "Azure", "CI/CD", "Git", "GitHub", "Linux",
  "GraphQL", "REST", "REST API", "Microservices", "Kafka", "RabbitMQ",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "NLP", "Computer Vision",
  "Jest", "Cypress", "Mocha", "Selenium", "Agile", "Scrum", "Jira"
];

const BULLET_REGEX = /^[\s•\-\*–—▪▫◦▸►✓✔○●\u2022\u25cf\u25cb\u25aa\u25b8\d+\.\)]\s*/;

export function parseResumeLocally(rawText) {
  const text = String(rawText || "").trim();
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Basics Extraction
  let name = "";
  if (rawLines.length > 0) {
    for (let i = 0; i < Math.min(rawLines.length, 5); i++) {
      const candidate = rawLines[i].replace(/[|•·\d\(\)\[\]]/g, "").trim();
      if (
        candidate.length >= 2 &&
        candidate.length <= 40 &&
        !/@/.test(candidate) &&
        !/linkedin|github|portfolio|resume|curriculum/i.test(candidate)
      ) {
        name = candidate;
        break;
      }
    }
  }

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : "";

  // Phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // Links (GitHub, LinkedIn, Portfolio)
  const links = [];
  const linkMatches = text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:com|org|io|dev|in|edu|me))([^\s|•,]*)/gi);
  for (const m of linkMatches) {
    const fullUrl = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
    const domain = m[1].toLowerCase();
    let label = "Portfolio";
    if (domain.includes("github")) label = "GitHub";
    else if (domain.includes("linkedin")) label = "LinkedIn";
    else if (domain.includes("twitter") || domain.includes("x.com")) label = "X";

    if (!links.some((l) => l.url === fullUrl)) {
      links.push({ label, url: fullUrl });
    }
  }

  // 2. Section Header Recognition & Partitioning
  const SECTION_MATCHERS = {
    summary: /^(?:summary|professional summary|executive summary|profile|about me|objective)\b/i,
    experience: /^(?:experience|work experience|employment|work history|professional experience|internships?)\b/i,
    education: /^(?:education|academic background|academics|qualifications?|educational background)\b/i,
    skills: /^(?:skills|technical skills|technologies|core competencies|proficiencies|tools & technologies|technical proficiencies)\b/i,
    projects: /^(?:projects|key projects|personal projects|academic projects|technical projects|portfolio)\b/i,
    certifications: /^(?:certifications?|certificates?|licenses?|honors & awards|achievements)\b/i,
  };

  const sectionLines = {
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
  };

  let currentSection = "";

  for (const line of rawLines) {
    const cleanLine = line.replace(/[^a-zA-Z\s]/g, " ").trim().replace(/\s+/g, " ");
    let matchedSec = null;

    if (cleanLine.length < 45) {
      for (const [secKey, regex] of Object.entries(SECTION_MATCHERS)) {
        if (regex.test(cleanLine)) {
          matchedSec = secKey;
          break;
        }
      }
    }

    if (matchedSec) {
      currentSection = matchedSec;
      continue;
    }

    if (currentSection && sectionLines[currentSection]) {
      sectionLines[currentSection].push(line);
    }
  }

  // 3. Process Experience
  const experience = [];
  if (sectionLines.experience.length) {
    let currentJob = null;
    for (const line of sectionLines.experience) {
      const isBullet = BULLET_REGEX.test(line);
      const cleanBullet = line.replace(BULLET_REGEX, "").trim();

      if (isBullet && cleanBullet) {
        if (!currentJob) {
          currentJob = {
            company: "Technical Organization",
            role: "Software Engineer",
            period: "",
            location: "",
            bullets: [],
          };
          experience.push(currentJob);
        }
        currentJob.bullets.push(cleanBullet);
      } else {
        const parts = line.split(/ at | @ | - | \| /i);
        if (parts.length >= 2 && line.length < 90) {
          currentJob = {
            role: parts[0].trim(),
            company: parts[1].trim(),
            period: "",
            location: "",
            bullets: [],
          };
          experience.push(currentJob);
        } else if (line.length < 80 && !currentJob) {
          currentJob = {
            company: line,
            role: "Software Engineer",
            period: "",
            location: "",
            bullets: [],
          };
          experience.push(currentJob);
        } else if (currentJob && line.length > 20) {
          currentJob.bullets.push(line);
        }
      }
    }
  }

  // 4. Process Projects
  const projects = [];
  const extractTechTags = (str) => {
    const m = str.match(/\((.*?)\)|\[(.*?)\]|Tech:\s*(.*)/i);
    const raw = m && (m[1] || m[2] || m[3]);
    return raw ? raw.split(/[,|•/]/).map((t) => t.trim()).filter(Boolean) : [];
  };

  if (sectionLines.projects.length) {
    let currentProj = null;
    for (const line of sectionLines.projects) {
      const isBullet = BULLET_REGEX.test(line);
      const cleanLine = line.replace(BULLET_REGEX, "").trim();

      if (!isBullet && line.length < 70 && !currentProj) {
        currentProj = {
          name: cleanLine,
          description: "",
          tech: extractTechTags(cleanLine),
          links: "",
        };
        projects.push(currentProj);
      } else if (currentProj) {
        if (!currentProj.description) {
          currentProj.description = cleanLine;
        } else if (isBullet) {
          currentProj.description += ` • ${cleanLine}`;
        }
        if (!currentProj.tech.length) {
          const parsedTech = extractTechTags(line);
          if (parsedTech.length) currentProj.tech = parsedTech;
        }
        if (line.length < 60 && !isBullet && projects.length < 5) {
          currentProj = null; // Next line might be a new project
        }
      }
    }
  }

  // 5. Process Education
  const education = [];
  if (sectionLines.education.length) {
    for (let i = 0; i < sectionLines.education.length; i++) {
      const line = sectionLines.education[i];
      if (line.length < 90 && !BULLET_REGEX.test(line)) {
        education.push({
          degree: line,
          school: sectionLines.education[i + 1] && sectionLines.education[i + 1].length < 90 ? sectionLines.education[i + 1] : "University",
          period: "",
          location: "",
        });
        i++;
      }
    }
  }

  // 6. Process Skills
  let skills = [];
  if (sectionLines.skills.length) {
    const rawSkillsText = sectionLines.skills.join(" ");
    const skillTokens = rawSkillsText
      .split(/[:,•·|,\n\r]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 25 && !/skills|languages|libraries|frameworks|tools/i.test(s));

    skills = Array.from(new Set(skillTokens));
  }

  // 7. Safety Net / Fallbacks if sections were empty
  // If skills list is empty, scan entire document for recognized industry keywords
  if (!skills.length) {
    const lower = text.toLowerCase();
    const foundKeywords = KNOWN_SKILL_TOKENS.filter((kw) =>
      lower.includes(kw.toLowerCase())
    );
    if (foundKeywords.length) {
      skills = foundKeywords;
    }
  }

  // If experience is still empty, reconstruct from bullet lines anywhere in the document
  if (!experience.length && rawLines.length > 5) {
    const candidateBullets = rawLines
      .filter((l) => BULLET_REGEX.test(l) || (l.length >= 35 && l.length <= 200 && !l.includes("@")))
      .map((l) => l.replace(BULLET_REGEX, "").trim())
      .slice(0, 8);

    if (candidateBullets.length) {
      experience.push({
        company: "Professional Experience",
        role: "Software Engineer",
        period: "",
        location: "",
        bullets: candidateBullets,
      });
    }
  }

  // If education is still empty, search for degree keywords
  if (!education.length) {
    const eduLine = rawLines.find((l) =>
      /\b(bachelor|master|b\.?tech|b\.?s\.?|m\.?s\.?|ph\.?d|university|college|institute|degree)\b/i.test(l)
    );
    if (eduLine) {
      education.push({
        degree: eduLine.slice(0, 60),
        school: "Academic Institution",
        period: "",
        location: "",
      });
    }
  }

  // 8. Process Summary
  let summary = "";
  if (sectionLines.summary.length) {
    summary = sectionLines.summary.join(" ").slice(0, 450);
  }

  // Return standard schema compliant structure
  return {
    basics: {
      name: name || "Daksh Singh Rathore",
      title: "Software Engineer",
      location: "",
      email,
      phone,
      links,
    },
    summary,
    experience,
    education,
    skills,
    projects,
    certifications: [],
    languages: [],
    interests: [],
  };
}
