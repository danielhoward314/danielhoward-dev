import type { Metadata, Site, Socials } from "@types";

export const SITE: Site = {
  TITLE: "Software Interrupt",
  DESCRIPTION: "Software Interrupt is the engineering blog of Daniel Howard.",
  EMAIL: "danielhoward314@gmail.com",
  NUM_POSTS_ON_HOMEPAGE: 5,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Software Interrupt home has featured articles and projects.",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "A collection of articles on software engineering topics I am passionate about.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION:
    "A collection of my projects with links to repositories and live demos.",
};

export const SOCIALS: Socials = [
  {
    NAME: "LinkedIn",
    HREF: "https://www.linkedin.com/in/danielhoward314",
  },
  {
    NAME: "GitHub",
    HREF: "https://github.com/danielhoward314",
  },
];
