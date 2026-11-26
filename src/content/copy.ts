// All public-site copy lives here. Pure TS with no imports, so the backend seed can import
// PROFILE_INTRO and PROFILE_ABOUT by relative path.

export const PROFILE_INTRO =
  "I'm an AI Engineer in Jordan. I evaluate AI responses and review AI-generated code. I also build web and mobile apps.";

export const PROFILE_ABOUT = "I write Python, C#, JavaScript and TypeScript. At MenaDevs, I evaluate AI responses and review AI-generated GitHub changes against tests and repository requirements.\n\nAt CAVT, I taught digital skills and basic networking. During my internship at Xocialive, I built React.js features backed by ASP.NET Core and SQL Server and fixed issues across the frontend, API and database.\n\nI studied computer science at Zarqa University. My projects include an Android music player, an Arabic zakat calculator and a real-time chat application.";

export const siteCopy = {
  loading: "Loading…",
  skipLink: "Skip to content",
  menuLabel: "Menu",
  menuOpen: "Index +",
  menuClose: "Close −",
  a11y: { pauseMotion: "Pause motion", playMotion: "Play motion" },
  meta: { title: "Yazan Mohammad: AI Engineer", description: PROFILE_INTRO },
  dates: { since: "Since", until: "Until", jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec" },
  mainNavLabel: "Main",
  nav: {
    work: "Work",
    experience: "Experience",
    skills: "Skills",
    about: "About",
    contact: "Contact",
  },
  hero: {
    contentsLabel: "Project contents",
    primary: "See my work",
    secondary: "Download CV",
    emailLabel: "Email me",
    stageTitle: "Projects",
  },
  work: {
    sectionLabel: "[01] Work",
    heading: "Selected work",
    moreHeading: "More projects",
    viewProject: "See the project",
    viewCode: "See the code",
    viewLive: "See it live",
  },
  timeline: {
    sectionLabel: "[02] Experience",
    heading: "Experience and education",
    experience: "Experience",
    education: "Education",
    now: "Now",
  },
  skills: { heading: "Skills", sectionLabel: "[03] Skills" },
  about: { heading: "About", sectionLabel: "[04] About" },
  contact: {
    sectionLabel: "[05] Contact",
    website: "Website",
    invalidField: "Check this field.",
    errors: { name: "Write your name", email: "Write an email address with an @", subject: "Use a shorter subject", message: "Write a message" },
    invalidForm: "Check the fields and try again.",
    heading: "Write to me",
    lead: "I'm open to full-time roles and freelance projects.",
    labels: { name: "Name", email: "Email", subject: "Subject", message: "Message" },
    submit: "Send message",
    sending: "Sending message",
    sent: "Your message is sent. I will read it and reply by email.",
    networkError: "The message did not send. Check your connection and try again.",
    rateLimited: "Too many messages from this connection. Try again in a few minutes.",
    emailPrefix: "Or email",
  },
  project: {
    back: "See all work",
    stack: "Stack",
    role: "Role",
    links: "Links",
    notFound: {
      heading: "Project not found",
      line: "I couldn't find that project. You can find my work below.",
      action: "See all work",
    },
    loadError: "The project did not load. Reload the page to try again.",
  },
  notFound: {
    heading: "Page not found",
    line: "There's nothing at this address. My work is on the home page.",
    action: "See my work",
  },
  footer: { rights: "Yazan Mohammad. All rights reserved.", sections: "On this page", elsewhere: "Elsewhere", github: "GitHub", linkedin: "LinkedIn", email: "Email" },
};
