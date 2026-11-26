import { PROFILE_ABOUT, PROFILE_INTRO } from "../src/content/copy";
import type {
  EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput,
} from "../shared/index";

// Contract §8 seed content. Icon slugs name files in public/icons; C, SQL, EF Core and LLMs have none.
export const CV_SOURCE_URL = "https://gvlmxittxprtcfavasgp.supabase.co/storage/v1/object/public/resumes/cv.pdf";

// Paths are relative to the repository root.
export const PREVIEW_FILES: Record<string, string> = {
  "portfolio-v1": "public/preview-portfolio.png",
  "chat-app": "public/preview-chat.png",
  "tic-tac-toe": "public/preview-ttt.png",
};

export const seedProfile: ProfileInput = {
  name: "Yazan Mohammad",
  headline: "AI Engineer",
  intro: PROFILE_INTRO,
  about: PROFILE_ABOUT,
  location: "Jordan",
  email: "ybmoh03@gmail.com",
  githubUrl: "https://github.com/YazanMohammad",
  linkedinUrl: null,
  available: true,
  availabilityText: null,
  photoKey: null, // the photo slot stays empty until a photo is uploaded in the admin
  photoAlt: null,
  cvKey: null, // set by the seed when the CV could be copied
};

export const seedExperience: ExperienceInput[] = [
  { position: "AI Engineer", company: null, location: null, startDate: null, endDate: null, current: true,
    bullets: [], isVisible: true, sortOrder: 1 },
  { position: "Software Engineering Intern", company: "Xocialive", location: "Jordan",
    startDate: "2024-09", endDate: "2025-01", current: false,
    bullets: [
      "Developed and maintained web applications using React.JS, ASP.NET Core, and MS SQL Server.",
      "Worked on the backend and made slow database queries faster.",
      "Worked with the team on UI changes.",
    ], isVisible: true, sortOrder: 2 },
];

export const seedEducation: EducationInput[] = [
  { degree: "B.S. Computer Science", school: "Zarqa University", location: "Zarqa, Jordan",
    startDate: "2021-01", endDate: "2024-01", description: "GPA 76.1%", isVisible: true, sortOrder: 1 },
];

export const seedProjects: ProjectInput[] = [
  { slug: "portfolio-v1", title: "Portfolio V1",
    summary: "Personal portfolio built with Next.js 16, TypeScript and Tailwind CSS, with a custom admin dashboard backed by PostgreSQL via Supabase.",
    body: "", role: null, category: "Full Stack",
    technologies: ["Next.js 16", "TypeScript", "Tailwind CSS", "Prisma", "PostgreSQL", "Supabase"],
    liveUrl: "https://www.yznmoh.com/", githubUrl: "https://github.com/YazanMohammad/portfolio",
    imageKey: null, imageAlt: null, featured: true, isVisible: true, sortOrder: 1 },
  { slug: "chat-app", title: "Chat App",
    summary: "A real-time chat app. React frontend, ASP.NET Core backend, SignalR for live messages.",
    body: "", role: null, category: "Full Stack",
    technologies: ["React.JS", "ASP.NET Core", "SignalR", "C#"],
    liveUrl: "https://chat-app-by-me.vercel.app/", githubUrl: "https://github.com/YazanMohammad/ChatApp",
    imageKey: null, imageAlt: null, featured: true, isVisible: true, sortOrder: 2 },
  { slug: "tic-tac-toe", title: "Tic-Tac-Toe",
    summary: "A Tic-Tac-Toe game in React. It detects wins and draws and works on phones.",
    body: "", role: null, category: "Web Development",
    technologies: ["React.JS"],
    liveUrl: null, githubUrl: null, imageKey: null, imageAlt: null, featured: false, isVisible: true, sortOrder: 3 },
];

const skill = (name: string, category: string, iconSlug: string | null, sortOrder: number): SkillInput =>
  ({ name, category, iconSlug, isVisible: true, sortOrder });

export const seedSkills: SkillInput[] = [
  skill("TypeScript", "Languages", "typescript", 1),
  skill("JavaScript", "Languages", "javascript", 2),
  skill("Python", "Languages", "python", 3),
  skill("Java", "Languages", "java", 4),
  skill("C#", "Languages", "csharp", 5),
  skill("C++", "Languages", "cplusplus", 6),
  skill("C", "Languages", null, 7),
  skill("PHP", "Languages", "php", 8),
  skill("SQL", "Languages", null, 9),
  skill("React", "Frameworks", "react", 10),
  skill("ASP.NET Core", "Frameworks", "dotnet", 11),
  skill("Git", "Tools", "git", 12),
  skill("EF Core", "Tools", null, 13),
  skill("LLMs", "Technologies", null, 14),
];
