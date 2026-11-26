import { PROFILE_ABOUT, PROFILE_INTRO } from "../src/content/copy";
import type { EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput } from "../shared/index";

// Contract §8, updated by the user's CV-data ruling.
// Required legacy fallback only; never used as public project or profile content.
export const CV_SOURCE_URL = "https://gvlmxittxprtcfavasgp.supabase.co/storage/v1/object/public/resumes/cv.pdf";
export const PREVIEW_FILES: Record<string, string> = { "chat-app": "public/preview-chat.png" };

export const seedProfile: ProfileInput = {
  "name": "Yazan Mohammad",
  "headline": "AI Engineer",
  "intro": PROFILE_INTRO,
  "about": PROFILE_ABOUT,
  "location": "Jordan",
  "email": "yazan.b.n@gmail.com",
  "githubUrl": "https://github.com/YazanMohammad",
  "linkedinUrl": "https://www.linkedin.com/in/yznmoh/",
  "available": true,
  "availabilityText": null,
  "photoKey": null,
  "photoAlt": null,
  "cvKey": null
};

export const seedExperience: ExperienceInput[] = [
  {
    "position": "AI Engineer",
    "company": "MenaDevs",
    "location": null,
    "startDate": "2026-08",
    "endDate": null,
    "current": true,
    "bullets": [
      "Evaluate AI responses across coding, reasoning, Arabic-language, and instruction-following tasks; assess accuracy and quality and provide structured feedback.",
      "Review AI-generated GitHub changes against tests and repository requirements, identifying bugs and implementation gaps to support code-quality assessment."
    ],
    "isVisible": true,
    "sortOrder": 1
  },
  {
    "position": "ICDL and Networking Trainer",
    "company": "CAVT",
    "location": null,
    "startDate": "2025-12",
    "endDate": "2026-04",
    "current": false,
    "bullets": [
      "Delivered digital-skills and basic networking training, including ICDL, Ethernet crimping, and patch-panel connections."
    ],
    "isVisible": true,
    "sortOrder": 2
  },
  {
    "position": "Software Engineering Intern",
    "company": "Xocialive",
    "location": "Jordan",
    "startDate": "2024-09",
    "endDate": "2025-01",
    "current": false,
    "bullets": [
      "Built React.js features backed by ASP.NET Core and SQL Server; fixed issues across the frontend, API, and database."
    ],
    "isVisible": true,
    "sortOrder": 3
  }
];

export const seedEducation: EducationInput[] = [
  {
    "degree": "B.S. in Computer Science",
    "school": "Zarqa University",
    "location": "Zarqa, Jordan",
    "startDate": "2021-09",
    "endDate": "2024-06",
    "description": null,
    "isVisible": true,
    "sortOrder": 1
  }
];

export const seedProjects: ProjectInput[] = [
  {
    "slug": "spitfire",
    "title": "Spitfire Music Player",
    "summary": "Built an ad-free Android music player with background playback, a queue, on-device discovery, Jamendo API search and synced lyrics; covered with unit and widget tests.",
    "body": "",
    "role": null,
    "category": "Mobile",
    "technologies": [
      "Flutter",
      "Dart",
      "Riverpod",
      "go_router",
      "just_audio",
      "audio_service"
    ],
    "liveUrl": null,
    "githubUrl": "https://github.com/YazanMohammad/Spitfire",
    "imageKey": null,
    "imageAlt": null,
    "featured": true,
    "isVisible": true,
    "sortOrder": 1
  },
  {
    "slug": "zakat-calculator",
    "title": "Zakat Calculator",
    "summary": "Built an Arabic (RTL) app that calculates four types of zakat, checks nisab against live gold and silver prices from a Next.js API route, and exports PDF reports.",
    "body": "",
    "role": null,
    "category": "Web",
    "technologies": [
      "Next.js",
      "React",
      "TypeScript",
      "Tailwind CSS",
      "Netlify"
    ],
    "liveUrl": "https://zaka.yznmoh.com",
    "githubUrl": "https://github.com/YazanMohammad/zaka",
    "imageKey": null,
    "imageAlt": null,
    "featured": true,
    "isVisible": true,
    "sortOrder": 2
  },
  {
    "slug": "chat-app",
    "title": "Real-Time Chat Application",
    "summary": "Built a responsive chat app with authentication, private messaging, input validation, unread indicators and SignalR updates; used Codex and Claude coding agents during development.",
    "body": "",
    "role": null,
    "category": "Full Stack",
    "technologies": [
      "ASP.NET Core",
      "SignalR",
      "React.js",
      "JavaScript",
      "CSS"
    ],
    "liveUrl": "https://chat.yznmoh.com",
    "githubUrl": "https://github.com/YazanMohammad/ChatApp",
    "imageKey": null,
    "imageAlt": null,
    "featured": false,
    "isVisible": true,
    "sortOrder": 3
  }
];

export const seedSkills: SkillInput[] = [
  {
    "name": "Python",
    "category": "Languages",
    "iconSlug": "python",
    "isVisible": true,
    "sortOrder": 1
  },
  {
    "name": "C#",
    "category": "Languages",
    "iconSlug": "csharp",
    "isVisible": true,
    "sortOrder": 2
  },
  {
    "name": "JavaScript",
    "category": "Languages",
    "iconSlug": "javascript",
    "isVisible": true,
    "sortOrder": 3
  },
  {
    "name": "TypeScript",
    "category": "Languages",
    "iconSlug": "typescript",
    "isVisible": true,
    "sortOrder": 4
  },
  {
    "name": "SQL",
    "category": "Languages",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 5
  },
  {
    "name": "Java",
    "category": "Languages",
    "iconSlug": "java",
    "isVisible": true,
    "sortOrder": 6
  },
  {
    "name": "LLM-response evaluation",
    "category": "AI Evaluation",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 7
  },
  {
    "name": "coding and reasoning assessment",
    "category": "AI Evaluation",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 8
  },
  {
    "name": "instruction-following evaluation",
    "category": "AI Evaluation",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 9
  },
  {
    "name": "Arabic-language quality review",
    "category": "AI Evaluation",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 10
  },
  {
    "name": "prompt design",
    "category": "AI Evaluation",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 11
  },
  {
    "name": "Codex",
    "category": "AI Development Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 12
  },
  {
    "name": "Claude coding agents",
    "category": "AI Development Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 13
  },
  {
    "name": "MCP tool use for coding",
    "category": "AI Development Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 14
  },
  {
    "name": "n8n",
    "category": "AI Development Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 15
  },
  {
    "name": "REST/JSON APIs",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 16
  },
  {
    "name": "API integration",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 17
  },
  {
    "name": "ASP.NET Core",
    "category": "Backend & APIs",
    "iconSlug": "dotnet",
    "isVisible": true,
    "sortOrder": 18
  },
  {
    "name": "Entity Framework Core",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 19
  },
  {
    "name": "SQL Server",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 20
  },
  {
    "name": "JWT authentication",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 21
  },
  {
    "name": "input validation",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 22
  },
  {
    "name": "Swagger",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 23
  },
  {
    "name": "SignalR",
    "category": "Backend & APIs",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 24
  },
  {
    "name": "React.js",
    "category": "Frontend & Engineering Tools",
    "iconSlug": "react",
    "isVisible": true,
    "sortOrder": 25
  },
  {
    "name": "HTML",
    "category": "Frontend & Engineering Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 26
  },
  {
    "name": "CSS",
    "category": "Frontend & Engineering Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 27
  },
  {
    "name": "Git",
    "category": "Frontend & Engineering Tools",
    "iconSlug": "git",
    "isVisible": true,
    "sortOrder": 28
  },
  {
    "name": "Docker",
    "category": "Frontend & Engineering Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 29
  },
  {
    "name": "Linux",
    "category": "Frontend & Engineering Tools",
    "iconSlug": null,
    "isVisible": true,
    "sortOrder": 30
  }
];
